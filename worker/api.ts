// Lightweight API handlers. Each one should do a quick D1 or R2 call and
// return; waiting on D1/R2 doesn't count toward the 10 ms CPU limit, only
// the code's own work does.
//   /api/health          liveness check
//   /api/enquiry         the public enquiry form
//   /api/content/export  site build data (Bearer EXPORT_TOKEN)
//   /api/admin/*         the dashboard (worker/admin.ts)
import { handleEnquiry } from "../lib/enquiry";
import type { AdminEnv } from "../lib/server/env";
import { handleExport } from "../lib/server/export";
import { API_HEADERS } from "../lib/server/http";
import { handleAdmin } from "./admin";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: API_HEADERS });
}

export async function handleApi(request: Request, env: AdminEnv, exec: ExecutionContext, pathname: string): Promise<Response> {
  if (pathname === "/api/health") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "Method not allowed" }, 405);
    }
    return json({ ok: true });
  }
  if (pathname === "/api/enquiry") {
    return handleEnquiry(request, env);
  }
  if (pathname === "/api/content/export") {
    return handleExport(request, env, request.headers.get("CF-Connecting-IP") ?? "local");
  }
  if (pathname.startsWith("/api/admin/")) {
    return handleAdmin(request, env, exec, pathname.slice("/api/admin".length));
  }
  return json({ error: "Not found" }, 404);
}
