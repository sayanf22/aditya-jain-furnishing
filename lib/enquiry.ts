// Enquiry form handler (agreement §06: customer-type dropdown, B2C or B2B;
// enquiries are viewed in the dashboard, with no email or SMS alerts).
//
// Used by worker/api.ts in production and by app/api/enquiry/route.ts under
// `next dev`. Cheap on purpose: a few string checks and one D1 insert, so it
// stays far below the 10 ms CPU limit.
//
// Spam protection: a hidden "website" field (bots fill it, people don't), a
// per-visitor rate limit, a same-site Origin check, and Cloudflare Turnstile
// once TURNSTILE_SECRET is set (it is left off for the local build).
import { LIMITS, validateEnquiry, type CustomerType, type EnquiryInput } from "./enquiry-rules";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

type EnquiryEnv = {
  DB: D1Database;
  ENQUIRY_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  TURNSTILE_SECRET?: string;
};

export async function handleEnquiry(request: Request, env: EnquiryEnv): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Only accept posts from this site's own pages.
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return json({ error: "Forbidden" }, 403);
  }
  if (!(request.headers.get("Content-Type") ?? "").includes("application/json")) {
    return json({ error: "Expected JSON" }, 415);
  }
  if (Number(request.headers.get("Content-Length") ?? 0) > LIMITS.body) {
    return json({ error: "Too large" }, 413);
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  if (env.ENQUIRY_LIMITER) {
    const { success } = await env.ENQUIRY_LIMITER.limit({ key: `enquiry:${ip}` });
    if (!success) return json({ error: "Too many enquiries. Please try again in a minute." }, 429);
  }

  let input: Partial<EnquiryInput>;
  try {
    const text = await request.text();
    if (text.length > LIMITS.body) return json({ error: "Too large" }, 413);
    input = JSON.parse(text);
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  if (typeof input !== "object" || input === null) return json({ error: "Invalid request" }, 400);

  // Honeypot filled in: pretend it worked, store nothing.
  if (typeof input.website === "string" && input.website.trim() !== "") return json({ ok: true });

  const { errors, phone } = validateEnquiry(input);
  if (Object.keys(errors).length > 0 || !phone) return json({ error: "Please check the form.", fields: errors }, 422);

  if (env.TURNSTILE_SECRET) {
    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET);
    form.append("response", String(input.turnstileToken ?? ""));
    form.append("remoteip", ip);
    const check = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const outcome = (await check.json()) as { success?: boolean };
    if (!outcome.success) return json({ error: "Please complete the check and try again." }, 403);
  }

  const customerType = input.customerType as CustomerType;
  const company = customerType === "B2B" ? (input.company ?? "").trim().slice(0, LIMITS.company) || null : null;
  const message = (input.message ?? "").trim().slice(0, LIMITS.message) || null;
  const source = (input.source ?? "").trim().slice(0, LIMITS.source) || null;
  const interest = typeof input.interest === "string" ? input.interest.slice(0, 60) : "";

  await env.DB.prepare(
    `INSERT INTO enquiries (customer_type, name, phone, company, message, category_id, source)
     VALUES (?1, ?2, ?3, ?4, ?5, (SELECT id FROM categories WHERE slug = ?6), ?7)`,
  )
    .bind(customerType, (input.name ?? "").trim(), phone, company, message, interest, source)
    .run();

  return json({ ok: true }, 201);
}
