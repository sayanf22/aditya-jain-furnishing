// Lightweight API handlers. Each one should do a quick D1 or R2 call and
// return; waiting on D1/R2 doesn't count toward the 10 ms CPU limit, only
// the code's own work does.
import { handleEnquiry } from "../lib/enquiry";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function handleApi(request: Request, env: CloudflareEnv, pathname: string): Promise<Response> {
  if (pathname === "/api/health") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "Method not allowed" }, 405);
    }
    return json({ ok: true });
  }

  if (pathname === "/api/enquiry") {
    return handleEnquiry(request, env as unknown as Parameters<typeof handleEnquiry>[1]);
  }

  return json({ error: "Not found" }, 404);
}
