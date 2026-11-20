// Sign-in by an emailed code, for a forgotten password. Flow:
//   POST /auth/code/request   { email }               -> { ok: true } (same answer for every address)
//   POST /auth/code/verify    { email, code, totp? }  -> signed-in "recovery" session (or { needsCode: true })
//   POST /auth/password/reset { next }                -> new password, normal session
// Rules (OWASP Forgot Password and Authentication cheat sheets): random 6-digit code, only a keyed hash is
// stored, 10 minutes, single use, 5 wrong tries, throttled per email, per address and globally, the same
// answer whether or not the email belongs to the owner, the code is never logged, the email has no link,
// and an authenticator-app code is still required when it is on.
import type { CodeVerifyResponse, MeResponse, Ok } from "../admin-api";
import { audit } from "./audit";
import { checkNewPassword, checkSameOrigin, beginAttempt, clearAttempt, code, email, ensureNotThrottled, jsonWithCookie, limitByIp, loginKeys, meResponse, rawPassword, renewSession, startSession, USER_COLS, type UserRow } from "./auth";
import type { Ctx } from "./context";
import { PBKDF2_ITERATIONS, b64u, decryptSecret, hashPassword, pseudonym, randomBytes, safeEqual } from "./crypto";
import { codeEmail, emailAvailable, sendEmail } from "./email";
import { fail, json, parse, readJson } from "./http";
import { verifyTotp } from "./totp";

const CODE_SECONDS = 10 * 60;
const MAX_TRIES = 5;
const WINDOW = 15 * 60;
const MAX_PER_EMAIL = 3;
const MAX_PER_ADDRESS = 6;
const GLOBAL_WINDOW = 60 * 60;
const MAX_GLOBAL = 20; // Resend's free plan allows 100 emails a day

const now = () => Math.floor(Date.now() / 1000);

