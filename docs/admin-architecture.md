# Admin dashboard: architecture and rules

Decided 20 Nov 2026. This is the contract for everyone building the dashboard.
Read it fully before writing code. Anything it does not say, look up (official
docs or the web) and do not guess. Security choices below were checked against
the OWASP cheat sheets (Session Management, CSRF Prevention, File Upload,
Authentication, Credential Stuffing) and Cloudflare's docs.

## What exists (verified)

- Live Cloudflare account `4f5b8e20afb6be7b174fa1e1ee1ce0c1` (deltafurnishings.com@gmail.com), Worker `aditya-jain-furnishing`.
- Next.js 16.4.6, OpenNext 1.20.17, Workers **Free** plan: 10 ms CPU per request, 100,000 Worker requests a day, static asset requests are free.
- Next.js here differs from older versions. Before writing Next.js code, read the matching guide in `node_modules/next/dist/docs/` (AGENTS.md says so).
- Four D1 databases (free plan allows 10), one R2 bucket, bindings in `wrangler.jsonc`:

| Binding | Database | Holds | Migrations |
|---|---|---|---|
| `DB` | aditya-jain-furnishing-db | content the site is built from: categories, subcategories, products, product_images, media, site_images, settings, testimonials, room_*, content_state | `migrations/` |
| `AUTH_DB` | delta-auth-db | admin_users, sessions, login_attempts | `migrations-auth/` |
| `ENQ_DB` | delta-enquiries-db | enquiries (names, phone numbers) | `migrations-enquiries/` |
| `AUDIT_DB` | delta-audit-db | audit_log | `migrations-audit/` |
| `MEDIA` (R2) | delta-furnishings-media | `m/<hash>-<width>.webp` photo files | none |

