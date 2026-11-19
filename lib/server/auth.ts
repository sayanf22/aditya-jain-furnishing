// Dashboard sign-in: first-run setup, passwords, sessions, CSRF checks,
// throttling and the optional authenticator app (TOTP).
// Rules: docs/admin-architecture.md (OWASP Session Management, CSRF
// Prevention, Authentication and Credential Stuffing cheat sheets).
import type { AdminUser, AuthStatus, LoginResponse, MeResponse, Ok, SessionInfo, TwoFactorStart } from "../admin-api";
import { audit } from "./audit";
import type { Ctx, Session } from "./context";
import { PBKDF2_ITERATIONS, b64u, decryptSecret, encryptSecret, fromB64u, hashPassword, pseudonym, randomBytes, randomToken, safeEqual, sha256Hex } from "./crypto";
import { fail, json, parse, readJson, text, type Rule } from "./http";
import { newTotpSecret, otpauthUri, verifyTotp } from "./totp";

export const COOKIE = "__Host-delta_admin";
const IDLE_SECONDS = 2 * 60 * 60;
const ABSOLUTE_SECONDS = 12 * 60 * 60;
const TOUCH_AFTER_SECONDS = 60;
const THROTTLE_WINDOW = 15 * 60;
const MAX_FAILS_EMAIL = 5;
const MAX_FAILS_IP = 20;

const now = () => Math.floor(Date.now() / 1000);
const isoOf = (unix: number) => new Date(unix * 1000).toISOString();

// ---------------------------------------------------------------- cookies

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

const sessionCookie = (token: string) => `${COOKIE}=${token}; Path=/; Max-Age=${ABSOLUTE_SECONDS}; Secure; HttpOnly; SameSite=Strict`;
export const clearedCookie = () => `${COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`;

// ------------------------------------------------------------------- CSRF

/**
 * Same-site checks for every request that changes something (OWASP CSRF
 * Prevention: Fetch Metadata + Origin). Also used, without the token, on the
 * public sign-in routes to block login CSRF.
 */
export function checkSameOrigin(request: Request): void {
  const site = request.headers.get("Sec-Fetch-Site");
  const origin = request.headers.get("Origin");
  const own = new URL(request.url).origin;
  if (site === "cross-site") throw fail(403, "CSRF", "That request was blocked.");
  if (origin !== null && origin !== own) throw fail(403, "CSRF", "That request was blocked.");
  // Without Fetch Metadata (older browsers) the Origin header must be there.
  if (site === null && origin === null) throw fail(403, "CSRF", "That request was blocked.");
  if (site === "same-site" && origin === null) throw fail(403, "CSRF", "That request was blocked.");
  // A body must be JSON or a form upload. Requests with no body (DELETE, bare POST) carry only the token.
  const hasBody = request.headers.has("Transfer-Encoding") || Number(request.headers.get("Content-Length") ?? 0) > 0;
  if (hasBody) {
    const type = (request.headers.get("Content-Type") ?? "").toLowerCase();
    if (!type.startsWith("application/json") && !type.startsWith("multipart/form-data")) throw fail(415, "BAD_CONTENT_TYPE", "That request type is not accepted.");
  }
}

export function checkCsrf(request: Request, session: Session): void {
  checkSameOrigin(request);
  const sent = request.headers.get("X-CSRF-Token") ?? "";
  if (!safeEqual(sent, session.csrf)) throw fail(403, "CSRF", "That request was blocked. Reload the page and try again.");
}

// --------------------------------------------------------------- sessions

type SessionRow = {
  id: string; user_id: number; csrf: string; created_at: number; last_seen_at: number; idle_expires_at: number; expires_at: number;
  email: string; display_name: string | null; totp_enabled: number;
};

