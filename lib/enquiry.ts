// Enquiry form handler (agreement section 06: customer-type dropdown, B2C or B2B).
// The visitor gets their confirmation on the page itself and is never emailed. The people ticked
// in the dashboard (Security -> Enquiry emails) get one email each; the enquiry also shows in the inbox.
//
// Used by worker/api.ts in production and by app/api/enquiry/route.ts under `next dev`.
// Cheap on purpose: a few string checks, one small read and one D1 insert, far below the 10 ms CPU limit.
//
// Spam and flood protection, cheapest check first:
//   1. same-site check (Origin / Fetch Metadata), JSON only, body size cap (8 KB, also when chunked)
//   2. per-visitor burst limit (5 a minute, Workers rate limiting)
//   3. strict field checks; a hidden "website" field and a minimum fill time (bots are thanked, nothing is stored)
//   4. Cloudflare Turnstile, once TURNSTILE_SECRET is set
//   5. limits kept in the database: per visitor (5 an hour, 12 a day), whole site (60 an hour, 300 a day),
//      and the same enquiry twice in a day is stored once. Visitors are stored only as a keyed hash.
import { LIMITS, validateEnquiry, type CustomerType, type EnquiryInput } from "./enquiry-rules";
import { pseudonym, secretOk, sha256Hex } from "./server/crypto";
import { API_HEADERS, ApiFail, int, parse, readBytes, text } from "./server/http";
import { notifyEnquiry } from "./server/notify";

const JSON_HEADERS = API_HEADERS;

function json(body: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: extra ? { ...JSON_HEADERS, ...extra } : JSON_HEADERS });
}

// Fastest a person can fill the form (type, name, number): quicker than this is a script.
const MIN_FILL_MS = 2000;
// Most enquiries stored: one visitor, and the whole site. Real customers stay far below these.
const CAP = { ipHour: 5, ipDay: 12, allHour: 60, allDay: 300 };

type EnquiryEnv = {
  /** Enquiries are private, so they live in their own database. */
  ENQ_DB: D1Database;
  /** Content database: only read, to copy the collection name onto the enquiry. */
  DB?: D1Database;
  ENQUIRY_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  TURNSTILE_SECRET?: string;
  /** Who gets an email about a new enquiry: the dashboard's people. */
  AUTH_DB?: D1Database;
  /** Keys the visitor hash used for the per-visitor limits (the same secret the dashboard uses). */
  SESSION_PEPPER?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  NEXTJS_ENV?: string;
  DEV_EMAIL_STUB?: string;
};
type Later = { waitUntil(promise: Promise<unknown>): void };

