// Dashboard sign-in: first-run setup, passwords, sessions, CSRF checks,
// throttling and the optional authenticator app (TOTP).
// Rules: docs/admin-architecture.md (OWASP Session Management, CSRF
// Prevention, Authentication and Credential Stuffing cheat sheets).
import type { AdminUser, AuthStatus, LoginResponse, MeResponse, Ok, SessionInfo, TwoFactorStart } from "../admin-api";
import { audit } from "./audit";
import type { Ctx, Session } from "./context";
import { PBKDF2_ITERATIONS, b64u, decryptSecret, encryptSecret, fromB64u, hashPassword, pseudonym, randomBytes, randomToken, safeEqual, secretOk, sha256Hex } from "./crypto";
import { fail, json, parse, readJson, text, type Rule } from "./http";
import { newTotpSecret, otpauthUri, verifyTotp } from "./totp";

export const COOKIE = "__Host-delta_admin";
const IDLE_SECONDS = 30 * 60;
const ABSOLUTE_SECONDS = 12 * 60 * 60;
const TOUCH_AFTER_SECONDS = 60;
const THROTTLE_WINDOW = 15 * 60;
const MAX_FAILS_EMAIL = 5;
const MAX_FAILS_IP = 20;
// The same email from different addresses is counted together, but with a far higher limit,
// so a stranger can lock out only their own address, not the owner.
const MAX_FAILS_EMAIL_ANY = 50;
// All wrong setup codes together, whatever the address (guessing from many addresses).
const MAX_SETUP_FAILS = 30;
const SETUP_WINDOW = 60 * 60;

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

const sessionCookie = (token: string) => `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict`;
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

// Very common long passwords (the Pwned Passwords check below covers the rest).
const COMMON = new Set(["passwordpassword", "password1234", "password12345", "123456789012", "1234567890123", "qwertyuiopas", "qwertyuiop12", "iloveyou1234", "administrator", "adminadmin1234", "welcome12345", "letmein123456", "changeme1234", "000000000000", "111111111111"]);

/** True when the password appears in the Pwned Passwords list (k-anonymity: only 5 characters of its SHA-1 leave the Worker). Fails open on a network problem. */
async function isBreached(password: string): Promise<boolean> {
  try {
    const sha1 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password))), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const res = await fetch(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(2500) });
    if (!res.ok) return false;
    const rest = sha1.slice(5);
    return (await res.text()).split("\n").some((line) => line.startsWith(rest + ":") && Number(line.split(":")[1]) > 0);
  } catch {
    return false;
  }
}

async function checkNewPassword(password: string, mail: string, field = "password"): Promise<void> {
  if (password.length < 12) throw fail(400, "WEAK_PASSWORD", "Use at least 12 characters.", field);
  if (password.length > 128) throw fail(400, "WEAK_PASSWORD", "Use at most 128 characters.", field);
  if (password.toLowerCase() === mail.toLowerCase()) throw fail(400, "WEAK_PASSWORD", "The password can't be your email.", field);
  if (COMMON.has(password.toLowerCase()) || new Set(password).size < 4 || (await isBreached(password))) {
    throw fail(400, "WEAK_PASSWORD", "That password is too common. Choose another.", field);
  }
}

// -------------------------------------------------------------- throttling

type Key = { kind: "ip" | "email"; key: string; max: number };

/** The counters one sign-in try touches: this address, this email from this address, and this email from anywhere. */
async function loginKeys(c: Ctx, mail: string): Promise<Key[]> {
  return [
    { kind: "ip", key: await pseudonym(c.pepper, "ip", c.ip), max: MAX_FAILS_IP },
    { kind: "email", key: await pseudonym(c.pepper, "email-ip", `${mail}|${c.ip}`), max: MAX_FAILS_EMAIL },
    { kind: "email", key: await pseudonym(c.pepper, "email", mail), max: MAX_FAILS_EMAIL_ANY },
  ];
}

/** Refuses with 429 when one of these counters has failed too often lately. */
async function ensureNotThrottled(c: Ctx, keys: Key[], windowSeconds = THROTTLE_WINDOW): Promise<void> {
  const since = now() - windowSeconds;
  const marks = keys.map((_, i) => `?${i + 2}`).join(", ");
  const { results } = await c.env.AUTH_DB
    .prepare(`SELECT key_hash, COUNT(*) AS n, MIN(at) AS oldest FROM login_attempts WHERE at > ?1 AND ok = 0 AND key_hash IN (${marks}) GROUP BY key_hash`)
    .bind(since, ...keys.map((k) => k.key))
    .all<{ key_hash: string; n: number; oldest: number }>();
  for (const r of results) {
    const limit = keys.find((k) => k.key === r.key_hash)?.max ?? Infinity;
    if (r.n >= limit) {
      const wait = Math.max(30, r.oldest + windowSeconds - now());
      throw fail(429, "TOO_MANY_TRIES", "Too many tries. Wait a few minutes and try again.", undefined, undefined, { "Retry-After": String(wait) });
    }
  }
}