/** The signed-in session for this request, or null. Slides the idle expiry (at most once a minute). */
export async function loadSession(c: Pick<Ctx, "request" | "env" | "exec">): Promise<Session | null> {
  const token = readCookie(c.request.headers.get("Cookie"), COOKIE);
  if (!token || token.length < 40 || token.length > 64) return null;
  const id = await sha256Hex(token);
  const row = await c.env.AUTH_DB
    .prepare(
      `SELECT s.id, s.user_id, s.csrf, s.created_at, s.last_seen_at, s.idle_expires_at, s.expires_at,
              u.email, u.display_name, u.totp_enabled
         FROM sessions s JOIN admin_users u ON u.id = s.user_id
        WHERE s.id = ?1 AND u.disabled = 0`,
    )
    .bind(id)
    .first<SessionRow>();
  if (!row) return null;
  const t = now();
  if (t >= row.idle_expires_at || t >= row.expires_at) {
    c.exec.waitUntil(c.env.AUTH_DB.prepare("DELETE FROM sessions WHERE id = ?1").bind(id).run().then(() => undefined));
    return null;
  }
  let idle = row.idle_expires_at;
  if (t - row.last_seen_at > TOUCH_AFTER_SECONDS) {
    idle = Math.min(t + IDLE_SECONDS, row.expires_at);
    c.exec.waitUntil(c.env.AUTH_DB.prepare("UPDATE sessions SET last_seen_at = ?2, idle_expires_at = ?3 WHERE id = ?1").bind(id, t, idle).run().then(() => undefined));
  }
  return {
    id, userId: row.user_id, email: row.email, name: row.display_name, totpEnabled: row.totp_enabled === 1,
    csrf: row.csrf, createdAt: row.created_at, idleExpiresAt: idle, expiresAt: row.expires_at,
  };
}

async function startSession(c: Ctx, userId: number, mail: string, name: string | null, totpEnabled = false): Promise<{ cookie: string; session: Session }> {
  const token = randomToken(32); // new on every sign-in: no fixation
  const t = now();
  const ua = (c.request.headers.get("User-Agent") ?? "").slice(0, 200);
  const id = await sha256Hex(token);
  const csrf = randomToken(24);
  await c.env.AUTH_DB.batch([
    c.env.AUTH_DB.prepare("DELETE FROM sessions WHERE expires_at < ?1 OR idle_expires_at < ?1").bind(t),
    c.env.AUTH_DB
      .prepare("INSERT INTO sessions (id, user_id, csrf, created_at, last_seen_at, idle_expires_at, expires_at, ip_hash, user_agent) VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6, ?7, ?8)")
      .bind(id, userId, csrf, t, t + IDLE_SECONDS, t + ABSOLUTE_SECONDS, await pseudonym(c.pepper, "ip", c.ip), ua),
  ]);
  const session: Session = { id, userId, email: mail, name, totpEnabled, csrf, createdAt: t, idleExpiresAt: t + IDLE_SECONDS, expiresAt: t + ABSOLUTE_SECONDS };
  return { cookie: sessionCookie(token), session };
}

function meResponse(s: Session): MeResponse {
  return {
    user: { id: s.userId, email: s.email, name: s.name, totpEnabled: s.totpEnabled } satisfies AdminUser,
    csrf: s.csrf,
    idleExpiresAt: isoOf(s.idleExpiresAt),
    expiresAt: isoOf(s.expiresAt),
  };
}

// ------------------------------------------------------------- validation

const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const email: Rule<string> = (value, field) => {
  const v = text(254, 1)(value, field).toLowerCase();
  if (!EMAIL.test(v)) throw fail(400, "INVALID", "Enter a valid email address.", field);
  return v;
};
/** Passwords are never trimmed or altered. */
const rawPassword: Rule<string> = (value, field) => {
  if (typeof value !== "string" || value.length < 1 || value.length > 128) throw fail(400, "INVALID", "Enter your password.", field);
  return value;
};
const code: Rule<string> = (value, field) => {
  if (typeof value !== "string" || !/^\d{6}$/.test(value.replace(/\s/g, ""))) throw fail(400, "INVALID", "Enter the 6-digit code.", field);
  return value.replace(/\s/g, "");
};

