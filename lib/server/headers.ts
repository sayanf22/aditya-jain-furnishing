// Security headers for responses the Worker produces (pages from Next.js,
// photos from R2). Static files straight from Workers Static Assets get the
// same headers from public/_headers, because `_headers` does not apply to
// responses made by Worker code. Keep both in step.
// Dashboard policy: no script or style may run unless it is a file from this site or an inline block
// whose SHA-256 is listed. The dashboard pages are pre-rendered, so a per-request nonce is not possible
// (Next.js CSP guide: nonces need dynamic rendering); each page response is hashed here instead.
const adminCsp = (scripts: string[] = [], styles: string[] = []) =>
  [
    "default-src 'self'",
    `script-src 'self' ${scripts.join(" ")}`.trim(),
    `style-src 'self' ${styles.join(" ")}`.trim(),
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

const POLICIES = new Map<string, string>();

async function inlineHashes(html: string, tag: "script" | "style"): Promise<string[]> {
  const found = new Set<string>();
  const re = new RegExp(`<${tag}(?![^>]*\\bsrc=)([^>]*)>([\\s\\S]*?)</${tag}>`, "gi");
  for (const m of html.matchAll(re)) {
    if (tag === "script" && /type=["']application\/(ld\+)?json["']/i.test(m[1])) continue;
    if (m[2].trim() === "") continue;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(m[2])));
    found.add(`'sha256-${btoa(String.fromCharCode(...digest))}'`);
  }
  return [...found];
}
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
  "Content-Security-Policy": adminCsp(),
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export const isAdminPath = (pathname: string): boolean => pathname === "/admin" || pathname.startsWith("/admin/");

/** Returns a copy of `response` with the site's security headers added (existing ones are kept, admin ones win). */
export async function withSecurityHeaders(response: Response, pathname: string): Promise<Response> {
  if (response.status === 101) return response;
  let out: Response;
  let policy: string | null = null;
  if (isAdminPath(pathname) && (response.headers.get("Content-Type") ?? "").includes("text/html")) {
    const html = await response.text();
    // Pre-rendered pages don't change between deploys: remember the result per page and length.
    const memo = `${pathname}|${html.length}`;
    policy = POLICIES.get(memo) ?? adminCsp(await inlineHashes(html, "script"), await inlineHashes(html, "style"));
    if (POLICIES.size > 64) POLICIES.clear();
    POLICIES.set(memo, policy);
    out = new Response(html, response);
  } else {
    out = new Response(response.body, response);
  }
  for (const [name, value] of Object.entries(GLOBAL)) if (!out.headers.has(name)) out.headers.set(name, value);
  if (isAdminPath(pathname)) for (const [name, value] of Object.entries(ADMIN)) out.headers.set(name, value);
  if (policy) out.headers.set("Content-Security-Policy", policy);
  return out;
}
