// Enquiry form handler (agreement Â§06: customer-type dropdown, B2C or B2B;
// enquiries are viewed in the dashboard, with no email or SMS alerts).
//
// Used by worker/api.ts in production and by app/api/enquiry/route.ts under
// `next dev`. Cheap on purpose: a few string checks and one D1 insert (plus one small read), so it
// stays far below the 10 ms CPU limit.
//
// Spam protection: a hidden "website" field (bots fill it, people don't), a
// per-visitor rate limit, a same-site Origin check, and Cloudflare Turnstile
// once TURNSTILE_SECRET is set (it is left off for the local build).
import { LIMITS, validateEnquiry, type CustomerType, type EnquiryInput } from "./enquiry-rules";
import { API_HEADERS, ApiFail, parse, readBytes, text } from "./server/http";

const JSON_HEADERS = API_HEADERS;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

type EnquiryEnv = {
  /** Enquiries are private, so they live in their own database. */
  ENQ_DB: D1Database;
  /** Content database: only read, to copy the collection name onto the enquiry. */
  DB?: D1Database;
  ENQUIRY_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  TURNSTILE_SECRET?: string;
};

export async function handleEnquiry(request: Request, env: EnquiryEnv): Promise<Response> {
  try {
    return await processEnquiry(request, env);
  } catch (e) {
    console.error("enquiry error", e instanceof Error ? `${e.name}: ${e.message}` : "unknown");
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}

async function processEnquiry(request: Request, env: EnquiryEnv): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Only accept posts from this site's own pages.
  const origin = request.headers.get("Origin");
  if (request.headers.get("Sec-Fetch-Site") === "cross-site" || (origin !== null && origin !== new URL(request.url).origin)) {
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
      message: text(LIMITS.body), source: text(100), website: text(200), turnstileToken: text(2048),
    }) as Partial<EnquiryInput>; // customerType is checked by validateEnquiry
  } catch (e) {
    if (e instanceof ApiFail) return json({ error: e.status === 413 ? "Too large" : "Invalid request" }, e.status === 413 ? 413 : 400);
    return json({ error: "Invalid request" }, 400);
  }

  // Honeypot filled in: pretend it worked, store nothing.
  if (typeof input.website === "string" && input.website.trim() !== "") return json({ ok: true });

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
  await env.ENQ_DB.prepare(
    `INSERT INTO enquiries (customer_type, name, phone, company, message, category_id, category_name, source)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  )
    .bind(customerType, (input.name ?? "").trim(), phone, company, message, category?.id ?? null, category?.name ?? null, source)
    .run();

  return json({ ok: true }, 201);
}