function checkNewPassword(password: string, mail: string, field = "password"): void {
  if (password.length < 12) throw fail(400, "WEAK_PASSWORD", "Use at least 12 characters.", field);
  if (password.length > 128) throw fail(400, "WEAK_PASSWORD", "Use at most 128 characters.", field);
  if (password.toLowerCase() === mail.toLowerCase()) throw fail(400, "WEAK_PASSWORD", "The password can't be your email.", field);
}

// -------------------------------------------------------------- throttling

/** Refuses with 429 when this email or address has failed too often lately. */
async function ensureNotThrottled(c: Ctx, emailKey: string | null, ipKey: string): Promise<void> {
  const since = now() - THROTTLE_WINDOW;
  const { results } = await c.env.AUTH_DB
    .prepare(
      `SELECT kind, COUNT(*) AS n, MIN(at) AS oldest FROM login_attempts
        WHERE at > ?1 AND ok = 0 AND ((kind = 'ip' AND key_hash = ?2) OR (kind = 'email' AND key_hash = ?3))
        GROUP BY kind`,
    )
    .bind(since, ipKey, emailKey ?? "-")
    .all<{ kind: string; n: number; oldest: number }>();
  for (const r of results) {
    if ((r.kind === "email" && r.n >= MAX_FAILS_EMAIL) || (r.kind === "ip" && r.n >= MAX_FAILS_IP)) {
      const wait = Math.max(30, r.oldest + THROTTLE_WINDOW - now());
      throw fail(429, "TOO_MANY_TRIES", "Too many tries. Wait a few minutes and try again.", undefined, undefined, { "Retry-After": String(wait) });
    }
  }
}

async function recordFailure(c: Ctx, emailKey: string | null, ipKey: string): Promise<void> {
  const t = now();
  const stmts = [c.env.AUTH_DB.prepare("INSERT INTO login_attempts (kind, key_hash, at, ok) VALUES ('ip', ?1, ?2, 0)").bind(ipKey, t)];
  if (emailKey) stmts.push(c.env.AUTH_DB.prepare("INSERT INTO login_attempts (kind, key_hash, at, ok) VALUES ('email', ?1, ?2, 0)").bind(emailKey, t));
  stmts.push(c.env.AUTH_DB.prepare("DELETE FROM login_attempts WHERE at < ?1").bind(t - 24 * 3600));
  await c.env.AUTH_DB.batch(stmts);
}

async function limitByIp(c: Ctx): Promise<void> {
  if (!c.env.LOGIN_LIMITER) return;
  const { success } = await c.env.LOGIN_LIMITER.limit({ key: `login:${c.ip}` });
  if (!success) throw fail(429, "TOO_MANY_TRIES", "Too many tries. Wait a minute and try again.", undefined, undefined, { "Retry-After": "60" });
}

// ---------------------------------------------------------------- handlers

type UserRow = {
  id: number; email: string; display_name: string | null; pw_salt: string; pw_hash: string; pw_iterations: number;
  totp_secret: string | null; totp_enabled: number; totp_last_step: number | null;
};
const USER_COLS = "id, email, display_name, pw_salt, pw_hash, pw_iterations, totp_secret, totp_enabled, totp_last_step";

// A fixed salt: unknown emails still cost one password hash, so timing doesn't show which emails exist.
const DUMMY_SALT = new Uint8Array(16);

async function passwordMatches(c: Ctx, user: UserRow | null, password: string): Promise<boolean> {
  if (!user) {
    await hashPassword(c.pepper, password, DUMMY_SALT);
    return false;
  }
  const candidate = await hashPassword(c.pepper, password, fromB64u(user.pw_salt), user.pw_iterations);
  return safeEqual(candidate, user.pw_hash);
}

export async function authStatus(c: Ctx): Promise<AuthStatus> {
  const row = await c.env.AUTH_DB.prepare("SELECT COUNT(*) AS n FROM admin_users").first<{ n: number }>();
  return { setupRequired: (row?.n ?? 0) === 0 };
}

