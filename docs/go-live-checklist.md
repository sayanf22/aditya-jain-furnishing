# Go-live checklist (lead)

Everything below runs against the live Cloudflare account (`4f5b8e20afb6be7b174fa1e1ee1ce0c1`, Worker `aditya-jain-furnishing`). Nothing here was run from the build computer: the code is committed locally and has not been pushed. Background for each step is in [admin-architecture.md](admin-architecture.md) and [security-audit.md](security-audit.md).

## 1. Live migrations, in order, per database

Run from the repository root after `git pull`. `list` shows what is still pending. `apply` runs only the files that the database's `d1_migrations` table does not have yet, in file-name order, so it is safe whatever the live state is. Do `DB` first: the site build and the dashboard read it.

| Order | Binding | Live database | Files (in order) |
|---|---|---|---|
| 1 | `DB` | `aditya-jain-furnishing-db` | `migrations/0001_init.sql`, `0002_seed_catalogue.sql`, `0003_business_settings.sql`, `0004_looks_and_enquiry_fields.sql`, `0005_interactive_room.sql`, `0006_contact_number.sql`, `0007_catalogue_v2.sql`, `0008_catalogue_descriptions.sql`, `0009_admin_content.sql`, `0010_fixed_heroes.sql` (new this round) |
| 2 | `AUTH_DB` | `delta-auth-db` | `migrations-auth/0001_auth.sql`, `0002_email_codes.sql` (new this round) |
| 3 | `ENQ_DB` | `delta-enquiries-db` | `migrations-enquiries/0001_enquiries.sql` |
| 4 | `AUDIT_DB` | `delta-audit-db` | `migrations-audit/0001_audit.sql` |

```powershell
foreach ($db in 'DB','AUTH_DB','ENQ_DB','AUDIT_DB') {
  npx wrangler d1 migrations list $db --remote
  npx wrangler d1 migrations apply $db --remote
}
```

- [ ] `migrations list` shows nothing pending for all four afterwards.
- [ ] `0010_fixed_heroes.sql` only deletes saved hero replacements (`site_images` rows for `home.hero.*`, `collection.hero`, `about.hero`, `contact.hero`) and clears uploaded `categories.hero_image_key`. Their photos stay in R2 until step 4's sweep.
- [ ] Never edit a migration file that has been applied. Add a new numbered file instead.

## 2. Secrets and variables

Worker secrets (`npx wrangler secret put <NAME>`, or the dashboard: Worker, Settings, Variables and Secrets). The Worker treats a value that is too short or contains `change-me` as not set, and answers 503.

- [ ] `SESSION_PEPPER`: 32+ random characters (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`). Set it once. Changing it signs everyone out and invalidates every stored password.
- [ ] `SETUP_CODE`: 20+ random characters. Delete it right after step 3.
- [ ] `EXPORT_TOKEN`: 32+ random characters. Use the same value as the build variable below.
- [ ] `DEPLOY_HOOK_URL`: the Workers Builds deploy hook for `main`. Without it the Publish button says "not set up".
- [ ] `RESEND_API_KEY`: the key from the client's Resend account. Without it the sign-in screen says email codes are not set up, and password sign-in still works.
- [ ] `RESEND_FROM` is a plain variable in `wrangler.jsonc` (`Delta Furnishings <onboarding@resend.dev>`). It deploys with the Worker. Do not also create a secret with that name. Change it in `wrangler.jsonc` only after a domain is verified in Resend.
- [ ] Optional, always both together: Turnstile `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (build variable) and `TURNSTILE_SECRET` (Worker secret).

Workers Builds build variables (Settings, Build, Variables):

- [ ] `EXPORT_URL` = the live site's origin (for example `https://aditya-jain-furnishing.<subdomain>.workers.dev`), and `EXPORT_TOKEN` = the same value as the secret. Without these, `scripts/build-db.mjs` builds from the stand-in content in `seeds/` (sample designs), not from the dashboard.

**Resend limitation (the client has no domain yet).** Until a domain is verified in Resend, the only sender allowed is `onboarding@resend.dev`, and Resend delivers only to the email address that owns the Resend account. Any other recipient gets a 403 ([Resend: 403 with resend.dev](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)). So the dashboard owner's email must be the Resend account's own address. The free plan allows 100 emails a day and 3,000 a month ([Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits)). The Worker also caps code requests at 20 an hour across everyone.

## 3. First deploy and owner account

- [ ] Push `main`. Workers Builds runs `npm run build`, then `npx wrangler deploy`. The build log shows `scripts/sync-content.mjs` loading the export, not the "building from the stand-in content" warning. The export comes from the Worker that is already live, so do steps 1 and 2 before pushing. If the export fails, the build stops on purpose (it never publishes an empty site). If the live Worker is older than this commit and has no `/api/content/export`, deploy once without `EXPORT_URL`/`EXPORT_TOKEN`, add them, then build again.
- [ ] `GET /api/health` answers 200.
- [ ] Open `/admin/setup`, enter `SETUP_CODE`, the owner's email (the Resend account's address, see above), name and a password of 12+ characters. Then delete the `SETUP_CODE` secret. `/admin/setup` must now refuse.
- [ ] Optional: turn on the authenticator app under Security.