/** Six digits, uniformly random (no modulo bias). */
function newCode(): string {
  const limit = 4_294_000_000 - (4_294_000_000 % 1_000_000);
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

const hashCode = (c: Ctx, userId: number, value: string) => pseudonym(c.pepper, "email-code", `${userId}|${value}`);

export async function codeRequest(c: Ctx): Promise<Response> {
  checkSameOrigin(c.request);
  await limitByIp(c);
  const body = parse(await readJson(c.request), { email }, ["email"]);
  if (!emailAvailable(c.env)) throw fail(503, "EMAIL_NOT_CONFIGURED", "Email codes are not set up yet. Sign in with your password.");

  // Count this request first (parallel requests all count), then check the counters.
  const t = now();
  const keys = [await pseudonym(c.pepper, "coderq-email", body.email!), await pseudonym(c.pepper, "coderq-ip", c.ip), "global"];
  const insert = c.env.AUTH_DB.prepare("INSERT INTO email_code_requests (key_hash, at) VALUES (?1, ?2)");
  const [, , , , counts] = await c.env.AUTH_DB.batch([
    ...keys.map((k) => insert.bind(k, t)),
    c.env.AUTH_DB.prepare("DELETE FROM email_code_requests WHERE at < ?1").bind(t - 24 * 3600),
    c.env.AUTH_DB
      .prepare("SELECT key_hash, COUNT(*) AS total, SUM(at > ?2) AS recent FROM email_code_requests WHERE at > ?1 AND key_hash IN (?3, ?4, ?5) GROUP BY key_hash")
      .bind(t - GLOBAL_WINDOW, t - WINDOW, ...keys),
  ]);
  const seen = new Map((counts.results as { key_hash: string; total: number; recent: number }[]).map((r) => [r.key_hash, r]));
  const over = (seen.get(keys[0])?.recent ?? 0) > MAX_PER_EMAIL || (seen.get(keys[1])?.recent ?? 0) > MAX_PER_ADDRESS || (seen.get("global")?.total ?? 0) > MAX_GLOBAL;
  if (over) throw fail(429, "TOO_MANY_TRIES", "Too many requests. Wait a few minutes and try again.", undefined, undefined, { "Retry-After": "300" });

  const user = await c.env.AUTH_DB.prepare("SELECT id, email FROM admin_users WHERE email = ?1 AND disabled = 0").bind(body.email).first<{ id: number; email: string }>();
  // The same work happens for an unknown email, and the mail goes out after the reply, so timing shows nothing.
  const value = newCode();
  const hash = await hashCode(c, user?.id ?? 0, value);
  if (user) {
    const res = await c.env.AUTH_DB.batch([
      c.env.AUTH_DB.prepare("DELETE FROM email_codes WHERE user_id = ?1").bind(user.id),
      c.env.AUTH_DB.prepare("INSERT INTO email_codes (user_id, code_hash, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)").bind(user.id, hash, t, t + CODE_SECONDS),
    ]);
    const id = res[1].meta.last_row_id;
    c.exec.waitUntil(sendEmail(c.env, { to: user.email, ...codeEmail(value), idempotencyKey: `code-${id}-${hash.slice(0, 8)}` }).then(() => undefined));
    audit(c, "code_request", "user", user.id, undefined, { userId: user.id, email: user.email });
  } else {
    // Same two database round trips as above, so the reply takes as long for an unknown email.
    await c.env.AUTH_DB.batch([c.env.AUTH_DB.prepare("DELETE FROM email_codes WHERE user_id = ?1").bind(0), c.env.AUTH_DB.prepare("SELECT 1")]);
  }
  return json({ ok: true } satisfies Ok);
}

type CodeRow = { id: number; code_hash: string };

export async function codeVerify(c: Ctx): Promise<Response> {
  checkSameOrigin(c.request);
  await limitByIp(c);
  const body = parse(await readJson(c.request), { email, code, totp: code }, ["email", "code"]);
  const keys = await loginKeys(c, body.email!);
  await ensureNotThrottled(c, keys);
  const attempt = await beginAttempt(c, keys);

  const user = await c.env.AUTH_DB.prepare(`SELECT ${USER_COLS} FROM admin_users WHERE email = ?1 AND disabled = 0`).bind(body.email).first<UserRow>();
  const t = now();
  const row = user
    ? await c.env.AUTH_DB
        .prepare("SELECT id, code_hash FROM email_codes WHERE user_id = ?1 AND used_at IS NULL AND expires_at > ?2 AND tries < ?3 ORDER BY id DESC LIMIT 1")
        .bind(user.id, t, MAX_TRIES)
        .first<CodeRow>()
    : null;
  const candidate = await hashCode(c, user?.id ?? 0, body.code!);
  // Count the try before comparing, so parallel guesses all count against the 5.
  const counted = row
    ? (await c.env.AUTH_DB.prepare("UPDATE email_codes SET tries = tries + 1 WHERE id = ?1 AND used_at IS NULL AND tries < ?2 AND expires_at > ?3").bind(row.id, MAX_TRIES, t).run()).meta.changes > 0
    : false;
  if (!user || !row || !counted || !safeEqual(candidate, row.code_hash)) {
    audit(c, "login_failed", "user", user?.id, { reason: "email_code" }, { userId: user?.id ?? null, email: user ? user.email : `unknown:${keys[2].key.slice(0, 12)}` });
    throw fail(401, "BAD_CODE", "That code is not right or has expired.", "code");
  }

  // The authenticator app is still required: an emailed code never replaces it.
  if (user.totp_enabled === 1 && user.totp_secret) {
    if (body.totp === undefined) {
      await clearAttempt(c, attempt);
      return json({ needsCode: true } satisfies CodeVerifyResponse);
    }
    const step = await verifyTotp(await decryptSecret(c.pepper, user.totp_secret), body.totp, user.totp_last_step);
    if (step === null) {
      audit(c, "login_failed", "user", user.id, { reason: "code" }, { userId: user.id, email: user.email });
      throw fail(401, "BAD_CODE", "That authenticator code is not right.", "totp");
    }
    const used = await c.env.AUTH_DB
      .prepare("UPDATE admin_users SET totp_last_step = ?2 WHERE id = ?1 AND (totp_last_step IS NULL OR totp_last_step < ?2)")
      .bind(user.id, step)
      .run();
    if (!used.meta.changes) throw fail(401, "BAD_CODE", "That authenticator code is not right.", "totp");
  }

  // Single use: only one request can flip used_at.
  const taken = await c.env.AUTH_DB.prepare("UPDATE email_codes SET used_at = ?2 WHERE id = ?1 AND used_at IS NULL").bind(row.id, t).run();
  if (!taken.meta.changes) throw fail(401, "BAD_CODE", "That code is not right or has expired.", "code");
  await clearAttempt(c, attempt);
  await c.env.AUTH_DB.prepare("DELETE FROM email_codes WHERE user_id = ?1").bind(user.id).run();
  const { cookie, session } = await startSession(c, user.id, user.email, user.display_name, user.totp_enabled === 1, true);
  audit(c, "login_code", "user", user.id, undefined, { userId: user.id, email: user.email });
  return jsonWithCookie(meResponse(session) satisfies MeResponse, cookie);
}

/** Sets a new password after a code sign-in. Only the recovery session may call it. */
export async function passwordReset(c: Ctx): Promise<Response> {
  const s = c.session!;
  if (!s.recovery) throw fail(403, "NOT_RECOVERY", "Use Change password in Settings.");
  const body = parse(await readJson(c.request), { next: rawPassword }, ["next"]);
  await checkNewPassword(body.next!, s.email, "next");
  const salt = randomBytes(16);
  const hash = await hashPassword(c.pepper, body.next!, salt);
  await c.env.AUTH_DB.batch([
    c.env.AUTH_DB.prepare("UPDATE admin_users SET pw_salt = ?2, pw_hash = ?3, pw_iterations = ?4, password_changed_at = datetime('now') WHERE id = ?1").bind(s.userId, b64u(salt), hash, PBKDF2_ITERATIONS),
    c.env.AUTH_DB.prepare("DELETE FROM email_codes WHERE user_id = ?1").bind(s.userId),
  ]);
  audit(c, "password_reset", "user", s.userId);
  return renewSession(c, s.totpEnabled);
}
