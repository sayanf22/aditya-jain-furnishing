# Admin dashboard: architecture and rules

Decided 20 Nov 2026 and extended the same day (photo life cycle, emailed sign-in codes,
whole-site headers). Read it fully before writing code. Anything it does not say, look
up (official docs or the web) and do not guess. Security choices below were checked
against the OWASP cheat sheets (Session Management, CSRF Prevention, File Upload,
Authentication, Forgot Password, Credential Stuffing), the Next.js CSP guide and
Cloudflare's and Resend's docs.

## What exists

- Live Cloudflare account `4f5b8e20afb6be7b174fa1e1ee1ce0c1` (deltafurnishings.com@gmail.com), Worker `aditya-jain-furnishing`.
- Next.js 16.4.6, OpenNext 1.20.17, Workers **Free** plan: 10 ms CPU per request, 100,000 Worker requests a day, static asset requests are free.
- Next.js here differs from older versions. Before writing Next.js code, read the matching guide in `node_modules/next/dist/docs/` (AGENTS.md says so).
- Four D1 databases (the free plan allows 10), one R2 bucket, bindings in `wrangler.jsonc`:

| Binding | Database | Holds | Migrations |
|---|---|---|---|
| `DB` | aditya-jain-furnishing-db | content the site is built from: categories, subcategories, products, product_images, media, site_images, settings, testimonials, room_*, content_state | `migrations/` |
| `AUTH_DB` | delta-auth-db | admin_users, sessions, login_attempts, email_codes, email_code_requests | `migrations-auth/` |
| `ENQ_DB` | delta-enquiries-db | enquiries (names, phone numbers) | `migrations-enquiries/` |
| `AUDIT_DB` | delta-audit-db | audit_log | `migrations-audit/` |
| `MEDIA` (R2) | delta-furnishings-media | `m/<hash>-<width>.webp` photo files | none |

