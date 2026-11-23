// The emailed one-time code that every sign-in needs after the password (the
// "OTP step"). Pieces (OWASP Authentication and Session Management cheat sheets):
//   - the code is 6 random digits, only a keyed hash is stored, it lives 10 minutes,
//     allows 5 wrong tries, works once, and can be sent again 3 times, 30 seconds apart;
//   - the browser holds a random challenge token (only its SHA-256 is stored), so the
//     password is not sent a second time and a code alone signs nobody in;
//   - the mail has the code only, no link.
// Switched on with the LOGIN_OTP variable ("required"). When it is required but email is
// not set up, sign-in is refused with a plain message instead of skipping the step.
import type { Ctx } from "./context";
import { pseudonym, randomToken, sha256Hex } from "./crypto";
import { codeEmail, emailAvailable, sendEmail } from "./email";
import type { AdminEnv } from "./env";
import { fail } from "./http";

export const OTP_SECONDS = 10 * 60;
export const OTP_MAX_TRIES = 5;
export const OTP_MAX_SENDS = 4; // the first mail and 3 re-sends
export const OTP_RESEND_AFTER = 30;
export const OTP_GLOBAL_PER_HOUR = 30; // Resend's free plan allows 100 emails a day

const now = () => Math.floor(Date.now() / 1000);

/** True when a sign-in needs the emailed code. */
export const otpRequired = (env: AdminEnv): boolean => env.LOGIN_OTP === "required";

/** Six digits, uniformly random (no modulo bias). */
export function newCode(): string {
  const limit = 4_294_000_000 - (4_294_000_000 % 1_000_000);
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

export const hashCode = (c: Pick<Ctx, "pepper">, userId: number, value: string) => pseudonym(c.pepper, "email-code", `${userId}|${value}`);

/** "w***@gmail.com": enough to recognise the inbox, not enough to learn the address. */
export function maskEmail(address: string): string {
  const [local, domain = ""] = address.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

/** Counts one outgoing mail against the hourly cap shared by all codes. Throws 429 when it is used up. */
export async function countMail(c: Ctx): Promise<void> {
  const t = now();
  const [, , counted] = await c.env.AUTH_DB.batch([
    c.env.AUTH_DB.prepare("INSERT INTO email_code_requests (key_hash, at) VALUES ('global', ?1)").bind(t),
    c.env.AUTH_DB.prepare("DELETE FROM email_code_requests WHERE at < ?1").bind(t - 24 * 3600),
    c.env.AUTH_DB.prepare("SELECT COUNT(*) AS n FROM email_code_requests WHERE key_hash = 'global' AND at > ?1").bind(t - 3600),
  ]);
  if (((counted.results[0] as { n: number })?.n ?? 0) > OTP_GLOBAL_PER_HOUR + 20) {
    throw fail(429, "TOO_MANY_TRIES", "Too many codes were sent. Wait a few minutes and try again.", undefined, undefined, { "Retry-After": "300" });
  }
}

/** Checks the settings before any password work: required but not possible is a clear refusal. */
export function ensureOtpPossible(env: AdminEnv): void {
  if (otpRequired(env) && !emailAvailable(env)) {
    throw fail(503, "EMAIL_NOT_CONFIGURED", "Sign-in needs an emailed code, and email is not set up yet.");
  }
}

/** Starts a challenge for a user whose password was right, emails the code, and returns the browser's token. */
export async function createChallenge(c: Ctx, user: { id: number; email: string }): Promise<{ challenge: string; sentTo: string }> {
  await countMail(c);
  const t = now();
  const token = randomToken(32);
  const value = newCode();
  const [tokenHash, codeHash] = await Promise.all([sha256Hex(token), hashCode(c, user.id, value)]);
  const res = await c.env.AUTH_DB.batch([
    c.env.AUTH_DB.prepare("DELETE FROM login_challenges WHERE user_id = ?1 OR expires_at < ?2").bind(user.id, t - 24 * 3600),
    c.env.AUTH_DB
      .prepare("INSERT INTO login_challenges (user_id, token_hash, code_hash, created_at, expires_at, last_sent_at) VALUES (?1, ?2, ?3, ?4, ?5, ?4)")
      .bind(user.id, tokenHash, codeHash, t, t + OTP_SECONDS),
  ]);
  const id = res[1].meta.last_row_id;
  // The mail goes out after the reply, so the answer takes the same time whatever the mail provider does.
  c.exec.waitUntil(sendEmail(c.env, { to: user.email, ...codeEmail(value), idempotencyKey: `login-${id}-${codeHash.slice(0, 8)}` }).then(() => undefined));
  return { challenge: token, sentTo: maskEmail(user.email) };
}