export async function setup(c: Ctx): Promise<Response> {
  checkSameOrigin(c.request);
  await limitByIp(c);
  const body = parse(await readJson(c.request), { setupCode: text(200, 1), email, name: text(80), password: rawPassword }, ["setupCode", "email", "password"]);
  const ipKey = await pseudonym(c.pepper, "setup", c.ip);
  await ensureNotThrottled(c, null, ipKey);
  if (!(await authStatus(c)).setupRequired) throw fail(403, "SETUP_CLOSED", "Setup is already done.");
  const expected = c.env.SETUP_CODE ?? "";
  if (expected.length < 8) throw fail(503, "NOT_CONFIGURED", "Setup is not available on this site yet.");
  if (!safeEqual(body.setupCode!, expected)) {
    await recordFailure(c, null, ipKey);
    audit(c, "setup_failed", "user", undefined, undefined, { userId: null, email: null });
    throw fail(403, "BAD_SETUP_CODE", "That setup code is not right.", "setupCode");
  }
  checkNewPassword(body.password!, body.email!);
  const salt = randomBytes(16);
  const hash = await hashPassword(c.pepper, body.password!, salt);
  // The WHERE NOT EXISTS makes "only while no user exists" atomic.
  const res = await c.env.AUTH_DB
    .prepare(
      `INSERT INTO admin_users (email, display_name, pw_salt, pw_hash, pw_iterations)
       SELECT ?1, ?2, ?3, ?4, ?5 WHERE NOT EXISTS (SELECT 1 FROM admin_users)`,
    )
    .bind(body.email, body.name || null, b64u(salt), hash, PBKDF2_ITERATIONS)
    .run();
  if (!res.meta.changes) throw fail(403, "SETUP_CLOSED", "Setup is already done.");
  const user = await c.env.AUTH_DB.prepare(`SELECT ${USER_COLS} FROM admin_users WHERE email = ?1`).bind(body.email).first<UserRow>();
  const { cookie, session } = await startSession(c, user!.id, user!.email, user!.display_name);
  audit(c, "setup", "user", user!.id, undefined, { userId: user!.id, email: user!.email });
  return jsonWithCookie(meResponse(session), cookie);
}

function jsonWithCookie(body: unknown, cookie: string, status = 200): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export async function login(c: Ctx): Promise<Response> {
  checkSameOrigin(c.request);
  await limitByIp(c);
  const body = parse(await readJson(c.request), { email, password: rawPassword, code }, ["email", "password"]);
  const emailKey = await pseudonym(c.pepper, "email", body.email!);
  const ipKey = await pseudonym(c.pepper, "ip", c.ip);
  await ensureNotThrottled(c, emailKey, ipKey);

  const user = await c.env.AUTH_DB.prepare(`SELECT ${USER_COLS} FROM admin_users WHERE email = ?1 AND disabled = 0`).bind(body.email).first<UserRow>();
  const good = await passwordMatches(c, user, body.password!);
  if (!good || !user) {
    await recordFailure(c, emailKey, ipKey);
    audit(c, "login_failed", "user", undefined, { reason: "password" }, { userId: user?.id ?? null, email: body.email! });
    throw fail(401, "BAD_LOGIN", "That email or password is not right.");
  }

  if (user.totp_enabled === 1 && user.totp_secret) {
    if (body.code === undefined) return json({ needsCode: true } satisfies LoginResponse);
    const secret = await decryptSecret(c.pepper, user.totp_secret);
    const step = await verifyTotp(secret, body.code, user.totp_last_step);
    if (step === null) {
      await recordFailure(c, emailKey, ipKey);
      audit(c, "login_failed", "user", user.id, { reason: "code" }, { userId: user.id, email: user.email });
      throw fail(401, "BAD_CODE", "That code is not right.", "code");
    }
    // Only a later step than the last accepted one passes, so a code works once.
    const used = await c.env.AUTH_DB
      .prepare("UPDATE admin_users SET totp_last_step = ?2 WHERE id = ?1 AND (totp_last_step IS NULL OR totp_last_step < ?2)")
      .bind(user.id, step)
      .run();
    if (!used.meta.changes) throw fail(401, "BAD_CODE", "That code is not right.", "code");
  }

  const { cookie } = await startSession(c, user.id, user.email, user.display_name, user.totp_enabled === 1);
  c.exec.waitUntil(c.env.AUTH_DB.prepare("UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?1").bind(user.id).run().then(() => undefined));
  audit(c, "login", "user", user.id, undefined, { userId: user.id, email: user.email });
  return jsonWithCookie({ ok: true } satisfies LoginResponse, cookie);
}