- Rate limit bindings: `ENQUIRY_LIMITER` (5/min), `LOGIN_LIMITER` (6/min), `ADMIN_LIMITER` (240/min).
- Secrets (Worker runtime, set through the Cloudflare API; locally in `.dev.vars`, never committed): `SESSION_PEPPER`, `SETUP_CODE`, `EXPORT_TOKEN`, `DEPLOY_HOOK_URL`, `RESEND_API_KEY`. Plain variable in `wrangler.jsonc`: `RESEND_FROM`.
- Build variables (Workers Builds only): `EXPORT_TOKEN`, `EXPORT_URL` (the live site's origin).

## How the pieces fit

```
Browser (admin)  --cookie + X-CSRF-Token-->  Worker  /api/admin/*   (worker/, light, no Next.js server)
                                                |-- AUTH_DB / DB / ENQ_DB / AUDIT_DB (D1)
                                                |-- MEDIA (R2)
                                                '-- Resend (emailed sign-in codes only)
Visitor          --> static pages + /m/* images (free static assets)
Publish button   --> POST deploy hook --> Workers Builds --> scripts/sync-content.mjs
                                                |  GET {EXPORT_URL}/api/content/export  (Bearer EXPORT_TOKEN)
                                                |  writes the build-local DB, downloads used photos to public/m/
                                                '-> next build -> deploy
```

1. **The public site stays static.** Every public page is pre-rendered at build time from the build machine's local D1 (`DB`). Nothing on a public page touches D1 or R2 at request time. This keeps the 10 ms CPU limit safe. Do not make public pages dynamic.
2. **The dashboard is a static shell plus a JSON API.** `app/admin/**` is client-rendered ("use client") pages that call `/api/admin/*`. The API lives in `worker/` and `lib/server/` (never in `app/api/`), so it never loads the Next.js server. The shell contains no data; every endpoint checks the session.
3. **Editing is live in the databases; the site changes on Publish.** Each write bumps `content_state.version`. The build stamps the version it was made from into `lib/build-info.json`. `GET /api/admin/publish` compares the two. **Publish** POSTs `DEPLOY_HOOK_URL` (Workers Builds deploy hook, 10 builds/min limit) and records `requested_version` / `requested_at`.
4. **Photos.** The dashboard resizes in the browser (canvas, WebP) to widths from 480, 640, 800, 1080, 1200, 1600, 2048 (480/800/1200 for ordinary photos; the widths a place needs are in `SITE_IMAGE_SLOTS`), never upscaling, keeping the shape (photos are never cropped). It uploads all sizes in one multipart request. The Worker validates, hashes (SHA-256 of the largest file, first 16 hex chars), stores `m/<hash>-<w>.webp` in R2 with `Cache-Control: public, max-age=31536000, immutable` and `Content-Type: image/webp`, and records one `media` row (`key = m/<hash>`). Public URL for a size: `/m/<hash>-<w>.webp`. At build, `sync-content.mjs` copies every photo in use into `public/m/` so visitors get them as free static assets. Photos not yet published (dashboard previews) fall through `/m/*` to the Worker, which serves them from R2. Image keys stored in other tables are either `demo/<name>` (a default photo, a static file in `public/demo/`, sizes in `public/demo/sizes.json`) or `m/<hash>` (an upload).
5. **Sample content (local development only).** Rows whose image key starts with `demo/` are sample designs from the local seeds. The dashboard marks them "Sample" and offers one action to remove all of them. Designs have no default photo: a design without a photo shows a neutral placeholder, and a collection or type card without a photo shows a neutral tile.

## Photo life cycle

Places a photo can appear, and what the owner can do:

| Place | Replaceable | Default |
|---|---|---|
| Home category cards (`categories.image_key`) | yes | `demo/cat-*` by collection slug (`CATEGORY_CARD_DEFAULTS`); new collections have none and show a neutral tile |
| About: who we are, visit us, closing band; Contact: showroom card (`site_images`, slots in `SITE_IMAGE_SLOTS`) | yes | `defaultKey` of the slot |
| Type cards (`subcategories.image_key`), design photos (`product_images`) | yes | none |
| Hero places: Home slides (`home.hero.*`), `collection.hero`, `about.hero`, `contact.hero`, every collection's header photo (`categories.hero_image_key`) | **no** | fixed in the site |

Rules, all enforced in the Worker (`lib/server/media.ts`, `site.ts`, `catalogue.ts`, `products.ts`):
- **Upload** stores every size in R2, then one row in D1. If the D1 insert fails the R2 files are deleted again.
- **Delete a photo** (library): refused with 409 `MEDIA_IN_USE` while anything uses it; otherwise the D1 row and every R2 size file go, and the copy in the data centre's edge cache is dropped (other data centres drop theirs within a day, because the edge copy lives one day, not a year).
- **Reset a place** (`PUT /site/images/:slot` with `mediaKey: null`): the default returns; the owner's upload is deleted from D1 and R2 unless another place still uses it. Replacing an upload with another photo leaves the old one in the library (unused) until it is deleted or swept.
- **Defaults** (`demo/...`) are static files. They have no library row, are never written to R2, can never be stored as an upload (400) and a `media` row with such a key can never be deleted (403 `PROTECTED_DEFAULT`).
- **Hero places** are refused by the API (400 `NOT_REPLACEABLE`; `PATCH /categories/:id` with `heroImageKey` too), are not listed by `GET /site/images`, and are never exported to the build (`hero_image_key` is exported as null and hero rows of `site_images` are left out). Migration `migrations/0010_fixed_heroes.sql` clears anything saved earlier.
- **Delete a design, type or collection** removes its photos from D1 and R2 afterwards, each only if nothing else still uses it.
- **Orphan sweep** `POST /api/admin/media/sweep?minutes=60`: deletes library photos that nothing uses and R2 files with no library row (failed uploads), both older than `minutes` (default 60, so a photo just uploaded can still be attached). It touches only names of the form `m/<16 hex>-<width>.webp`.

## Security rules (all mandatory)

Sessions (OWASP Session Management):
- Cookie `__Host-delta_admin`: `Secure; HttpOnly; SameSite=Strict; Path=/`, no Domain, no `Max-Age` (ends with the browser). Value = 32 random bytes, base64url. Only SHA-256(token) is stored (`sessions.id`). New token on every sign-in (no fixation). Idle expiry 30 minutes, absolute expiry 12 hours. Sign-out deletes the row and clears the cookie. Password change, password reset, 2FA enable and 2FA disable issue a new session id and CSRF token and end every other session.
- Every `/api/admin/*` response: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.

CSRF (OWASP CSRF Prevention):
- Reject every non-GET/HEAD request whose `Sec-Fetch-Site` is `cross-site` (or `same-site` from a different origin); when the header is missing, require `Origin` to equal the site's origin; a request with a body must be `application/json` or `multipart/form-data`; every signed-in change also needs the `X-CSRF-Token` header equal to `sessions.csrf` (constant-time compare). The public sign-in routes (setup, login, code request, code verify) get the same-origin checks without the token. No state change on GET.

Passwords and sign-in (OWASP Authentication, Credential Stuffing):
- Passwords: PBKDF2-SHA256 over `HMAC-SHA256(SESSION_PEPPER, password)`, 16-byte random salt, constant-time compare. The round count is set in "Password hashing and CPU" below and nowhere else. Minimum length 12, maximum 128; refused: the email itself, a short list of very common passwords, fewer than 4 distinct characters, and any password found in Pwned Passwords (k-anonymity range call, 2.5 s timeout; a network failure lets the password through). The same generic message and similar timing for an unknown email and a wrong password (a dummy hash is computed for an unknown email).
- Throttling: `LOGIN_LIMITER` (per address) plus three `login_attempts` counters per try: this address (20 per 15 min), this email from this address (5 per 15 min) and this email from anywhere (50 per 15 min, the guessing backstop). A stranger can lock only their own address, not the owner. The try is written before the password is checked, so parallel guesses all count; a successful try removes its own rows. Refusals are 429 with `Retry-After` and never reveal whether the account exists. Password change, 2FA disable and the emailed-code check use the same counters. Every attempt is audited.
- Optional authenticator-app 2FA (TOTP, RFC 6238, SHA-1, 6 digits, 30 s, plus or minus one step, `totp_last_step` blocks replay). The secret is stored AES-GCM encrypted with a key derived from `SESSION_PEPPER`. Once enabled it is required at every sign-in, including a sign-in by emailed code.
- First-run setup: `/admin/setup` only works while `admin_users` is empty AND the correct `SETUP_CODE` is sent (constant-time compare; 20 failures per address and 30 per hour across all addresses). It creates the owner, then is permanently closed. Run it right after the first deploy, then delete `SETUP_CODE`. A secret shorter than its minimum (`SESSION_PEPPER` 32, `SETUP_CODE` 20, `EXPORT_TOKEN` 32) or containing `change-me` counts as not configured (503).

Sign-in by emailed code (forgotten password; OWASP Forgot Password cheat sheet, Resend API):
- Flow: sign-in screen (email and password), link "Forgot password? Email me a code", enter the email, a 6-digit code arrives, enter it, the owner is signed in to a **password-reset session** and must set a new password. `GET /auth/status` returns `emailCodes`; the screen hides the link or says plainly that email codes are not set up when it is false. Password sign-in is not affected.
- Routes: `POST /auth/code/request {email}`, `POST /auth/code/verify {email, code, totp?}`, `POST /auth/password/reset {next}` (contract in `lib/admin-api.ts`).
- The code is 6 random digits (no modulo bias). Only a keyed hash is stored (`HMAC-SHA256(SESSION_PEPPER, user id and code)` in `email_codes`). It lives 10 minutes, works once (one `UPDATE ... WHERE used_at IS NULL` decides), and dies after 5 wrong tries (the try is counted before the comparison, so parallel guesses count). A new request replaces the older code. It is never logged or audited and the email holds the code only, no link.
- No account enumeration: `code/request` answers `{ok:true}` with the same body for every well-formed email, does the same database work for an unknown one, and sends the mail after the reply. `code/verify` gives one message ("not right or has expired") for a wrong code, an expired one, a used one and an unknown email.
- Throttles: requests are counted per email address (3 per 15 min), per visitor address (6 per 15 min) and globally (20 per hour, so Resend's free 100 a day is never used up by strangers), whether or not the email belongs to the owner. Verify tries use the sign-in counters above.
- 2FA stays required: with 2FA on, `code/verify` with a right emailed code but no `totp` answers `{needsCode:true}`, sets no cookie and does not use the code up. The code is consumed only after the authenticator code also passes.
- The password-reset session lasts 15 minutes and may only call `GET /me`, `POST /auth/logout` and `POST /auth/password/reset` (403 `PASSWORD_RESET_REQUIRED` for anything else). Setting the password ends every other session and deletes the user's open codes.
- Sending (`lib/server/email.ts`): `POST https://api.resend.com/emails` with `Authorization: Bearer RESEND_API_KEY`, `from` = `RESEND_FROM`, one recipient, an `Idempotency-Key`, 8 s timeout. Only the status is logged on failure, never the message or key. Without `RESEND_API_KEY`, `code/request` answers 503 `EMAIL_NOT_CONFIGURED`.
- **Domain limit:** until a domain is verified in Resend, only `onboarding@resend.dev` can be the sender and Resend delivers only to the address that owns the Resend account (anything else is a 403 "only send testing emails to your own email address"). Use the owner's own email as the dashboard email until a domain is verified, then set `RESEND_FROM`. Free plan: 100 emails a day, 3,000 a month, 10 API requests a second per team.
- Local development: `node worker/dev/email-stub.mjs` (started by `worker/dev/api-check.mjs`) receives the mail instead of Resend. The Worker uses it only when `NEXTJS_ENV` is `development` and `DEV_EMAIL_STUB` is a loopback address; `worker/dev/start.mjs` sets both. On the live site neither is set, so the stub can never be reached.

Uploads (OWASP File Upload):
- Only signed-in users, CSRF checked. Only `image/webp` files produced by the dashboard; the real format comes from the first bytes (`RIFF....WEBP`) and the RIFF chunks, width and height from the WebP header. Reject if the bytes are not WebP, a dimension is over 4096, a file is over 1.5 MB, there are more than 6 files, or the total is over 6 MB. Never trust the client's file name or type; names are generated from the hash. No SVG, no other formats.
- `/m/*` serves only keys matching `^m/[0-9a-f]{16}-(480|640|800|1080|1200|1600|2048)\.webp$`; any other path is a 404. Answers come from the edge cache (`caches.default`, one day) before R2 is read.

Whole-site headers (`public/_headers` for static files, `lib/server/headers.ts` for pages the Worker answers; keep the two in step):
- Public pages: `Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com <hashes>; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src https://challenges.cloudflare.com; media-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests`, plus `Strict-Transport-Security: max-age=31536000`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`, `Cross-Origin-Opener-Policy: same-origin`, `X-Frame-Options: SAMEORIGIN`. Pre-rendered Next.js pages carry their hydration data in inline scripts, and a per-request nonce needs dynamic rendering (Next.js CSP guide), so the Worker hashes each page's inline scripts (SHA-256) and lists exactly those; no other inline script runs. The policy is kept per page and ETag, and a 304 carries no policy, so the browser keeps the one made for the HTML it holds. Styles stay `'unsafe-inline'` (React style attributes; CSS cannot run script). Turnstile is the only outside script and frame source and only appears once its keys are set. HSTS has no `includeSubDomains` or `preload` because the site may run on a `workers.dev` address first.
- Dashboard (`/admin`, `/admin/*`): the Worker hashes each page's inline `<script>` and `<style>` blocks and sends `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' <hashes>; style-src 'self' <hashes>; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`, with `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex, nofollow, noarchive`. `style-src-attr 'unsafe-inline'` is needed for React `style` attributes. `'wasm-unsafe-eval'` lets the photo encoder compile its WebAssembly (libwebp from `@jsquash/webp`, used only where the browser cannot encode WebP from a canvas, which is Safari); it does not allow `eval()`. Admin links must not appear on public pages.
- `/api/*` (including the enquiry form): `Cache-Control: no-store`, `nosniff`, `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Cross-Origin-Resource-Policy: same-origin`, HSTS, and no CORS headers (the API is same-origin only).
- `/m/*` photos (static and from R2): `nosniff`, `Cross-Origin-Resource-Policy: same-origin`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, one-year immutable caching.

Other:
- Enquiry form (`lib/enquiry.ts`): same-site Origin check, JSON only, at most 8 KB (also chunked), unknown or non-text fields refused (400), a hidden honeypot field, 5 per minute per visitor address, stored with bound parameters in `ENQ_DB`. Turnstile (3 s timeout, an unreachable check counts as failed) turns on when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set at build time; set `TURNSTILE_SECRET` on the Worker at the same time, never one without the other.
- Build-export endpoint `GET /api/content/export` requires `Authorization: Bearer EXPORT_TOKEN` (constant-time compare, rate limited) and returns only visible content and the keys in `PUBLIC_SETTINGS` (`lib/server/export.ts`; add a key there when a new public setting appears). It never returns users, sessions, enquiries or the audit log. `scripts/sync-content.mjs` requires slugs to match `^[a-z0-9]+(-[a-z0-9]+)*$` and image keys to be `m/<16 hex>` or `demo/<name>`, and runs Wrangler without a shell.
- Every mutating endpoint writes to `audit_log` (user, action, entity, id, short detail). Never log passwords, tokens, codes, cookies or secrets. The log keeps the newest 20,000 rows; failed sign-ins, setup and password failures are trimmed separately to 1,000. A typed email that is not an account is stored only as `unknown:<12 hex>`.
- All SQL uses bound parameters (column names in dynamic `UPDATE`s are fixed strings in code). Validate and length-limit every input on the server (names at most 80, descriptions at most 500, slugs `^[a-z0-9]+(-[a-z0-9]+)*$` at most 60). Reject unknown JSON fields. Return `{ "error": { "code", "message" } }` with the right status; never leak stack traces. A malformed percent escape in a path is a 404.
- A missing rate-limit binding logs `limiter missing: <NAME>` on each request and does not block; the D1 throttles are the backstop.

## Password hashing and CPU (Workers Free, 10 ms per request)

An authenticated API call is a cookie parse, one SHA-256, one AUTH_DB read and the actual work. Keep each handler to a handful of D1 statements (use `batch`), never import big libraries into `worker/`, and paginate lists (default 50). Only PBKDF2 is heavy. It runs in sign-in, setup, password change and password reset; the emailed-code check uses HMAC only.

- **Decision (owner, 20 Nov 2026):** the site stays on Workers Free. PBKDF2 uses 20,000 rounds plus the pepper (`PBKDF2_ITERATIONS` in `lib/server/crypto.ts`, the only place the number lives). OWASP asks for 600,000, but Workers caps PBKDF2 at 100,000 and the Free CPU limit rules that out.
- **Measured locally** (`worker/dev/cpu-admin.mjs`, 20 requests each, own work above the `/api/health` baseline of 3 to 8 ms that Wrangler's inspector adds): dashboard reads 4 to 10 ms, writes 9 to 11 ms, photo upload about 21 ms, sign-in about 28 ms (PBKDF2 `deriveBits` alone about 16 ms). These are upper bounds; Cloudflare's own benchmark of about 100 ms for 600,000 rounds suggests 3 to 4 ms for 20,000 on real workerd.
- **To verify after the first live deploy:** read `cpuTime` in Workers Logs (observability is on in `wrangler.jsonc`) for `/api/admin/auth/login`, `/auth/setup`, `/auth/password`, `/auth/password/reset` and `/media`. If any exceeds 10 ms, lower the constant to 10,000, never below that.
- **Changing the constant is safe:** `login` re-hashes after a successful sign-in whenever the stored `pw_iterations` differs from the constant, higher or lower.
- Dashboard pages answered by the Worker cost about 8 ms locally once the page's CSP hashes are remembered (the policy is computed once per page and Worker instance).

## Admin screens

Sidebar on desktop, bottom tab bar on phones (390 px wide must work with no sideways scroll). Minimal, clean, modern, little text. Same type and colours as the site (Instrument Sans, regular to semibold, no italics, no thin weights; logo red `#E10101`, near-black, off-white and light grey), the real logo on sign-in and in the sidebar. No visible word "WhatsApp" (use the icon; buttons say "Enquire"). No video.

1. **Sign in / first-run setup.** Setup: setup code, email, name, password. Sign in: email and password, a 2FA step when enabled, "Forgot password? Email me a code" (email, code, authenticator code when needed, then a new password). When `emailCodes` is false the screen says email codes are not set up.
2. **Overview:** publish status with the Publish button, unread enquiries, counts, shortcuts.
3. **Collections:** the tree like the public one. Add collection or type at any level, rename, description, show/hide, reorder with arrows, delete with a typed confirmation (says how many designs and types go, and that their photos are deleted). A collection's header photo is not editable; its card photo is (reset returns the default or a neutral tile).
4. **Designs:** per collection list and search; add, edit, hide, delete (photos go with it); several photos per design with reorder, replace, remove; move to another collection. A design with no photo shows a neutral placeholder.
5. **Photos:** library grid (upload by button or drag and drop, several at once, progress), edit label and description, delete (blocked with a clear message while in use), and a clean-up action that runs the orphan sweep.
6. **Site:** the four replaceable photo places (About: who we are, visit us, closing band; Contact: showroom card), each with its default, Replace and Reset. No hero place is listed. Business details (phone, address, number for messages, Instagram, GSTIN) and testimonials.
7. **Enquiries:** list, unread first, mark read, delete, tap to call.
8. **Security:** change password, authenticator app set-up, signed-in devices with "sign out others", recent activity.

Rules the owner set: edits wait for an explicit **Save** ("Not saved yet" with Save and Cancel; one-press actions like Hide, and Delete with a typed confirmation, act at once); reorder arrows animate; every screen works on a phone; all motion smooth and off for reduced motion; sentence-case labels, short words; confirm destructive actions; errors in plain words next to the field.

## Public site

- Everywhere the site mentions collections (Home category cards, intro text, About, footer, Contact form's category list, header menu, Collection pages, metadata), the data comes from the database through `lib/catalogue.ts` / `lib/content.ts`, with no hard-coded category names or counts.
- `lib/media.ts` `imageSource()` handles both `demo/<name>` and `m/<hash>` (widths from the `media` table, aspect from `media.width/height`).
- Replaceable places read their photo from `site_images` or the category columns, with the default from `SITE_IMAGE_SLOTS` / `CATEGORY_CARD_DEFAULTS` in `lib/admin-api.ts` as fallback. Hero places are fixed in code and never read from the database.
- `scripts/sync-content.mjs`: when `EXPORT_URL` and `EXPORT_TOKEN` are set, fetch the export, replace the managed tables in the build-local DB, download the used photos to `public/m/`, write `lib/build-info.json`. On any failure with the token set, fail the build (never publish an empty site by accident). With no token (local development) it keeps the demo seeds.

## Migrations to apply to the live databases

The full list, in order per database, and the commands are in `docs/go-live-checklist.md`. Wrangler records applied files in each database's `d1_migrations` table and applies only the missing ones, so the same command is right whatever the live state. New in this round:
- `migrations/0010_fixed_heroes.sql` (database `DB`): clears saved hero replacements.
- `migrations-auth/0002_email_codes.sql` (database `AUTH_DB`): `email_codes`, `email_code_requests`, `sessions.recovery`.

## Checks

- `node worker/dev/start.mjs` starts the local Worker on 8787 (reuses a running one; `stop` ends it). `node worker/dev/api-check.mjs` runs the API checks end to end (sign-in, 2FA, emailed code against the stub, photos and their life cycle, hero refusal, headers). `NO_EMAIL=1` against a Worker started with `WRANGLER_EXTRA="--var DEV_EMAIL_STUB:"` checks the "email codes not set up" path. `node scripts/enquiry-check.mjs` checks the enquiry form API.
- `scripts/admin-check.mjs` is the browser check of the dashboard (1440 px and 390 px); `--hook` tests Publish against a fake local hook server (start the Worker with `WRANGLER_EXTRA="--var DEPLOY_HOOK_URL:http://127.0.0.1:9911/hook"`; wait a minute between two `--hook` runs).
- CPU checks need `npx opennextjs-cloudflare populateCache local` after each build, otherwise pages are not answered from the static cache and read 50 ms or more.
