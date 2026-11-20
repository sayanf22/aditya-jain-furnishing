# Whole-site security audit (admin phase 2)

Date: 20 Nov 2026. Scope: the whole site, not only the dashboard. That means the public pages and `public/_headers`, the enquiry form and its API, `/m/*` photos, `/api/*`, the dashboard (`/admin`, `/api/admin/*`), dependencies, secrets handling and the build scripts. Everything was tested on the local Worker (`wrangler dev --local`, served over https with `LOCAL_HTTPS=1`) using a production build. No live resources were touched.

Every finding below has been fixed in this repository. Two items need action on the Cloudflare account (Turnstile keys, live migrations). They are listed under "Lead actions": the code for them is ready, and they are not open code findings.

## Findings and fixes

| # | Area | Finding | Source | Fix | Verified by |
|---|------|---------|--------|-----|-------------|
| 1 | Public pages | No Content-Security-Policy or HSTS on public pages. | [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html) | Whole-site policy in `lib/server/headers.ts` (pages) and `public/_headers` (static files). It sets CSP, `Strict-Transport-Security: max-age=31536000`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'`. HSTS has no `includeSubDomains` or `preload` while the site may still run on `workers.dev`. | api-check (headers section) |
| 2 | Public pages | The first public CSP allowed `script-src 'unsafe-inline'`, so an injected inline script would have run. | [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html), [MDN script-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/script-src), Next.js CSP guide in `node_modules/next/dist/docs` (nonces need dynamic rendering) | The Worker hashes every inline script of each pre-rendered page (SHA-256) and lists exactly those hashes. `'unsafe-inline'` is gone from `script-src`. Scripts may come only from this site and `https://challenges.cloudflare.com` (Turnstile). Styles keep `'unsafe-inline'`, because React writes style attributes and CSS cannot run script. | `scripts/csp-check.mjs`: 6 pages, fresh load and cached reload, Chromium, Firefox and WebKit, 36/36 with no violations and the page hydrated |
| 3 | Dashboard CSP | The policy cache was keyed by path only. When a page's HTML changed under the same path, the old hashes were sent, Firefox blocked the page's scripts, and the screen stayed on a spinner. That pushes people towards loosening the CSP. | [MDN CSP hashes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/script-src#hash) | Cached per path and `ETag` (the ETag is a hash of the page). | admin-check 132/132 in Firefox (it failed before) |
| 4 | All pages | A `304 Not Modified` carried a general CSP with no hashes. A 304 replaces the stored headers ([RFC 9111 §4.3.4](https://www.rfc-editor.org/rfc/rfc9111#section-4.3.4)), so Firefox applied the hash-less policy to the cached page and blocked its scripts. | RFC 9111 §4.3.4 | A 304 now carries no CSP. The browser keeps the policy that came with the HTML it holds. | csp-check second load in each browser; admin-check in Firefox |
| 5 | `/api/*` | API responses had no CSP and no CORP. | OWASP HTTP Headers Cheat Sheet, [MDN CORP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Resource-Policy) | `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Cross-Origin-Resource-Policy: same-origin`, `no-store`, `nosniff`, `Referrer-Policy: no-referrer` and HSTS. No CORS headers are sent, because the API is same-origin only. | api-check |
| 6 | `/m/*` photos | Photos had no sandbox and no CORP. | [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) | `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, `Cross-Origin-Resource-Policy: same-origin` and `nosniff`. This applies both to static copies and to files served from R2. Uploads are WebP only, checked from the file's own bytes, with names made from a hash. | api-check (upload refusals, photo headers) |
| 7 | Photo lifecycle | A deleted photo stayed in R2, and stayed in the edge cache for a year. | OWASP File Upload Cheat Sheet (storage and removal) | Delete removes the D1 row and every R2 size file, and purges the local edge copy. The edge copy now lives one day. Removing a slot photo deletes the upload unless another place uses it. A failed D1 insert removes the R2 files again. `POST /media/sweep` clears unused photos and stray R2 files older than an hour, and the Photos screen has a "Clear unused" button for it. Defaults in `public/demo` can't be uploaded, can't be deleted (403), and are never written to R2. | api-check (media lifecycle, sweep, protected defaults) |
| 8 | Content integrity | The API accepted changes to hero photos, which the owner wants fixed. | Owner's requirement | Hero places and `heroImageKey` answer 400 `NOT_REPLACEABLE`. They are hidden from the dashboard and left out of the content export. Migration `0010_fixed_heroes.sql` removes old hero rows. | api-check (hero refusal), admin-phase2-check (hidden in UI) |
| 9 | Forgotten password | The only way back in after a forgotten password was setting up the account again. | [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) | Emailed 6-digit code (Resend): <ul><li>Only a peppered hash is stored. The code lasts 10 minutes, works once, and dies after 5 wrong tries.</li><li>Throttles: 3 requests per email and 6 per address per 15 minutes, 20 per hour site-wide.</li><li>The answer is the same whether or not the email belongs to the owner, so accounts can't be discovered.</li><li>The email holds the code only, and the code is never logged.</li><li>Authenticator 2FA is still required.</li><li>A successful code opens a 15-minute session that can only set a new password. Setting it ends every other session.</li><li>Without `RESEND_API_KEY` the screen says plainly that codes are not set up, and password sign-in works as before.</li></ul> | api-check email-code section (request, wrong code, expiry, 5-try limit, 3 throttles, no enumeration, 2FA kept, new password), admin-phase2-check (UI flow) |
| 10 | Dev-only paths | The local email stub could have been reachable from the live site. | OWASP Authentication Cheat Sheet | The Worker uses `DEV_EMAIL_STUB` only when `NEXTJS_ENV=development` and the address is loopback. | api-check (`NO_EMAIL` mode 4/4) |
| 11 | Dashboard uploads (Safari) | Safari can't encode WebP from a canvas: it quietly returns a PNG ([caniuse](https://caniuse.com/mdn-api_htmlcanvaselement_toblob_type_parameter_webp)). The owner couldn't upload photos from Safari or iOS. WebKit on Windows also leaves the type of a `.webp` file empty. | caniuse, [MDN script-src 'wasm-unsafe-eval'](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/script-src#wasm-unsafe-eval) | Where the canvas can't make WebP, the photo is encoded with libwebp compiled to WebAssembly (`@jsquash/webp` 1.5.0, Apache-2.0, pinned exactly, loaded only when needed). The dashboard CSP adds `'wasm-unsafe-eval'`. It lets WebAssembly compile and does not allow JavaScript `eval()`. The public CSP doesn't have it. An empty file type is accepted by extension, and decoding is still the real check. The server checks the bytes as before. | admin-check 132/132 in WebKit (the upload step failed before) |
| 12 | Test coverage | The suites ran only in Chromium over http. That never exercised `Secure` cookies, `upgrade-insecure-requests` or other engines. Over http, WebKit upgraded every asset to https and loaded nothing. | Brief item 5 | `LOCAL_HTTPS=1 node worker/dev/start.mjs` serves the local Worker over https with a self-signed certificate. `ENGINE=chromium\|firefox\|webkit` picks the browser for `interaction-check` and `admin-check`. The session cookie check reads `SameSite=Strict` from the `Set-Cookie` header, because Playwright's WebKit build for Windows reports every cookie as `SameSite=None`. | All suites, results below |

## Checked, no finding

- **Enquiry form and API** (`lib/enquiry.ts`): the checks cover:
  - Origin and `Sec-Fetch-Site` (same-site only).
  - JSON only, at most 8 KB including chunked bodies, every field text with a length cap.
  - A honeypot field.
  - A rate limit of 5 per minute per address (`ENQUIRY_LIMITER`).
  - Bound parameters for the insert into its own database (`ENQ_DB`).
  - Turnstile siteverify with a 3-second timeout, where an unreachable check counts as failed ([Cloudflare Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)).

  enquiry-check passed 10/10.
- **Dashboard sign-in and session**:
  - Password hashing is PBKDF2-SHA256 with 20,000 rounds plus a pepper. This is the decided setting; the CPU check and the 10,000 fallback are in `docs/admin-architecture.md`.
  - The `__Host-` cookie is `Secure`, `HttpOnly` and `SameSite=Strict`, with a 30-minute idle limit.
  - Every write needs a CSRF token, compared in constant time.
  - Sign-in is locked per address, and every admin request is rate-limited.
  - Audit log entries never hold codes or passwords.

  ([OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)). admin-check passed 132/132 and api-check passed 216/216.
- **Secrets**:
  - `.dev.vars*` and `.env*` are git-ignored, and only `.dev.vars.example` is committed.
  - Live values are Worker secrets (`SESSION_PEPPER`, `SETUP_CODE`, `EXPORT_TOKEN`, `RESEND_API_KEY`, `TURNSTILE_SECRET`, `DEPLOY_HOOK_URL`).
  - The Worker refuses placeholder values (those containing `change-me`).
  - `RESEND_FROM` is a plain variable, because it isn't a secret.
- **Build scripts**:
  - `scripts/sync-content.mjs` only accepts an `https://` `EXPORT_URL` and fetches with `redirect: "error"`, so the bearer token can't follow a redirect.
  - It checks every key against a strict pattern and every photo for WebP magic bytes and a 3 MB cap.
  - It stops the build on any problem, so an empty site is never published.
  - Commands run through `execFileSync` with argument arrays (no shell strings built from data).
  - `scripts/build-db.mjs` only runs `--local` wrangler commands.
- **Dependencies**:
  - `npm audit` reports 0 vulnerabilities, including dev dependencies.
  - Next.js 16.4.6 is current.
  - `npm outdated` lists only patch or dev-tool updates (wrangler 4.156 → 4.165, @opennextjs/cloudflare 1.20.17 → 1.20.18, Playwright, Tailwind). None carries an advisory, so they were left for a normal upgrade.

## Lead actions on the live account (code ready)

1. Apply `migrations/0010_fixed_heroes.sql` to `DB` and `migrations-auth/0002_email_codes.sql` to `AUTH_DB`. Then run the photo sweep once (Photos → Clear unused, or `POST /api/admin/media/sweep`).
2. Turnstile on the enquiry form: create the widget, set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` as a build variable and `TURNSTILE_SECRET` as a Worker secret, together. Until then the form relies on the honeypot, the Origin check and the rate limit.
3. Set `RESEND_API_KEY` as a Worker secret. Without a verified domain, Resend only sends from `onboarding@resend.dev` to the address that owns the Resend account, so the dashboard owner's email must be that address ([Resend: 403 with resend.dev](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)).
4. After the deploy:
   - Load `/`, `/collection`, `/about`, `/contact` and `/admin/login` and confirm the browser console shows no CSP messages. Locally, `node scripts/csp-check.mjs https://<site>` does the same check for the public pages.
   - Check the CPU per admin request in Workers Logs (see "Password hashing and CPU" in `docs/admin-architecture.md`).

## How to re-run

The suites change the local database, and `api-check` deletes the sample designs. Run them in this order, one at a time:

1. `npm run db:seed:demo`, then `npm run build` (pages are pre-rendered from the local database).
2. `LOCAL_HTTPS=1 node worker/dev/start.mjs`.
3. For each `ENGINE` in `chromium`, `firefox` and `webkit`:
   - `node scripts/interaction-check.mjs https://localhost:8787/`
   - `BASE=https://localhost:8787 node scripts/admin-check.mjs`
   - `BASE=https://localhost:8787 node scripts/admin-phase2-check.mjs`
4. `node scripts/public-phase2-check.mjs --browsers=chromium,firefox,webkit --base=https://localhost:8787`.
5. `node scripts/csp-check.mjs`.
6. With `NODE_TLS_REJECT_UNAUTHORIZED=0` (local self-signed certificate only):
   - `BASE=https://localhost:8787 node worker/dev/api-check.mjs`
   - `node scripts/enquiry-check.mjs https://localhost:8787`

## Results at the final commit

| Suite | Chromium | Firefox | WebKit |
|-------|----------|---------|--------|
| interaction-check | 83/83 | 77 pass + 6 info | 77 pass + 6 info |
| admin-check (1440 and 390 px) | 132/132 | 132/132 | 132/132 |
| admin-phase2-check | 46/46 | 46/46 | 46/46 |
| public-phase2-check | 56/56 across the three browsers | | |
| csp-check | 12/12 | 12/12 | 12/12 |
| api-check | 216/216 (no browser) | | |
| enquiry-check | 10/10 (no browser) | | |

- **Interaction-check "info" lines.** These are the six frame-pacing measurements. They are judged only in Chromium, where the CPU is throttled 4x. Headless Firefox and WebKit draw without a GPU and can't be throttled, so their frame gaps are recorded but not judged.
- **WebKit "access control checks" lines.** In WebKit, admin-check also counts messages of the form "<this site's URL> due to access control checks". Playwright's WebKit build for Windows logs these for requests that a page change cuts short. Only messages naming this site are excluded; one naming another host still fails the run.

Throttled performance (production build, CPU 6x, 1.6 Mbit/s and 150 ms, 390 px phone), from `public-phase2-check --perf`. The local Worker serves files uncompressed, so JS and CSS are raw sizes; gzip on the live site brings JS to about 177-192 KB per page (`.agents/tasks/admin-phase2/perf.md`).

| Page | LCP | CLS | Long tasks | TBT | JS | CSS | Images |
|------|-----|-----|-----------|-----|------------------|-----|--------|
| `/` | 1.98 s | 0 | 3 | 836 ms | 516 KB | 72 KB | 582 KB |
| `/collection` | 2.11 s | 0 | 2 | 627 ms | 466 KB | 72 KB | 274 KB |
| `/about` | 3.60 s | 0 | 2 | 739 ms | 463 KB | 72 KB | 562 KB |
| `/contact` | 1.86 s | 0 | 3 | 753 ms | 475 KB | 72 KB | 229 KB |