/**
 * Writes the try down BEFORE the password is checked, so parallel guesses all
 * count. Returns the row ids; a successful try removes its own rows.
 */
async function beginAttempt(c: Ctx, keys: Key[]): Promise<number[]> {
  const t = now();
  const stmts = keys.map((k) => c.env.AUTH_DB.prepare("INSERT INTO login_attempts (kind, key_hash, at, ok) VALUES (?1, ?2, ?3, 0)").bind(k.kind, k.key, t));
  stmts.push(c.env.AUTH_DB.prepare("DELETE FROM login_attempts WHERE at < ?1").bind(t - 24 * 3600));
  const res = await c.env.AUTH_DB.batch(stmts);
  return res.slice(0, keys.length).map((r) => Number(r.meta.last_row_id));
}

async function clearAttempt(c: Ctx, ids: number[]): Promise<void> {
  await c.env.AUTH_DB.prepare("DELETE FROM login_attempts WHERE id IN (SELECT value FROM json_each(?1))").bind(JSON.stringify(ids)).run();
}
async function limitByIp(c: Ctx): Promise<void> {
  if (!c.env.LOGIN_LIMITER) {
    console.error("limiter missing: LOGIN_LIMITER");
    return;
  }
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
  const keys: Key[] = [
    { kind: "ip", key: await pseudonym(c.pepper, "setup", c.ip), max: MAX_FAILS_IP },
    { kind: "ip", key: "setup-global", max: MAX_SETUP_FAILS },
  ];
  await ensureNotThrottled(c, keys, SETUP_WINDOW);
  if (!(await authStatus(c)).setupRequired) throw fail(403, "SETUP_CLOSED", "Setup is already done.");
  const expected = c.env.SETUP_CODE;
  if (!secretOk(expected, 20)) throw fail(503, "NOT_CONFIGURED", "Setup is not available on this site yet.");
  const attempt = await beginAttempt(c, keys);
  if (!safeEqual(body.setupCode!, expected)) {
    audit(c, "setup_failed", "user", undefined, undefined, { userId: null, email: null });
    throw fail(403, "BAD_SETUP_CODE", "That setup code is not right.", "setupCode");
  }
  await clearAttempt(c, attempt);
  await checkNewPassword(body.password!, body.email!);
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
  const keys = await loginKeys(c, body.email!);
  await ensureNotThrottled(c, keys);
  const attempt = await beginAttempt(c, keys);

  const user = await c.env.AUTH_DB.prepare(`SELECT ${USER_COLS} FROM admin_users WHERE email = ?1 AND disabled = 0`).bind(body.email).first<UserRow>();
  const good = await passwordMatches(c, user, body.password!);
  if (!good || !user) {
    // A typed email that is not an account is stored only as a short pseudonym.
    audit(c, "login_failed", "user", undefined, { reason: "password" }, { userId: user?.id ?? null, email: user ? user.email : `unknown:${keys[2].key.slice(0, 12)}` });
    throw fail(401, "BAD_LOGIN", "That email or password is not right.");
  }

  if (user.totp_enabled === 1 && user.totp_secret) {
    if (body.code === undefined) {
      await clearAttempt(c, attempt); // the password was right; the code comes in the next try
      return json({ needsCode: true } satisfies LoginResponse);
    }
    const secret = await decryptSecret(c.pepper, user.totp_secret);
    const step = await verifyTotp(secret, body.code, user.totp_last_step);
    if (step === null) {
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

  await clearAttempt(c, attempt);
  // Rehash when the stored password was made with fewer rounds than today (no-op until the count is raised).
  if (user.pw_iterations < PBKDF2_ITERATIONS) {
    const salt = randomBytes(16);
    const upgraded = await hashPassword(c.pepper, body.password!, salt);
    c.exec.waitUntil(c.env.AUTH_DB.prepare("UPDATE admin_users SET pw_salt = ?2, pw_hash = ?3, pw_iterations = ?4 WHERE id = ?1").bind(user.id, b64u(salt), upgraded, PBKDF2_ITERATIONS).run().then(() => undefined));
  }
  const { cookie } = await startSession(c, user.id, user.email, user.display_name, user.totp_enabled === 1);
  const held = readCookie(c.request.headers.get("Cookie"), COOKIE);
  if (held) c.exec.waitUntil(sha256Hex(held).then((id) => c.env.AUTH_DB.prepare("DELETE FROM sessions WHERE id = ?1").bind(id).run()).then(() => undefined));
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

/** After a password or 2FA change: a new session id and CSRF token for this device, and every other session ends. */
async function renewSession(c: Ctx, totpEnabled: boolean): Promise<Response> {
  const s = c.session!;
  const { cookie, session } = await startSession(c, s.userId, s.email, s.name, totpEnabled);
  await c.env.AUTH_DB.prepare("DELETE FROM sessions WHERE user_id = ?1 AND id != ?2").bind(s.userId, session.id).run();
  return jsonWithCookie(meResponse(session), cookie);
}

export const currentUser = (c: Ctx): MeResponse => meResponse(c.session!);

export async function changePassword(c: Ctx): Promise<Response> {
  const s = c.session!;
  const body = parse(await readJson(c.request), { current: rawPassword, next: rawPassword }, ["current", "next"]);
  await limitByIp(c);
  const user = await c.env.AUTH_DB.prepare(`SELECT ${USER_COLS} FROM admin_users WHERE id = ?1`).bind(s.userId).first<UserRow>();
  const keys = await loginKeys(c, s.email);
  await ensureNotThrottled(c, keys);
  const attempt = await beginAttempt(c, keys);
  if (!(await passwordMatches(c, user, body.current!))) {
    audit(c, "password_failed", "user", s.userId);
    throw fail(403, "BAD_PASSWORD", "The current password is not right.", "current");
  }
  await clearAttempt(c, attempt);
  await checkNewPassword(body.next!, s.email, "next");
  const salt = randomBytes(16);
  const hash = await hashPassword(c.pepper, body.next!, salt);
  await c.env.AUTH_DB.prepare("UPDATE admin_users SET pw_salt = ?2, pw_hash = ?3, pw_iterations = ?4, password_changed_at = datetime('now') WHERE id = ?1").bind(s.userId, b64u(salt), hash, PBKDF2_ITERATIONS).run();
  audit(c, "password_change", "user", s.userId);
  return renewSession(c, s.totpEnabled);
}

// ------------------------------------------------------- authenticator app

export async function twoFactorStart(c: Ctx): Promise<TwoFactorStart> {
  const s = c.session!;
  if (s.totpEnabled) throw fail(409, "ALREADY_ON", "The authenticator app is already on.");
  const secret = newTotpSecret();
  await c.env.AUTH_DB.prepare("UPDATE admin_users SET totp_secret = ?2, totp_enabled = 0, totp_last_step = NULL WHERE id = ?1").bind(s.userId, await encryptSecret(c.pepper, secret)).run();
  return { secret, otpauthUri: otpauthUri(secret, s.email) };
}

export async function twoFactorEnable(c: Ctx): Promise<Response> {
  const s = c.session!;
  const body = parse(await readJson(c.request), { code }, ["code"]);
  const user = await c.env.AUTH_DB.prepare(`SELECT ${USER_COLS} FROM admin_users WHERE id = ?1`).bind(s.userId).first<UserRow>();
  if (!user?.totp_secret) throw fail(409, "NOT_STARTED", "Start the set-up first.");
  if (user.totp_enabled === 1) throw fail(409, "ALREADY_ON", "The authenticator app is already on.");
  const step = await verifyTotp(await decryptSecret(c.pepper, user.totp_secret), body.code!, null);
  if (step === null) throw fail(400, "BAD_CODE", "That code is not right.", "code");
  await c.env.AUTH_DB.prepare("UPDATE admin_users SET totp_enabled = 1, totp_last_step = ?2 WHERE id = ?1").bind(s.userId, step).run();
  audit(c, "2fa_enable", "user", s.userId);
  return renewSession(c, true);
}

export async function twoFactorDisable(c: Ctx): Promise<Response> {
  const s = c.session!;
  const body = parse(await readJson(c.request), { password: rawPassword, code }, ["password", "code"]);
  const user = await c.env.AUTH_DB.prepare(`SELECT ${USER_COLS} FROM admin_users WHERE id = ?1`).bind(s.userId).first<UserRow>();
  if (!user?.totp_secret || user.totp_enabled !== 1) throw fail(409, "NOT_ON", "The authenticator app is not on.");
  const keys = await loginKeys(c, s.email);
  await ensureNotThrottled(c, keys);
  const attempt = await beginAttempt(c, keys);
  const step = await verifyTotp(await decryptSecret(c.pepper, user.totp_secret), body.code!, user.totp_last_step);
  if (!(await passwordMatches(c, user, body.password!))) {
    throw fail(403, "BAD_PASSWORD", "The password is not right.", "password");
  }
  if (step === null) {
    throw fail(400, "BAD_CODE", "That code is not right.", "code");
  }
  await c.env.AUTH_DB.prepare("UPDATE admin_users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = NULL WHERE id = ?1").bind(s.userId).run();
  await clearAttempt(c, attempt);
  audit(c, "2fa_disable", "user", s.userId);
  return renewSession(c, false);
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
