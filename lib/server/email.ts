// Sends the sign-in code email. Provider: Resend (https://resend.com/docs/api-reference/emails/send-email).
//   POST https://api.resend.com/emails   Authorization: Bearer <RESEND_API_KEY>
//   body { from, to: [address], subject, text, html }
// Free plan: 100 emails a day, 3,000 a month, 2 requests a second. Without a verified
// domain Resend only delivers from onboarding@resend.dev to the account owner's own address.
// Local development only: when NEXTJS_ENV is "development" and DEV_EMAIL_STUB points at a
// loopback address, the mail goes to worker/dev/email-stub.mjs instead and no key is needed.
import type { AdminEnv } from "./env";

const DEFAULT_FROM = "Delta Furnishings <onboarding@resend.dev>";

/** The loopback address of the local stub, or null when it must not be used (anything but local development). */
function stubUrl(env: AdminEnv): string | null {
  if (env.NEXTJS_ENV !== "development" || !env.DEV_EMAIL_STUB) return null;
  try {
    const u = new URL(env.DEV_EMAIL_STUB);
    return u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost") ? u.origin : null;
  } catch {
    return null;
  }
}

const hasKey = (env: AdminEnv): boolean => typeof env.RESEND_API_KEY === "string" && env.RESEND_API_KEY.length >= 10 && !/change-me/i.test(env.RESEND_API_KEY);

/** True when a sign-in code can be emailed (a Resend key is set, or the local stub is on). */
export const emailAvailable = (env: AdminEnv): boolean => hasKey(env) || stubUrl(env) !== null;

export type Mail = { to: string; subject: string; text: string; html: string; idempotencyKey: string };

/** Sends one email. Resolves true when the provider accepted it. Never logs the message or the key. */
export async function sendEmail(env: AdminEnv, mail: Mail): Promise<boolean> {
  const stub = stubUrl(env);
  const url = stub ? `${stub}/emails` : "https://api.resend.com/emails";
  const headers: Record<string, string> = { "Content-Type": "application/json", "Idempotency-Key": mail.idempotencyKey };
  if (!stub) {
    if (!hasKey(env)) return false;
    headers.Authorization = `Bearer ${env.RESEND_API_KEY}`;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ from: env.RESEND_FROM || DEFAULT_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error("email not sent", res.status);
    return res.ok;
  } catch (e) {
    console.error("email not sent", e instanceof Error ? e.name : "unknown");
    return false;
  }
}

/** The sign-in code message: the code only, no links. */
export function codeEmail(code: string): Omit<Mail, "to" | "idempotencyKey"> {
  return {
    subject: "Your Delta sign-in code",
    text: `Your sign-in code is ${code}\n\nIt works for 10 minutes and only once. If you did not ask for it, ignore this email: nothing changes.\n\nDelta Furnishings`,
    html: `<div style="font-family:Arial,sans-serif;color:#1c1c1c;max-width:420px"><p style="margin:0 0 12px">Your sign-in code is</p><p style="margin:0 0 16px;font-size:30px;letter-spacing:6px;font-weight:600">${code}</p><p style="margin:0;color:#555;font-size:14px">It works for 10 minutes and only once. If you did not ask for it, ignore this email: nothing changes.</p></div>`,
  };
}