## 4. Remove sample content from the live database

Sample designs are rows whose first photo key starts with `demo/`. They come only from `seeds/`, and no migration inserts them. Check (read-only):

```powershell
npx wrangler d1 execute DB --remote --command "SELECT COUNT(*) AS samples FROM products p WHERE (SELECT image_key FROM product_images i WHERE i.product_id = p.id ORDER BY position, id LIMIT 1) LIKE 'demo/%'"
npx wrangler d1 execute DB --remote --command "SELECT COUNT(*) AS reviews FROM testimonials"
```

- [ ] If `samples` is above 0: dashboard, Designs, **Remove samples** (it calls `DELETE /api/admin/products/sample`, which is audited and bumps the content version). Run the count again: it shows 0.
- [ ] Reviews: keep only real ones (dashboard, Site, Testimonials).
- [ ] Default photos (`public/demo/` files used by the replaceable places and Home category cards) stay. They are static files, not database rows, and cannot be deleted.
- [ ] Photos, Clear unused (`POST /api/admin/media/sweep`): it removes photos left unused by `0010` or by failed uploads, older than 60 minutes, from D1 and R2.
- [ ] Publish. The site rebuilds without the samples.

## 5. Checks against the live site

Replace `<site>` with the live origin.

- [ ] `/`, `/collection`, a collection page, `/about`, `/contact`, `/admin/login`: the browser console shows no CSP messages. From this computer: `node scripts/csp-check.mjs https://<site>`.
- [ ] Headers on `/` include `Content-Security-Policy` (no `'unsafe-inline'` in `script-src`), `Strict-Transport-Security: max-age=31536000`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: SAMEORIGIN`. `/admin/login` has `X-Frame-Options: DENY` and `X-Robots-Tag: noindex`. `/api/health` has `Cache-Control: no-store`.
- [ ] Enquiry form on `/contact`: sending works, and the enquiry shows under Enquiries in the dashboard. Six quick sends in a minute get "too many".
- [ ] Sign in with email and password. Sign out.
- [ ] Forgot password: "Email me a code", the code arrives at the Resend account's address within a minute, a wrong code is refused, the right one leads to "set a new password", then the new password works. With the authenticator app on, the app code is asked for as well.
- [ ] Photos: upload one on Site (About, who we are), Save, then Publish. The page shows it. Remove it: the default photo returns, and the photo is gone from Photos.
- [ ] Hero photos (Home slides, page headers) are not listed anywhere in the dashboard.
- [ ] Phone (390 px) and desktop: footer logo in clean greys, no red in the footer. No sideways scroll.

## 6. PBKDF2 CPU check (Workers Free, 10 ms CPU per request)

- [ ] After a few sign-ins and a password change: Workers and Pages, `aditya-jain-furnishing`, Observability (Workers Logs). In the Query Builder, filter the request path for `/api/admin/auth/login`, `/api/admin/auth/setup`, `/api/admin/auth/password`, `/api/admin/auth/password/reset` and `/api/admin/media`, and read MAX of `$workers.cpuTimeMs` ([Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)).
- [ ] If any of them is above 10 ms, set `PBKDF2_ITERATIONS` in `lib/server/crypto.ts` to 10,000 (never lower), commit and push. Stored passwords re-hash at the next sign-in.
- [ ] Check `GET /api/admin/*` reads too (expected well under 10 ms).

## 7. After a domain is bought

- [ ] Verify the domain in Resend, set `RESEND_FROM` in `wrangler.jsonc` to an address on it, push.
- [ ] Add the custom domain to the Worker, update `EXPORT_URL`, and consider HSTS `includeSubDomains` once nothing runs on plain http.