- Rate limit bindings: `ENQUIRY_LIMITER`, `LOGIN_LIMITER` (6/min), `ADMIN_LIMITER` (240/min).
- Secrets (Worker runtime, set through the Cloudflare API; locally in `.dev.vars`, never committed): `SESSION_PEPPER`, `SETUP_CODE`, `EXPORT_TOKEN`, `DEPLOY_HOOK_URL`.
- Build variables (Workers Builds only): `EXPORT_TOKEN`, `EXPORT_URL` (the live site's origin).

## How the pieces fit

```
Browser (admin)  --cookie + X-CSRF-Token-->  Worker  /api/admin/*   (worker/, light, no Next.js server)
                                                |-- AUTH_DB / DB / ENQ_DB / AUDIT_DB (D1)
                                                '-- MEDIA (R2)
Visitor          --> static pages + /m/* images (free static assets)
Publish button   --> POST deploy hook --> Workers Builds --> scripts/sync-content.mjs
                                                |  GET {EXPORT_URL}/api/content/export  (Bearer EXPORT_TOKEN)
                                                |  writes the build-local DB, downloads used photos to public/m/
                                                '-> next build -> deploy
```

1. **The public site stays static.** Every public page is pre-rendered at build time from the build machine's local D1 (`DB`). Nothing on a public page touches D1 or R2 at request time. This keeps the 10 ms CPU limit safe. Do not make public pages dynamic.
2. **The dashboard is a static shell + JSON API.** `app/admin/**` is client-rendered ("use client") pages that call `/api/admin/*`. The API lives in `worker/` (never in `app/api/`), so it never loads the Next.js server. The shell contains no data; every endpoint checks the session.
3. **Editing is live in the databases; the site changes on Publish.** Each write bumps `content_state.version`. The build stamps the version it was made from into `lib/build-info.json`. `GET /api/admin/publish` compares the two. **Publish** POSTs `DEPLOY_HOOK_URL` (Workers Builds deploy hook, 10 builds/min limit) and records `requested_version` / `requested_at`.
4. **Photos.** The dashboard resizes in the browser (canvas, WebP) to widths from 480, 640, 800, 1080, 1200, 1600, 2048 (480/800/1200 for ordinary photos; the widths a hero or wide place needs are listed in `SITE_IMAGE_SLOTS`), never upscaling, keeping the shape (photos are never cropped). It uploads all sizes in one multipart request. The Worker validates, hashes (SHA-256 of the largest file, first 16 hex chars), stores `m/<hash>-<w>.webp` in R2 with `Cache-Control: public, max-age=31536000, immutable` and `Content-Type: image/webp`, and records one `media` row (`key = m/<hash>`). Public URL for a size: `/m/<hash>-<w>.webp`. At build, `sync-content.mjs` copies every photo in use into `public/m/` so visitors get them as free static assets. For photos not yet published (the dashboard previews), `/m/*` falls through to the Worker, which serves them from R2. Image keys stored in other tables are either `demo/<name>` (stand-in stock photos in `public/demo/`, via `public/demo/sizes.json`) or `m/<hash>`.
5. **Sample content.** Rows whose image key starts with `demo/` are sample designs. The dashboard marks them "Sample" and offers one action to remove all of them.

## Security rules (all mandatory)

Sessions (OWASP Session Management):
- Cookie `__Host-delta_admin`: `Secure; HttpOnly; SameSite=Strict; Path=/`, no Domain. Value = 32 random bytes, base64url. Only SHA-256(token) is stored (`sessions.id`). New token on every sign-in (no fixation). Idle expiry 2 h, absolute expiry 12 h. Sign-out deletes the row and clears the cookie. Password change deletes the user's other sessions.
- Every `/api/admin/*` response: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.

CSRF (OWASP CSRF Prevention):
- Reject every non-GET/HEAD request whose `Sec-Fetch-Site` is `cross-site` (or `same-site` from a different origin); when the header is missing, require `Origin` to equal the site's origin; ALWAYS require `Content-Type: application/json` or `multipart/form-data` AND the `X-CSRF-Token` header equal to `sessions.csrf` (constant-time compare). No state change on GET.

Passwords and sign-in (OWASP Authentication, Credential Stuffing):
- PBKDF2-SHA256, 20,000 iterations (Workers caps PBKDF2 at 100,000 and the Free plan CPU limit is 10 ms; measured ~5 ms at 20,000), over `HMAC-SHA256(SESSION_PEPPER, password)`, 16-byte random salt, constant-time compare. Minimum password length 12, maximum 128; reject a password equal to the email. Same generic message and similar timing for unknown email and wrong password (hash a dummy when the email is unknown).
- Throttling: `LOGIN_LIMITER` (per IP) plus `login_attempts` counts: after 5 failures in 15 minutes for an email or 20 for an IP, refuse with 429 and `Retry-After`, without revealing whether the account exists. Every attempt is audited.
- Optional authenticator-app 2FA (TOTP, RFC 6238, SHA-1, 6 digits, 30 s, ±1 step window, `totp_last_step` blocks replay). The TOTP secret is stored AES-GCM encrypted with a key derived from `SESSION_PEPPER`. Once enabled it is required at sign-in. The Security screen recommends it.
- First-run setup: `/admin/setup` only works while `admin_users` is empty AND the correct `SETUP_CODE` is sent (constant-time compare, throttled like sign-in). It creates the owner, then is permanently closed.

Uploads (OWASP File Upload):
- Only signed-in users, CSRF checked. Allow only `image/webp` files produced by the dashboard; verify the real format from the first bytes (`RIFF....WEBP`), read width/height from the WebP header, reject if the bytes are not WebP, a dimension is over 4096, a file is over 1.5 MB, there are more than 6 files, or the total is over 6 MB. Never trust the client's file name or type; names are generated from the hash. No SVG, no other formats. R2 objects get `nosniff`-safe headers when served.
- `/m/*` serves only keys matching `^m/[0-9a-f]{16}-(480|640|800|1080|1200|1600|2048)\.webp# Admin dashboard: architecture and rules

Decided 20 Nov 2026. This is the contract for everyone building the dashboard.
Read it fully before writing code. Anything it does not say, look up (official
docs or the web) and do not guess. Security choices below were checked against
the OWASP cheat sheets (Session Management, CSRF Prevention, File Upload,
Authentication, Credential Stuffing) and Cloudflare's docs.

## What exists (verified)

- Live Cloudflare account `4f5b8e20afb6be7b174fa1e1ee1ce0c1` (deltafurnishings.com@gmail.com), Worker `aditya-jain-furnishing`.
- Next.js 16.4.6, OpenNext 1.20.17, Workers **Free** plan: 10 ms CPU per request, 100,000 Worker requests a day, static asset requests are free.
- Next.js here differs from older versions. Before writing Next.js code, read the matching guide in `node_modules/next/dist/docs/` (AGENTS.md says so).
- Four D1 databases (free plan allows 10), one R2 bucket, bindings in `wrangler.jsonc`:

| Binding | Database | Holds | Migrations |
|---|---|---|---|
| `DB` | aditya-jain-furnishing-db | content the site is built from: categories, subcategories, products, product_images, media, site_images, settings, testimonials, room_*, content_state | `migrations/` |
| `AUTH_DB` | delta-auth-db | admin_users, sessions, login_attempts | `migrations-auth/` |
| `ENQ_DB` | delta-enquiries-db | enquiries (names, phone numbers) | `migrations-enquiries/` |
| `AUDIT_DB` | delta-audit-db | audit_log | `migrations-audit/` |
| `MEDIA` (R2) | delta-furnishings-media | `m/<hash>-<width>.webp` photo files | none |

- Rate limit bindings: `ENQUIRY_LIMITER`, `LOGIN_LIMITER` (6/min), `ADMIN_LIMITER` (240/min).
- Secrets (Worker runtime, set through the Cloudflare API; locally in `.dev.vars`, never committed): `SESSION_PEPPER`, `SETUP_CODE`, `EXPORT_TOKEN`, `DEPLOY_HOOK_URL`.
- Build variables (Workers Builds only): `EXPORT_TOKEN`, `EXPORT_URL` (the live site's origin).

## How the pieces fit

```
Browser (admin)  --cookie + X-CSRF-Token-->  Worker  /api/admin/*   (worker/, light, no Next.js server)
                                                |-- AUTH_DB / DB / ENQ_DB / AUDIT_DB (D1)
                                                '-- MEDIA (R2)
Visitor          --> static pages + /m/* images (free static assets)
Publish button   --> POST deploy hook --> Workers Builds --> scripts/sync-content.mjs
                                                |  GET {EXPORT_URL}/api/content/export  (Bearer EXPORT_TOKEN)
                                                |  writes the build-local DB, downloads used photos to public/m/
                                                '-> next build -> deploy
```

1. **The public site stays static.** Every public page is pre-rendered at build time from the build machine's local D1 (`DB`). Nothing on a public page touches D1 or R2 at request time. This keeps the 10 ms CPU limit safe. Do not make public pages dynamic.
2. **The dashboard is a static shell + JSON API.** `app/admin/**` is client-rendered ("use client") pages that call `/api/admin/*`. The API lives in `worker/` (never in `app/api/`), so it never loads the Next.js server. The shell contains no data; every endpoint checks the session.
3. **Editing is live in the databases; the site changes on Publish.** Each write bumps `content_state.version`. The build stamps the version it was made from into `lib/build-info.json`. `GET /api/admin/publish` compares the two. **Publish** POSTs `DEPLOY_HOOK_URL` (Workers Builds deploy hook, 10 builds/min limit) and records `requested_version` / `requested_at`.
4. **Photos.** The dashboard resizes in the browser (canvas, WebP) to widths from 480, 640, 800, 1080, 1200, 1600, 2048 (480/800/1200 for ordinary photos; the widths a hero or wide place needs are listed in `SITE_IMAGE_SLOTS`), never upscaling, keeping the shape (photos are never cropped). It uploads all sizes in one multipart request. The Worker validates, hashes (SHA-256 of the largest file, first 16 hex chars), stores `m/<hash>-<w>.webp` in R2 with `Cache-Control: public, max-age=31536000, immutable` and `Content-Type: image/webp`, and records one `media` row (`key = m/<hash>`). Public URL for a size: `/m/<hash>-<w>.webp`. At build, `sync-content.mjs` copies every photo in use into `public/m/` so visitors get them as free static assets. For photos not yet published (the dashboard previews), `/m/*` falls through to the Worker, which serves them from R2. Image keys stored in other tables are either `demo/<name>` (stand-in stock photos in `public/demo/`, via `public/demo/sizes.json`) or `m/<hash>`.
5. **Sample content.** Rows whose image key starts with `demo/` are sample designs. The dashboard marks them "Sample" and offers one action to remove all of them.

## Security rules (all mandatory)

Sessions (OWASP Session Management):
- Cookie `__Host-delta_admin`: `Secure; HttpOnly; SameSite=Strict; Path=/`, no Domain. Value = 32 random bytes, base64url. Only SHA-256(token) is stored (`sessions.id`). New token on every sign-in (no fixation). Idle expiry 2 h, absolute expiry 12 h. Sign-out deletes the row and clears the cookie. Password change deletes the user's other sessions.
- Every `/api/admin/*` response: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.

CSRF (OWASP CSRF Prevention):
- Reject every non-GET/HEAD request whose `Sec-Fetch-Site` is `cross-site` (or `same-site` from a different origin); when the header is missing, require `Origin` to equal the site's origin; ALWAYS require `Content-Type: application/json` or `multipart/form-data` AND the `X-CSRF-Token` header equal to `sessions.csrf` (constant-time compare). No state change on GET.

Passwords and sign-in (OWASP Authentication, Credential Stuffing):
- PBKDF2-SHA256, 20,000 iterations (Workers caps PBKDF2 at 100,000 and the Free plan CPU limit is 10 ms; measured ~5 ms at 20,000), over `HMAC-SHA256(SESSION_PEPPER, password)`, 16-byte random salt, constant-time compare. Minimum password length 12, maximum 128; reject a password equal to the email. Same generic message and similar timing for unknown email and wrong password (hash a dummy when the email is unknown).
- Throttling: `LOGIN_LIMITER` (per IP) plus `login_attempts` counts: after 5 failures in 15 minutes for an email or 20 for an IP, refuse with 429 and `Retry-After`, without revealing whether the account exists. Every attempt is audited.
- Optional authenticator-app 2FA (TOTP, RFC 6238, SHA-1, 6 digits, 30 s, ±1 step window, `totp_last_step` blocks replay). The TOTP secret is stored AES-GCM encrypted with a key derived from `SESSION_PEPPER`. Once enabled it is required at sign-in. The Security screen recommends it.
- First-run setup: `/admin/setup` only works while `admin_users` is empty AND the correct `SETUP_CODE` is sent (constant-time compare, throttled like sign-in). It creates the owner, then is permanently closed.

Uploads (OWASP File Upload):
- Only signed-in users, CSRF checked. Allow only `image/webp` files produced by the dashboard; verify the real format from the first bytes (`RIFF....WEBP`), read width/height from the WebP header, reject if the bytes are not WebP, a dimension is over 4096, a file is over 1.5 MB, there are more than 6 files, or the total is over 6 MB. Never trust the client's file name or type; names are generated from the hash. No SVG, no other formats. R2 objects get `nosniff`-safe headers when served.
- `/m/*` serves only keys matching .

Other:
- Build-export endpoint `GET /api/content/export` requires `Authorization: Bearer EXPORT_TOKEN` (constant-time compare) and returns only visible content. It never returns users, sessions, enquiries or the audit log.
- Every mutating endpoint writes to `audit_log` (user, action, entity, id, short detail). Never log passwords, tokens, cookies or secrets.
- All SQL uses bound parameters. Validate and length-limit every input on the server (names ≤ 80, descriptions ≤ 500, slugs `^[a-z0-9]+(-[a-z0-9]+)*$` ≤ 60). Reject unknown JSON fields. Return `{ "error": { "code", "message" } }` with the right status; never leak stack traces.
- `/admin` pages: `noindex` (meta robots and `X-Robots-Tag`), `X-Frame-Options: DENY`, CSP with `frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`, set through `public/_headers`. Admin links must not appear on public pages.
- Security headers for the whole site (HSTS, nosniff, Referrer-Policy, Permissions-Policy) through `public/_headers`.

## CPU budget (Workers Free, 10 ms per request)

An authenticated API call = cookie parse + one SHA-256 + one AUTH_DB read + the actual work. Keep each handler to a handful of D1 statements (use `batch`). Sign-in is the only PBKDF2 (about 5 ms). Never import big libraries into `worker/`. Lists are paginated (default 50).

## File ownership (parallel work; do not edit other owners' files)

| Owner | Files |
|---|---|
| **Backend** | `worker/**`, `lib/server/**` (new), `lib/enquiry.ts`, `lib/enquiry-rules.ts`, `lib/admin-api.ts` (shared types: additive changes only, note them at the top), `public/_headers`, `.dev.vars.example` |
| **Admin UI** | `app/admin/**`, `components/admin/**` (new). Own stylesheet `app/admin/admin.css` imported by `app/admin/layout.tsx`; do not edit `app/globals.css` |
| **Public wiring** | `lib/catalogue.ts`, `lib/content.ts`, `lib/media.ts`, `lib/nav.ts`, `app/page.tsx`, `app/about/**`, `app/contact/**`, `app/collection/**`, `app/layout.tsx`, `components/**` except `components/admin/**`, `scripts/build-db.mjs`, `scripts/sync-content.mjs` (new), `lib/build-info.json` (generated), `package.json` scripts, `.gitignore`, `next.config.ts` |
| **Lead (orchestrator)** | `migrations*/`, `wrangler.jsonc`, `docs/**` |

Database changes needed beyond the shipped migrations: ask the lead (write the SQL in your report); do not edit `migrations*/`.

## Admin screens (Admin UI)

Sidebar on desktop, bottom tab bar on phones (390 px wide must work with no sideways scroll). Minimal, clean, modern, little text, aligned, easy to navigate. Same type and colours as the site (Instrument Sans, regular to semibold, no italics, no thin weights; logo red `#E10101`, near-black, off-white and light grey), the real logo (`/brand/logo-color.webp`) on sign-in and in the sidebar. No visible word "WhatsApp" anywhere (use the icon, call the button "Enquire"). No video.

1. **Sign in / first-run setup** (setup code → email, name, password). Strong-password hint, show/hide. 2FA step when enabled.
2. **Overview**: publish status card (up to date / N changes waiting / publishing…) with the Publish button, unread enquiries, counts, shortcuts.
3. **Collections**: the tree exactly like the public one (thread lines, counts). Add collection / add type at any level, rename, edit description, change photos, show/hide, reorder with arrows (rows slide ~380 ms), delete (typed confirmation; says how many designs and types go with it).
4. **Designs**: per collection list + search; add / edit / hide / delete; several photos per design with reorder, replace, remove; move to another collection; "Remove all sample designs".
5. **Photos**: library grid (upload by button or drag and drop, several at once, progress), replace, edit label and description, delete (blocked with a clear message while in use).
6. **Site**: every named photo place (Home slides, Collection header, About, Contact: `slot` list is defined in `lib/admin-api.ts`) with preview and Replace; business details (phone, address, number for messages, Instagram, GSTIN); testimonials.
7. **Enquiries**: list, unread first, mark read, delete, tap to call.
8. **Security**: change password, authenticator app set-up (shows the key and an otpauth link; QR if small and dependency-free), signed-in devices with "sign out others", recent activity (audit log).

Rules the owner set (do not break): edits wait for an explicit **Save** (show "Not saved yet" with Save and Cancel; one-press actions like Hide, and Delete with a typed confirmation, act at once); reorder arrows animate; every screen works on a phone; all motion smooth and off for reduced motion; sentence-case labels, short words; confirm destructive actions; errors in plain words next to the field.

## Public site changes (Public wiring)

- Everywhere the site mentions collections (Home category cards and ribbon, Home intro text, About, footer, Contact enquiry form's category list, header menu, Collection pages, metadata), the data comes from the database through `lib/catalogue.ts` / `lib/content.ts`, with no hard-coded category names or "five". Fix any text that says "five" or lists names by hand.
- `lib/media.ts` `imageSource()` must handle both `demo/<name>` and `m/<hash>` (widths come from the `media` table via the loaders, aspect from `media.width/height`).
- Every photo place that is hard-coded today (Home hero slides, Collection header, About photos, Contact photos, category card and header photos) reads its photo from `site_images` / category columns with the current stand-in as the fallback. The list of slots is in `lib/admin-api.ts` (`SITE_IMAGE_SLOTS`); keep both in sync.
- `scripts/sync-content.mjs`: when `EXPORT_URL` and `EXPORT_TOKEN` are set, fetch the export, replace the managed tables in the build-local DB, download the used photos to `public/m/`, write `lib/build-info.json` (`{ "contentVersion": N, "builtAt": "..." }`). On any failure with the token set, fail the build loudly (never publish an empty site by accident). With no token (local dev) keep today's behaviour (demo seeds).
- The enquiry API now writes to `ENQ_DB` (`lib/enquiry.ts`, owned by Backend). The form fields do not change.

## Done means

Type check, lint, `npm run build`, local worker run, and Playwright checks (add them to `scripts/interaction-check.mjs` or a new `scripts/admin-check.mjs`) all pass; mobile (390 px) and desktop (1440 px) screenshots reviewed; no console errors; `npm audit` clean; CPU per admin request measured with `scripts/cpu-profile.mjs` and under 10 ms.
