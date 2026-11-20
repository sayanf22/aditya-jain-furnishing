// Dashboard API router: /api/admin/*. Every route is listed once, below.
// Order of checks: configured -> per-address rate limit -> route -> session
// -> CSRF (changes only) -> handler. The handler list mirrors lib/admin-api.ts.
import * as auth from "../lib/server/auth";
import * as catalogue from "../lib/server/catalogue";
import type { Ctx } from "../lib/server/context";
import type { AdminEnv } from "../lib/server/env";
import * as enquiries from "../lib/server/enquiries";
import { API_HEADERS, ApiFail, errorResponse, fail, json } from "../lib/server/http";
import * as media from "../lib/server/media";
import * as products from "../lib/server/products";
import * as publish from "../lib/server/publish";
import * as site from "../lib/server/site";
import { listAudit } from "../lib/server/audit";
import { secretOk } from "../lib/server/crypto";

type Handler = (c: Ctx) => Promise<unknown>;
type Route = { method: string; re: RegExp; handler: Handler; open: boolean };

/** `open` routes work without a session (sign-in and setup). */
function route(method: string, pattern: string, handler: Handler, open = false): Route {
  return { method, re: new RegExp(`^${pattern.replace(/:\w+/g, "([^/]+)")}$`), handler, open };
}

const ROUTES: Route[] = [
  route("GET", "/auth/status", auth.authStatus, true),
  route("POST", "/auth/setup", auth.setup, true),
  route("POST", "/auth/login", auth.login, true),
  route("POST", "/auth/logout", auth.logout),
  route("GET", "/me", async (c) => auth.currentUser(c)),
  route("POST", "/auth/password", auth.changePassword),
  route("POST", "/auth/2fa/start", auth.twoFactorStart),
  route("POST", "/auth/2fa/enable", auth.twoFactorEnable),
  route("POST", "/auth/2fa/disable", auth.twoFactorDisable),
  route("GET", "/sessions", auth.listSessions),
  route("DELETE", "/sessions/:id", auth.endSession),

  route("GET", "/catalogue", catalogue.getCatalogue),
  route("POST", "/categories", catalogue.createCategory),
  route("POST", "/categories/reorder", catalogue.reorderCategories),
  route("PATCH", "/categories/:id", catalogue.updateCategory),
  route("DELETE", "/categories/:id", catalogue.deleteCategory),
  route("POST", "/subcategories", catalogue.createSubcategory),
  route("POST", "/subcategories/reorder", catalogue.reorderSubcategories),
  route("PATCH", "/subcategories/:id", catalogue.updateSubcategory),
  route("DELETE", "/subcategories/:id", catalogue.deleteSubcategory),

  route("GET", "/products", products.listProducts),
  route("POST", "/products", products.createProduct),
  route("POST", "/products/reorder", products.reorderProducts),
  route("DELETE", "/products/sample", products.deleteSampleProducts),
  route("GET", "/products/:id", products.getProduct),
  route("PATCH", "/products/:id", products.updateProduct),
  route("DELETE", "/products/:id", products.deleteProduct),
  route("PUT", "/products/:id/images", products.setProductImages),

  route("GET", "/media", media.listMedia),
  route("POST", "/media", media.uploadMedia),
  route("POST", "/media/sweep", media.sweepMedia),
  route("PATCH", "/media/:id", media.updateMedia),
  route("DELETE", "/media/:id", media.deleteMedia),

  route("GET", "/site/images", site.listSiteImages),
  route("PUT", "/site/images/:slot", site.setSiteImage),
  route("GET", "/site/settings", site.getSettings),
  route("PATCH", "/site/settings", site.updateSettings),
  route("GET", "/testimonials", site.listTestimonials),
  route("POST", "/testimonials", site.createTestimonial),
  route("POST", "/testimonials/reorder", site.reorderTestimonials),
  route("PATCH", "/testimonials/:id", site.updateTestimonial),
  route("DELETE", "/testimonials/:id", site.deleteTestimonial),

  route("GET", "/enquiries", enquiries.listEnquiries),
  route("PATCH", "/enquiries/:id", enquiries.updateEnquiry),
  route("DELETE", "/enquiries/:id", enquiries.deleteEnquiry),

  route("GET", "/publish", publish.getPublishStatus),
  route("POST", "/publish", publish.requestPublish),

  route("GET", "/audit", listAudit),
];

/** Makes sure a handler's own Response also carries the API headers. */
function withApiHeaders(res: Response): Response {
  for (const [name, value] of Object.entries(API_HEADERS)) if (!res.headers.has(name)) res.headers.set(name, value);
  return res;
}

export async function handleAdmin(request: Request, env: AdminEnv, exec: ExecutionContext, subPath: string): Promise<Response> {
  try {
    const pepper = env.SESSION_PEPPER ?? "";
    if (!secretOk(pepper, 32)) throw fail(503, "NOT_CONFIGURED", "The dashboard is not set up on this site yet.");

    const ip = request.headers.get("CF-Connecting-IP") ?? "local";
    if (env.ADMIN_LIMITER) {
      const { success } = await env.ADMIN_LIMITER.limit({ key: `admin:${ip}` });
      if (!success) throw fail(429, "SLOW_DOWN", "Too many requests. Wait a moment.", undefined, undefined, { "Retry-After": "30" });
    } else {
      console.error("limiter missing: ADMIN_LIMITER");
    }

    const head = request.method === "HEAD";
    const method = head ? "GET" : request.method;
    const matches = ROUTES.map((r) => ({ r, m: r.re.exec(subPath) })).filter((x) => x.m);
    if (matches.length === 0) throw fail(404, "NOT_FOUND", "That was not found.");
    const hit = matches.find((x) => x.r.method === method);
    if (!hit) {
      throw fail(405, "METHOD_NOT_ALLOWED", "That method is not allowed here.", undefined, undefined, { Allow: [...new Set(matches.map((x) => x.r.method))].join(", ") });
    }

    let params: string[];
    try {
      params = hit.m!.slice(1).map(decodeURIComponent);
    } catch {
      throw fail(404, "NOT_FOUND", "That was not found.");
    }
    const c: Ctx = { request, env, exec, url: new URL(request.url), params, ip, pepper, session: null };
    if (!hit.r.open) {
      c.session = await auth.loadSession(c);
      if (!c.session) {
        const had = request.headers.get("Cookie")?.includes(auth.COOKIE);
        throw fail(401, "UNAUTHORIZED", "Please sign in.", undefined, undefined, had ? { "Set-Cookie": auth.clearedCookie() } : undefined);
      }
      if (method !== "GET") auth.checkCsrf(request, c.session);
    }

    const result = await hit.r.handler(c);
    const res = result instanceof Response ? withApiHeaders(result) : json(result);
    return head ? new Response(null, res) : res;
  } catch (e) {
    if (e instanceof ApiFail) return errorResponse(e);
    // Only the message is logged: never the request, cookies or secrets.
    console.error("admin api error", e instanceof Error ? `${e.name}: ${e.message}` : "unknown");
    return errorResponse(fail(500, "INTERNAL", "Something went wrong. Try again."));
  }
}