export async function handleEnquiry(request: Request, env: EnquiryEnv, ctx?: Later): Promise<Response> {
  try {
    return await processEnquiry(request, env, ctx);
  } catch (e) {
    console.error("enquiry error", e instanceof Error ? `${e.name}: ${e.message}` : "unknown");
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}

async function processEnquiry(request: Request, env: EnquiryEnv, ctx?: Later): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Only accept posts from this site's own pages.
  const origin = request.headers.get("Origin");
  const own = new URL(request.url);
  // Local development only: `next dev` (port 3000) forwards to the Worker (port 8787); never true in production.
  const devLoopback = (() => {
    const local = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    try {
      return origin !== null && local(own.hostname) && local(new URL(origin).hostname);
    } catch {
      return false;
    }
  })();
  const site = request.headers.get("Sec-Fetch-Site");
  if (site === "cross-site" || (origin !== null && origin !== own.origin && !devLoopback) || (origin === null && site !== "same-origin")) {
    return json({ error: "Forbidden" }, 403);
  }
  if (!(request.headers.get("Content-Type") ?? "").includes("application/json")) {
    return json({ error: "Expected JSON" }, 415);
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  if (env.ENQUIRY_LIMITER) {
    const { success } = await env.ENQUIRY_LIMITER.limit({ key: `enquiry:${ip}` });
    if (!success) return json({ error: "Too many enquiries. Please try again in a minute." }, 429);
  } else {
    console.error("limiter missing: ENQUIRY_LIMITER");
  }

  // Read at most LIMITS.body bytes (also when the body is chunked), then check every field is text of a sane size.
  let input: Partial<EnquiryInput>;
  try {
    const bytes = await readBytes(request, LIMITS.body);
    const raw: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return json({ error: "Invalid request" }, 400);
    // Wide limits here only stop abuse; the form's own limits (and their messages) are applied by validateEnquiry.
    input = parse(raw as Record<string, unknown>, {
      customerType: text(10), name: text(400), phone: text(60), company: text(600), interest: text(100),
      message: text(LIMITS.body), source: text(100), website: text(200), turnstileToken: text(2048), elapsed: int(0, 2 ** 31),
    }) as Partial<EnquiryInput>; // customerType is checked by validateEnquiry
  } catch (e) {
    if (e instanceof ApiFail) return json({ error: e.status === 413 ? "Too large" : "Invalid request" }, e.status === 413 ? 413 : 400);
    return json({ error: "Invalid request" }, 400);
  }

  // Honeypot filled in, or sent faster than a person can fill the form: pretend it worked, store nothing.
  if (typeof input.website === "string" && input.website.trim() !== "") return json({ ok: true });
  if (typeof input.elapsed !== "number" || input.elapsed < MIN_FILL_MS) return json({ ok: true });

  const { errors, phone } = validateEnquiry(input);
  if (Object.keys(errors).length > 0 || !phone) return json({ error: "Please check the form.", fields: errors }, 422);

  if (env.TURNSTILE_SECRET) {
    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET);
    form.append("response", String(input.turnstileToken ?? ""));
    form.append("remoteip", ip);
    let passed = false;
    try {
      const check = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form, signal: AbortSignal.timeout(3000) });
      passed = ((await check.json()) as { success?: boolean }).success === true;
    } catch {
      passed = false; // an unreachable check counts as failed, never as passed
    }
    if (!passed) return json({ error: "Please complete the check and try again." }, 403);
  }

  const customerType = input.customerType as CustomerType;
  const company = customerType === "B2B" ? (input.company ?? "").trim().slice(0, LIMITS.company) || null : null;
  const message = (input.message ?? "").trim().slice(0, LIMITS.message) || null;
  const source = (input.source ?? "").trim().slice(0, LIMITS.source) || null;
  const interest = (input.interest ?? "").slice(0, 60);

  // Copy the collection's name onto the enquiry, so the inbox still reads well after a rename or delete.
  let category: { id: number; name: string } | null = null;
  if (interest && env.DB) {
    try {
      category = await env.DB.prepare("SELECT id, name FROM categories WHERE slug = ?1").bind(interest).first<{ id: number; name: string }>();
    } catch {
      category = null; // the enquiry still matters more than the label
    }
  }
  const name = (input.name ?? "").trim();

  // Limits kept in the database, so they hold across every Worker instance: per visitor (hour and day),
  // for the whole site (hour and day), and the same enquiry sent twice. Visitors are stored only as a keyed hash.
  const pepper = env.SESSION_PEPPER;
  const visitor = secretOk(pepper, 32) ? await pseudonym(pepper, "enquiry-ip", ip) : null;
  const fingerprint = (visitor ? await sha256Hex(`${pepper}|${phone}|${(message ?? "").toLowerCase()}`) : null)?.slice(0, 32) ?? null;
  const seen = await env.ENQ_DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM enquiries WHERE ip_hash = ?1 AND created_at > datetime('now', '-1 hour'))  AS ip_hour,
       (SELECT COUNT(*) FROM enquiries WHERE ip_hash = ?1 AND created_at > datetime('now', '-1 day'))   AS ip_day,
       (SELECT COUNT(*) FROM enquiries WHERE created_at > datetime('now', '-1 hour'))                   AS all_hour,
       (SELECT COUNT(*) FROM enquiries WHERE created_at > datetime('now', '-1 day'))                    AS all_day,
       (SELECT COUNT(*) FROM enquiries WHERE fingerprint = ?2 AND created_at > datetime('now', '-1 day')) AS same`,
  )
    .bind(visitor ?? "", fingerprint ?? "")
    .first<{ ip_hour: number; ip_day: number; all_hour: number; all_day: number; same: number }>();
  if (seen) {
    // The same enquiry again (a double tap, a retry): thank them, store and email nothing more.
    if (fingerprint && seen.same > 0) return json({ ok: true });
    if ((visitor && (seen.ip_hour >= CAP.ipHour || seen.ip_day >= CAP.ipDay)) || seen.all_hour >= CAP.allHour || seen.all_day >= CAP.allDay) {
      return json({ error: "We have had a lot of enquiries from here. Please call or message us instead, or try again later." }, 429, { "Retry-After": "3600" });
    }
  }
  const saved = await env.ENQ_DB.prepare(
    `INSERT INTO enquiries (customer_type, name, phone, company, message, category_id, category_name, source, ip_hash, fingerprint)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
  )
    .bind(customerType, name, phone, company, message, category?.id ?? null, category?.name ?? null, source, visitor, fingerprint)
    .run();
  // Email the dashboard's people after the visitor has their answer. Never blocks or fails the form.
  if (ctx) {
    ctx.waitUntil(notifyEnquiry(env, new URL(request.url).origin, { id: Number(saved.meta.last_row_id), customerType, name, phone, company, message, categoryName: category?.name ?? null, source }));
  }

  return json({ ok: true }, 201);
}