export async function logout(c: Ctx): Promise<Response> {
  const s = c.session!;
  await c.env.AUTH_DB.prepare("DELETE FROM sessions WHERE id = ?1").bind(s.id).run();
  audit(c, "logout", "user", s.userId);
  return jsonWithCookie({ ok: true } satisfies Ok, clearedCookie());
}

export const currentUser = (c: Ctx): MeResponse => meResponse(c.session!);

export async function changePassword(c: Ctx): Promise<Ok> {
  const s = c.session!;
  const body = parse(await readJson(c.request), { current: rawPassword, next: rawPassword }, ["current", "next"]);
  await limitByIp(c);
  const user = await c.env.AUTH_DB.prepare(`SELECT ${USER_COLS} FROM admin_users WHERE id = ?1`).bind(s.userId).first<UserRow>();
  const ipKey = await pseudonym(c.pepper, "ip", c.ip);
  await ensureNotThrottled(c, await pseudonym(c.pepper, "email", s.email), ipKey);
  if (!(await passwordMatches(c, user, body.current!))) {
    await recordFailure(c, await pseudonym(c.pepper, "email", s.email), ipKey);
    audit(c, "password_failed", "user", s.userId);
    throw fail(403, "BAD_PASSWORD", "The current password is not right.", "current");
  }
  checkNewPassword(body.next!, s.email, "next");
  const salt = randomBytes(16);
  const hash = await hashPassword(c.pepper, body.next!, salt);
  await c.env.AUTH_DB.batch([
    c.env.AUTH_DB.prepare("UPDATE admin_users SET pw_salt = ?2, pw_hash = ?3, pw_iterations = ?4, password_changed_at = datetime('now') WHERE id = ?1").bind(s.userId, b64u(salt), hash, PBKDF2_ITERATIONS),
    c.env.AUTH_DB.prepare("DELETE FROM sessions WHERE user_id = ?1 AND id != ?2").bind(s.userId, s.id),
  ]);
  audit(c, "password_change", "user", s.userId);
  return { ok: true };
}

// ------------------------------------------------------- authenticator app

export async function twoFactorStart(c: Ctx): Promise<TwoFactorStart> {
  const s = c.session!;
  if (s.totpEnabled) throw fail(409, "ALREADY_ON", "The authenticator app is already on.");
  const secret = newTotpSecret();
  await c.env.AUTH_DB.prepare("UPDATE admin_users SET totp_secret = ?2, totp_enabled = 0, totp_last_step = NULL WHERE id = ?1").bind(s.userId, await encryptSecret(c.pepper, secret)).run();
  return { secret, otpauthUri: otpauthUri(secret, s.email) };
}

export async function twoFactorEnable(c: Ctx): Promise<Ok> {
  const s = c.session!;
  const body = parse(await readJson(c.request), { code }, ["code"]);
  const user = await c.env.AUTH_DB.prepare(`SELECT ${USER_COLS} FROM admin_users WHERE id = ?1`).bind(s.userId).first<UserRow>();
  if (!user?.totp_secret) throw fail(409, "NOT_STARTED", "Start the set-up first.");
  if (user.totp_enabled === 1) throw fail(409, "ALREADY_ON", "The authenticator app is already on.");
  const step = await verifyTotp(await decryptSecret(c.pepper, user.totp_secret), body.code!, null);
  if (step === null) throw fail(400, "BAD_CODE", "That code is not right.", "code");
  await c.env.AUTH_DB.prepare("UPDATE admin_users SET totp_enabled = 1, totp_last_step = ?2 WHERE id = ?1").bind(s.userId, step).run();
  audit(c, "2fa_enable", "user", s.userId);
  return { ok: true };
}

