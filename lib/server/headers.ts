// Security headers for responses the Worker produces (pages from Next.js,
// photos from R2). Static files straight from Workers Static Assets get the
// same headers from public/_headers, because `_headers` does not apply to
// responses made by Worker code. Keep both in step.
const ADMIN_CSP =
  "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; img-src 'self' data: blob:; connect-src 'self'";
const SITE_CSP = "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";

const GLOBAL: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=31536000",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": SITE_CSP,
};

const ADMIN: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": ADMIN_CSP,
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export const isAdminPath = (pathname: string): boolean => pathname === "/admin" || pathname.startsWith("/admin/");

/** Returns a copy of `response` with the site's security headers added (existing ones are kept, admin ones win). */
export function withSecurityHeaders(response: Response, pathname: string): Response {
  if (response.status === 101) return response;
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(GLOBAL)) if (!out.headers.has(name)) out.headers.set(name, value);
  if (isAdminPath(pathname)) for (const [name, value] of Object.entries(ADMIN)) out.headers.set(name, value);
  return out;
}
