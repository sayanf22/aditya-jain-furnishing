// The second step of every sign-in: the emailed code (see ./challenge.ts for the rules).
//   POST /auth/login/verify  { challenge, code }  -> signed in (cookie set)
//   POST /auth/login/resend  { challenge }        -> { ok: true }, a new code is emailed
import type { Ok, LoginResponse } from "../admin-api";
import { audit } from "./audit";
import { COOKIE, checkSameOrigin, code, jsonWithCookie, limitByIp, readCookie, startSession } from "./auth";
import { OTP_MAX_SENDS, OTP_MAX_TRIES, OTP_RESEND_AFTER, OTP_SECONDS, countMail, ensureOtpPossible, hashCode, newCode } from "./challenge";
import type { Ctx } from "./context";
import { safeEqual, sha256Hex } from "./crypto";
import { codeEmail, sendEmail } from "./email";
import { fail, json, parse, readJson, text } from "./http";

const now = () => Math.floor(Date.now() / 1000);
const BAD = () => fail(401, "BAD_CODE", "That code is not right or has expired.", "code");

type Row = { id: number; code_hash: string; user_id: number; email: string; display_name: string | null; totp_enabled: number; sends: number; last_sent_at: number };
const SELECT = "SELECT c.id, c.code_hash, c.user_id, c.sends, c.last_sent_at, u.email, u.display_name, u.totp_enabled FROM login_challenges c JOIN admin_users u ON u.id = c.user_id";

export async function loginVerify(c: Ctx): Promise<Response> {
  checkSameOrigin(c.request);
  await limitByIp(c);
  ensureOtpPossible(c.env);
  const body = parse(await readJson(c.request), { challenge: text(200, 20), code }, ["challenge", "code"]);
  const t = now();
  const tokenHash = await sha256Hex(body.challenge!);
  const row = await c.env.AUTH_DB
    .prepare(`${SELECT} WHERE c.token_hash = ?1 AND c.used_at IS NULL AND c.expires_at > ?2 AND c.tries < ?3 AND u.disabled = 0`)
    .bind(tokenHash, t, OTP_MAX_TRIES)
    .first<Row>();
  const candidate = await hashCode(c, row?.user_id ?? 0, body.code!);
  // The try is counted before the comparison, so parallel guesses all count against the 5.
  const counted = row
    ? (await c.env.AUTH_DB.prepare("UPDATE login_challenges SET tries = tries + 1 WHERE id = ?1 AND used_at IS NULL AND tries < ?2 AND expires_at > ?3").bind(row.id, OTP_MAX_TRIES, t).run()).meta.changes > 0
    : false;
  if (!row || !counted || !safeEqual(candidate, row.code_hash)) {
    audit(c, "login_failed", "user", row?.user_id, { reason: "otp" }, { userId: row?.user_id ?? null, email: row?.email ?? "unknown" });
    throw BAD();
  }
  // Single use: only one request can flip used_at.
  const taken = await c.env.AUTH_DB.prepare("UPDATE login_challenges SET used_at = ?2 WHERE id = ?1 AND used_at IS NULL").bind(row.id, t).run();
  if (!taken.meta.changes) throw BAD();
  await c.env.AUTH_DB.prepare("DELETE FROM login_challenges WHERE user_id = ?1").bind(row.user_id).run();

  const { cookie } = await startSession(c, row.user_id, row.email, row.display_name, row.totp_enabled === 1);
  const held = readCookie(c.request.headers.get("Cookie"), COOKIE);
  if (held) c.exec.waitUntil(sha256Hex(held).then((id) => c.env.AUTH_DB.prepare("DELETE FROM sessions WHERE id = ?1").bind(id).run()).then(() => undefined));
  c.exec.waitUntil(c.env.AUTH_DB.prepare("UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?1").bind(row.user_id).run().then(() => undefined));
  audit(c, "login", "user", row.user_id, { step: "otp" }, { userId: row.user_id, email: row.email });
  return jsonWithCookie({ ok: true } satisfies LoginResponse, cookie);
}

export async function loginResend(c: Ctx): Promise<Response> {
  checkSameOrigin(c.request);
  await limitByIp(c);
  ensureOtpPossible(c.env);
  const body = parse(await readJson(c.request), { challenge: text(200, 20) }, ["challenge"]);
  const t = now();
  const row = await c.env.AUTH_DB
    .prepare(`${SELECT} WHERE c.token_hash = ?1 AND c.used_at IS NULL AND c.expires_at > ?2 AND u.disabled = 0`)
    .bind(await sha256Hex(body.challenge!), t)
    .first<Row>();
  if (!row) throw fail(401, "BAD_CODE", "This sign-in has expired. Start again.", "code");
  if (row.sends >= OTP_MAX_SENDS) throw fail(429, "TOO_MANY_TRIES", "No more codes can be sent for this sign-in. Start again.", "code");
  const wait = row.last_sent_at + OTP_RESEND_AFTER - t;
  if (wait > 0) throw fail(429, "TOO_MANY_TRIES", `Wait ${wait} seconds before asking for another code.`, "code", undefined, { "Retry-After": String(wait) });
  await countMail(c);

  const value = newCode();
  const hash = await hashCode(c, row.user_id, value);
  // The new code starts a fresh set of 5 tries and 10 minutes; the re-send count is not reset.
  const updated = await c.env.AUTH_DB
    .prepare("UPDATE login_challenges SET code_hash = ?2, tries = 0, sends = sends + 1, last_sent_at = ?3, expires_at = ?4 WHERE id = ?1 AND used_at IS NULL AND sends < ?5 AND last_sent_at <= ?6")
    .bind(row.id, hash, t, t + OTP_SECONDS, OTP_MAX_SENDS, t - OTP_RESEND_AFTER)
    .run();
  if (!updated.meta.changes) throw fail(429, "TOO_MANY_TRIES", "Wait a few seconds before asking for another code.", "code", undefined, { "Retry-After": "30" });
  c.exec.waitUntil(sendEmail(c.env, { to: row.email, ...codeEmail(value), idempotencyKey: `login-${row.id}-${hash.slice(0, 8)}` }).then(() => undefined));
  audit(c, "login_code_resent", "user", row.user_id, undefined, { userId: row.user_id, email: row.email });
  return json({ ok: true } satisfies Ok);
}