export async function twoFactorDisable(c: Ctx): Promise<Ok> {
  const s = c.session!;
  const body = parse(await readJson(c.request), { password: rawPassword, code }, ["password", "code"]);
  const user = await c.env.AUTH_DB.prepare(`SELECT ${USER_COLS} FROM admin_users WHERE id = ?1`).bind(s.userId).first<UserRow>();
  if (!user?.totp_secret || user.totp_enabled !== 1) throw fail(409, "NOT_ON", "The authenticator app is not on.");
  const ipKey = await pseudonym(c.pepper, "ip", c.ip);
  const emailKey = await pseudonym(c.pepper, "email", s.email);
  await ensureNotThrottled(c, emailKey, ipKey);
  const step = await verifyTotp(await decryptSecret(c.pepper, user.totp_secret), body.code!, user.totp_last_step);
  if (!(await passwordMatches(c, user, body.password!))) {
    await recordFailure(c, emailKey, ipKey);
    throw fail(403, "BAD_PASSWORD", "The password is not right.", "password");
  }
  if (step === null) {
    await recordFailure(c, emailKey, ipKey);
    throw fail(400, "BAD_CODE", "That code is not right.", "code");
  }
  await c.env.AUTH_DB.prepare("UPDATE admin_users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = NULL WHERE id = ?1").bind(s.userId).run();
  audit(c, "2fa_disable", "user", s.userId);
  return { ok: true };
}

// ---------------------------------------------------------------- devices

function describeDevice(ua: string | null): string {
  const u = ua ?? "";
  const browser = /Edg\//.test(u) ? "Edge" : /OPR\//.test(u) ? "Opera" : /Firefox\//.test(u) ? "Firefox" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : "Browser";
  const os = /Windows/.test(u) ? "Windows" : /Android/.test(u) ? "Android" : /iPhone|iPad|iOS/.test(u) ? "iOS" : /Mac OS X|Macintosh/.test(u) ? "Mac" : /Linux/.test(u) ? "Linux" : "device";
  return `${browser} on ${os}`;
}

export async function listSessions(c: Ctx): Promise<{ items: SessionInfo[] }> {
  const s = c.session!;
  const { results } = await c.env.AUTH_DB
    .prepare("SELECT id, created_at, last_seen_at, user_agent FROM sessions WHERE user_id = ?1 AND expires_at > ?2 AND idle_expires_at > ?2 ORDER BY last_seen_at DESC")
    .bind(s.userId, now())
    .all<{ id: string; created_at: number; last_seen_at: number; user_agent: string | null }>();
  return {
    items: results.map((r) => ({
      id: r.id.slice(0, 16),
      current: r.id === s.id,
      createdAt: isoOf(r.created_at),
      lastSeenAt: isoOf(r.last_seen_at),
      device: describeDevice(r.user_agent),
    })),
  };
}

export async function endSession(c: Ctx): Promise<Ok> {
  const s = c.session!;
  const which = c.params[0];
  if (which === "others") {
    await c.env.AUTH_DB.prepare("DELETE FROM sessions WHERE user_id = ?1 AND id != ?2").bind(s.userId, s.id).run();
    audit(c, "sessions_end_others", "user", s.userId);
    return { ok: true };
  }
  if (!/^[0-9a-f]{16}$/.test(which)) throw fail(404, "NOT_FOUND", "That device was not found.");
  if (s.id.startsWith(which)) throw fail(400, "CURRENT_SESSION", "That is this device. Use sign out instead.");
  const res = await c.env.AUTH_DB.prepare("DELETE FROM sessions WHERE user_id = ?1 AND substr(id, 1, 16) = ?2 AND id != ?3").bind(s.userId, which, s.id).run();
  if (!res.meta.changes) throw fail(404, "NOT_FOUND", "That device was not found.");
  audit(c, "session_end", "user", s.userId);
  return { ok: true };
}
