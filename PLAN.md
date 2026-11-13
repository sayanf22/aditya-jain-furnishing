# Aditya Jain – Home Furnishing Showroom Website: Build Plan

Status: plan v8. Home page revision rounds 2 to 4 built locally with stand-in images (no video, photo-based "Our looks", enquiry form, full-width footer, category cards that widen on hover); waiting for your review before the Collection page.
Source of truth: **Website Development Agreement – Revised, 26 October 2026**. It replaces the 12 October agreement in full. The other PDFs fill in detail only where the revised agreement says nothing.
Client PDFs: `docs/client-pdfs/` (kept out of git).

---

## 1. Decisions confirmed

| Topic | Decision |
|---|---|
| Framework | **Next.js 16.4.3** (App Router) on Cloudflare Workers through the **OpenNext adapter** (`@opennextjs/cloudflare` 1.20.15). vinext removed |
| Hosting | Cloudflare Workers **Free plan** only, in the client's own Cloudflare account |
| Local-only | Built and tested on this computer. Nothing is deployed or connected to Cloudflare until the client's account exists. Code is pushed to GitHub only |
| Way of working | One page at a time: Home first, get approval, then the next page |
| Footer credit | "Made by whycreatives.in", linked to https://whycreatives.in, in the bottom row of the dark footer |
| Video | None anywhere on the site (your instruction, round 2). Watch & Buy uses room photos instead |
| Upholstery Fabric | Flat list as in the revised agreement: Fabric, Velvet, Linen, Prints, Leather |
| Best-sellers, "12+ years" | Left out (dropped from the revised agreement, not confirmed) |
| Code repository | Private GitHub repo `sayanf22/aditya-jain-furnishing` |
| Design direction | The Floor & Furnishings screenshots you sent: full-screen photo hero with the headline bottom left and a terracotta button, a terracotta ribbon of category names, then a row of tall category cards with "Explore" buttons. Warm ivory and sand backgrounds, terracotta accent, near-black text, one font (Instrument Sans, regular to semibold, no italics) |

## 1a. Business details (from the client's visiting card)

| Field | Value | Shown in |
|---|---|---|
| Name | Delta Furnishings (legal: Delta Furnishings Pvt Ltd) | Header logo, hero, footer, page title |
| Address | 77, First Floor, Furniture Block, Kirti Nagar, New Delhi 110015 | Quick enquiry, footer, "Get directions" (Google Maps search) |
| Mobile | +91 98112 68268 | Call buttons, footer |
| GSTIN | 07AAECD7008E1ZZ | Footer |

Stored in `migrations/0003_business_settings.sql` (editable later from the dashboard).

**Not confirmed yet** (asked of the client before launch): whether the mobile number is also the WhatsApp number (the local preview assumes it is), the Instagram handle (the Instagram button stays hidden until it's added), the logo (a text logo is used for now).

## 2. The documents, oldest to newest

| Date (inside the PDF) | Document | Status |
|---|---|---|
| 9 Oct 2026 | Quotation v5 (₹20,000, 3 weeks) | Superseded |
| 12 Oct 2026 | Agreement (₹22,000, 3 weeks) | Replaced by the revised agreement |
| 13 Oct 2026 | Animations add-on quotation (₹3,000) | Folded into the revised agreement |
| 25 Oct 2026 | Meeting notes | Detail source only |
| **26 Oct 2026** | **Revised agreement (₹25,000, 4 weeks)** | **Source of truth** |

## 3. Contradictions and how they are resolved

| Topic | Older documents | Used (revised agreement) |
|---|---|---|
| Price and time | ₹20,000 / ₹22,000, 3 weeks | ₹25,000, 4 weeks from the cleared advance |
| Category names | Sofa Fabrics, Curtains, Carpets, Wallpapers, Cushions | Upholstery Fabric, Curtains & Blinds, Carpets & Mats, Cushions, Wallpaper |
| Category order | Meeting notes give two different orders | 1 Upholstery Fabric, 2 Curtains & Blinds, 3 Carpets & Mats, 4 Cushions, 5 Wallpaper |
| Wallpaper | 5–6 categories | One collection |
| Carpets | Single collection | Carpets, Mats, Direct collections |
| Pages | Home, Categories, Subcategories, Gallery, About, Contact | Home, Collection, Gallery, Contact (no About page) |
| Enquiry form | Excluded (12 Oct) | Included, with B2C / B2B dropdown; shown in the dashboard; no email or SMS alerts |
| Instagram | Not mentioned | Quick-enquiry link, plus tap-to-call |
| Interactive décor | "Choose curtain, then fabric" game (meeting) | Admin uploads ready images; visitor taps a texture; the image swaps |
| Animations | Hover effects were a separate add-on | Hero, page transitions, scroll, gallery zoom, hover, product cards and buttons all included |
| Admin dashboard | Products and images only | Every part of the site |
| Hosting cost | "Evaluate the $5 plan" (meeting) | Free plan; paid plan only if usage outgrows it, paid by the client |

## 4. What we are building

**Pages**, built in this order, one at a time:
1. **Home**: Hero (2–3 animations) → Five main categories (hover expands subcategories) → Interactive home décor → Watch & Buy ("Our looks": room photos with tappable product dots, no video) → Customer testimonials → Quick enquiry with the enquiry form.
2. **Collection**: browse by category and subcategory, with images and descriptions.
3. **Gallery**: products and décor, with zoom and search.
4. **Contact**: enquiry form, WhatsApp, Instagram, phone.
5. **Admin dashboard** (secure login): categories, subcategories, products and images, décor images, Watch & Buy looks (photo and product dots), testimonials, enquiries (B2C/B2B), contact details.

**Catalogue** (seeded in the local database)
| # | Category | Inside |
|---|---|---|
| 1 | Upholstery Fabric | Fabric, Velvet, Linen, Prints, Leather |
| 2 | Curtains & Blinds | Curtains group (up to 10 types, plus Prints) · Blinds group (4–5 types) |
| 3 | Carpets & Mats | Carpets · Mats · Direct collections (everything on one page) |
| 4 | Cushions | One collection |
| 5 | Wallpaper | One collection |

**Site-wide**: WhatsApp icon fixed on the right; Instagram quick-enquiry; tap-to-call; a WhatsApp button on every product that names the product. No cart, checkout or payments.

**Not included**: cart or payments, email or SMS alerts, extra categories or pages, photography, video or image editing, advanced SEO.

## 5. How it stays fast and inside the free plan

Free-plan limits: **100,000 Worker requests a day** and **10 ms of CPU per request**. Waiting for D1, R2 or another server doesn't count toward the 10 ms, only the Worker's own work. Requests for static files (JS, CSS, fonts, icons) are free and don't count toward the 100,000.

```
Visitor
  ├─ /_next/static/*, fonts, icons ──► Workers Static Assets            free, not counted, Worker never runs
  ├─ pages (/, /collection/…)       ──► OpenNext cache interception     pre-rendered HTML from static assets,
  │                                                                     Next.js server not loaded
  ├─ /api/*                         ──► worker/api.ts (small handlers)  quick D1 / R2 call, Next.js server not loaded
  └─ unknown URLs (404)             ──► Next.js server                  only case that loads the Next.js server
```

The rules that keep it this way:

| Rule | Why |
|---|---|
| Every public page is **pre-rendered at build time** (`export const dynamic = "force-static"`), reading the catalogue from D1 during the build | Visits don't render anything on the Worker |
| OpenNext **static-assets incremental cache** with **cache interception** on (`open-next.config.ts`) | Pre-rendered pages are answered without starting the Next.js server |
| **Custom Worker entry** (`worker/index.ts`) sends `/api/*` to small handlers in `worker/api.ts` | Form posts and dashboard calls never load the Next.js server (about 4.6 MB of code) |
| Cache Components / Partial Prerendering **off** | Cache interception doesn't work with them |
| No middleware / proxy | It would run on every request |
| Links prefetch **on hover or touch**, not on scroll into view | Next.js would otherwise fetch every visible link in the background, and each prefetch is a Worker request |
| Photos resized in the admin's browser at upload (3 WebP widths); no image optimisation on the Worker | Image resizing is heavy CPU work |
| After launch, photos are served from R2's own custom domain | Photo requests then don't count as Worker requests |
| Admin login through Cloudflare Access (email code), checked in `worker/api.ts` | No password hashing on the Worker |

**Updating content**: because pages are pre-rendered, a change in the dashboard reaches the public site after a rebuild. The dashboard's Publish button will trigger a Cloudflare Workers Builds rebuild (about 2–3 minutes; free plan includes 3,000 build minutes a month). If instant updates are needed later, switch `open-next.config.ts` to the R2 incremental cache with a D1 tag cache and call `revalidatePath` on save; that is a configuration change, not a rewrite.

**Server-side rendering later**: any page can render per request by switching it to `export const dynamic = "force-dynamic"`. On the free plan that loads the Next.js server and may go over 10 ms CPU; on Workers Paid ($5 a month, paid by the client) the limit is 30 seconds. Route handlers can also move back into `app/api/` then.

**Measured locally** (OpenNext build served by Wrangler on workerd, the same runtime Cloudflare uses; `scripts/server-timing.mjs`, 40 requests per route):

| Route | Median | Compared with a static JS file (Worker doesn't run) |
|---|---|---|
| `/_next/static/…js` | 7.4–7.6 ms | baseline |
| `/` (pre-rendered page) | 7.5 ms | same as baseline: the Worker does almost no work |
| `/api/health` | 5.3 ms; first request 6 ms | Next.js server not loaded |
| `/no-such-page` (404) | 8.5 ms; **first request 183 ms** | first 404 in a fresh Worker loads the Next.js server |

**CPU time per request, local estimate** (`npm run cpu`: the DevTools CPU profiler on the local Worker, 30 requests per route). Every local request carries 4.5–5.5 ms of Wrangler dev-wrapper and profiler overhead, measured on `/api/health`, which does almost nothing; the route's own work is the figure above that:

| Route | Route's own CPU work | First request in a fresh Worker |
|---|---|---|
| `/` (pre-rendered page) | about 1.7–2.5 ms | about 3–12 ms |
| `/no-such-page` (404) | about 2.6–3.3 ms | **about 110 ms** (loads the Next.js server) |
| `/api/health` | baseline | about 4–24 ms |

Cloudflare's docs give 2.2 ms as the average CPU time of a Worker request, and 10–20 ms for server-side rendering. The real figure for this site comes from Workers Logs once it runs on Cloudflare.

- Worker startup (`wrangler check startup`): 28 ms of CPU locally, against a 1-second startup limit. Bundle 4.6 MB, 985 KB gzipped.
- Phone profile (`scripts/perf-check.mjs`: 4x slower CPU, fast 4G), placeholder page: LCP 0.43–0.47 s, layout shift 0, blocking time 100–135 ms (target under 200). JavaScript is 445 KB before compression, almost all React and the Next.js router; files are cached for a year.

**Remaining risks, stated plainly**
- The first 404 (or any non-pre-rendered page) in a fresh Worker loads the Next.js server. That one request may go over 10 ms of CPU on the free plan and fail with error 1102. It doesn't affect pre-rendered pages, static files or `/api/*`.
- Local timings are not Cloudflare's CPU figures. The real CPU per request is read from Workers Observability once the site runs on the client's account (step 11). If pages are near the limit, turning on Workers Cache in front of the Worker (`"cache": { "enabled": true }`) serves them without running the Worker at all; cache hits then count as requests, including static files.
- OpenNext warns that it isn't fully supported on Windows. Builds work locally; Cloudflare's production builds run on Linux. If local builds start failing, move development into WSL.
- The Next.js client runtime is heavier than vinext's (blocking time 100–135 ms vs 2–13 ms on the phone profile for an empty page). Every page is checked against the 200 ms target before it's shown to you.

## 6. Stack (installed)

| Layer | Package | Installed version |
|---|---|---|
| Framework | next | 16.4.3 (Turbopack) |
| Cloudflare adapter | @opennextjs/cloudflare | 1.20.15 |
| UI | react, react-dom | 19.3.1 (`<ViewTransition>` is stable in 19.3) |
| Styling | tailwindcss, @tailwindcss/turbopack | 4.3.3 |
| Language | typescript | 5.9.3 (the version create-next-app 16.4.3 installs) |
| Lint | eslint, eslint-config-next | 9.39.5, 16.4.3 |
| Cloudflare CLI | wrangler | 4.156.0 |
| Speed checks | @playwright/test + Chromium | 1.64.1 |

Added when a step needs them: Zod (enquiry form and admin input), jose (Access token check), @dnd-kit/react (admin drag-reorder).

`npm audit`: 0 vulnerabilities. `package.json` overrides `glob` to 10.5.0 inside `@node-minify/core` (an OpenNext build tool) to clear a high-severity glob CLI advisory.

Node.js 22.16.0 meets every package's requirement; `.node-version` pins 22 for Cloudflare's build machines.

**Cloudflare services (all free)**
| Service | Use | Free limit |
|---|---|---|
| Workers + static assets | Site and API | 100,000 Worker requests a day; 10 ms CPU per request; static files free |
| D1 (`DB`) | Catalogue data, enquiries | 5 GB; 5 million rows read and 100,000 written a day |
| R2 (`MEDIA`) | Photos | 10 GB; 1M writes and 10M reads a month; no egress fees |
| Workers Builds | Rebuild on Publish | 3,000 build minutes a month |
| Access (Zero Trust free) | Admin login with an email one-time code | No passwords stored |
| Turnstile | Spam protection on the enquiry form (switched on only when `TURNSTILE_SECRET` is set; off locally) | Free |
| Rate limiting binding (`ENQUIRY_LIMITER`) | 5 enquiries a minute per visitor | Free |

**Animations**, no animation library: React `<ViewTransition>` for the page slide from the right; CSS for the hero reveal, staggered category tiles, hover and button effects; a small IntersectionObserver hook for scroll fade-and-rise; native `<dialog>` for gallery zoom. All motion turns off for "reduce motion".

**Fonts**: self-hosted with `next/font/local` (no italic or thin weights).

**Performance targets**: Lighthouse 95+ on mobile; LCP under 2 seconds on 4G; blocking time under 200 ms on the phone profile; hero image under 150 KB.

## 7. Data model (D1, `migrations/0001_init.sql`)

| Table | Holds |
|---|---|
| `categories` | The five categories: slug, name, tagline, image, position |
| `subcategories` | Category, optional parent group, slug, name, one line, image, position, visible |
| `products` | Category, optional subcategory, slug, name, description, position, visible |
| `product_images` | R2 key, width, height, alt text, position |
| `decor_scenes`, `decor_options` | A scene and its texture options, each with a swatch and a ready image |
| `looks`, `look_hotspots` | Watch & Buy: a room photo, and the product dots on it (position, name, linked category or product). Replaced `watch_items` in `migrations/0004_looks_and_enquiry_fields.sql` |
| `testimonials` | Name, text, position, visible |
| `enquiries` | Date, B2C or B2B, name, firm (B2B, added in 0004), phone, message, product or category, source page (added in 0004), read or unread |
| `settings` | WhatsApp number, Instagram handle, phone, address, hero images |

`migrations/0002_seed_catalogue.sql` adds the five categories and the subcategory names from the revised agreement. Checked: a pre-rendered page reads these rows from the local D1 during `next build`.

## 8. Routes

| Route | Served by | Purpose |
|---|---|---|
| `/` | Pre-rendered | Home |
| `/collection` | Pre-rendered | All five categories |
| `/collection/[category]` | Pre-rendered | Category with its subcategories |
| `/collection/[category]/[subcategory]` | Pre-rendered | Products; each opens in a zoom view with description and WhatsApp button |
| `/collection/[category]/all` | Pre-rendered | Direct collections: everything in the category |
| `/gallery` | Pre-rendered | Grid, search and category filter (search runs in the browser) |
| `/contact` | Pre-rendered | Enquiry form and contact options |
| `/admin/*` | Pre-rendered shell, live data from `/api/admin/*` | Dashboard (behind Access) |
| `/api/health` | `worker/api.ts` | Health check (exists now) |
| `/api/enquiry`, `/api/admin/*`, `/api/media/*` | `worker/api.ts` | Form submission, dashboard data, uploads, photos from R2 |
| `/sitemap.xml`, `/robots.txt` | Pre-rendered | Basic SEO |

## 9. Project layout

```
client4/
├─ app/                  Next.js pages (layout, Home placeholder for now)
├─ worker/index.ts       Worker entry: /api/* → worker/api.ts, rest → OpenNext
├─ worker/api.ts         Small API handlers
├─ migrations/           D1 schema and catalogue seed
├─ scripts/              perf-check.mjs (phone profile), server-timing.mjs (local Worker timings)
├─ public/_headers       Year-long caching for /_next/static/*
├─ open-next.config.ts   Static-assets cache + cache interception
├─ next.config.ts        Tailwind via Turbopack; local bindings for `next dev`
├─ wrangler.jsonc        Worker, static assets, D1, R2; send_metrics off
├─ docs/client-pdfs/     Client PDFs (not in git)
└─ PLAN.md, README.md, AGENTS.md
```

## 10. Commands

| Command | Does |
|---|---|
| `npm run dev` | Next.js dev server on http://localhost:3000, with local D1 and R2 |
| `npm run build` | Next.js production build |
| `npm run preview` | OpenNext build, then serves the Worker locally on http://localhost:8787 |
| `npm run typecheck` | Regenerates binding types, then type-checks |
| `npm run lint` | ESLint |
| `npm run db:migrate:local` | Applies D1 migrations to the local database |
| `npm run perf -- <url>` | Phone-profile speed check |
| `node scripts/server-timing.mjs <base> <routes…>` | Local Worker response times per route |
| `npm run deploy` | Deploys to Cloudflare. Not used until the client's account exists |

## 11. Build steps

Each step ends with a check before the next one starts.

| Step | Work | Check | Status |
|---|---|---|---|
| 1 | Next.js 16.4.3 + OpenNext; Wrangler config; custom Worker entry; lint, types, git, GitHub | `next build`, OpenNext build, local Worker serves `/` (cache HIT) and `/api/health`; lint and type check pass | Done |
| 2 | D1 and R2 bindings; schema; catalogue seed; Playwright | Pre-rendered page reads D1 at build; D1 readable at request time; `next dev` sees local D1 | Done |
| 3 | Design tokens, font, header, footer, floating WhatsApp button | Screenshots at 390 px and 1440 px | Done |
| 4 | **Home page**, section by section in the agreed order, with its animations (see §11a) | Screenshots; `scripts/interaction-check.mjs` all PASS; your approval | Built, waiting for your review |
| 5 | Speed check of the Home page | LCP < 2 s, CLS < 0.1, blocking time < 200 ms on the phone profile; page served as cache HIT | Done (§11a) |
| 6 | **Collection pages** | Your approval | |
| 7 | **Gallery** | Your approval | Built with 20 stand-in photos (uncropped masonry grid, category filter, search, zoom viewer with Enquire); checks in `scripts/interaction-check.mjs`; phone LCP 1.5 s, CLS 0 |
| 8 | **Contact** page. The enquiry form and `/api/enquiry` were already built with the Home page (round 2) and are reused here | Test enquiry saved; bad input rejected (`scripts/enquiry-check.mjs` already passes) | Form done; page to do |
| 9 | **Admin dashboard** and Publish button | Full add, edit, reorder, delete and rebuild cycle locally | |
| 10 | Performance and basic SEO | Lighthouse mobile 95+; sitemap valid | |
| 11 | Once the client's account exists: deploy to `workers.dev` behind Access; connect Workers Builds; read real CPU per request | Preview opens for approved emails only; CPU per request known | |
| 12 | Client review and revisions (6 minor included) | Client approval | |
| 13 | Launch after final payment: domain, R2 photo domain, Access on `/admin` only | SSL, speed, admin login, enquiry form checked live | |

## 11a. Home page (built)

Sections in the agreed order, all pre-rendered from D1 at build time:

| # | Section | What it does | Code |
|---|---|---|---|
| – | Header | Text logo centred, links left, Call and Enquire right. Enquire is a round WhatsApp button that opens into a pill on hover (or keyboard focus) and slides in its "Enquire" label (40 px to 116 px). Transparent over the hero, turns solid ivory on scroll. Phone: the burger turns into a cross, and a full-screen menu slides in with its links rising one by one, plus Call, WhatsApp and the address. Closes on tap, Escape or page change | `components/SiteHeader.tsx` |
| 01 | Hero | Full-screen photo slides: cross-fade, slow zoom on the active photo. The headline rises in word by word on every slide, on desktop and phone. A new slide every 6 s, shown as a bar filling the active dot (the slide changes when the bar ends, so they never drift apart). The timer waits while the hero is scrolled away or the tab is in the background; it no longer stops while the mouse rests on the photo. Dots only, no pause button (your choice, round 5). No auto-advance for "reduce motion". Only the first photo loads with the page | `components/home/Hero.tsx`, `components/Words.tsx` |
| – | Ribbon | Terracotta strip with the five category names scrolling (CSS only), pauses on hover | `components/home/Marquee.tsx` |
| 02 | Main categories | Five tall cards in the agreed order. Desktop, in steps: hover widens the card (the others give way) and eases the photo in, then space opens under the name, then the subcategories rise in one by one; leaving reverses it. Each card has one name, one chip list and one button, so nothing is drawn twice. The photo keeps one width and the name and chip list have fixed widths, so no text re-wraps mid-animation. Phone: swipe row, subcategories always shown. Carpets & Mats also links "Direct collections" | `components/home/Categories.tsx` |
| 03 | Interactive home décor | Rounded sand panel. Tap a texture swatch, the matching photo cross-fades in; "Enquire about this look" opens WhatsApp naming the texture | `components/home/DecorPicker.tsx` |
| 04 | Watch & Buy ("Our looks") | Room photos in a carousel with arrows and dots. Changing look plays in steps: the new photo slides in from the side you're heading to while the old one drifts away and dims, the photo settles from a slight zoom, the product dots pop in one by one, and the side panel (look number, name, product names) slides in from the same side. Tapping a dot shows the product with "Enquire on WhatsApp" (names the product) and a link to its category. No video | `components/home/ShopTheLook.tsx` |
| 05 | Testimonials | Right after Watch & Buy; hidden when no reviews exist | `components/home/Testimonials.tsx` |
| 06 | Quick enquiry | Rounded sand panel: WhatsApp, Call, Instagram (once added), address with "Get directions", and the enquiry form (I am: Customer / Business (B2B), firm name for B2B only, name, mobile, optional category and message). Saved to D1; no email or SMS alerts | `components/home/QuickEnquiry.tsx`, `components/EnquiryForm.tsx` |
| – | Footer | Fully dark, edge to edge, with its two top corners rounded (bottom square); content lines up with the header; the legal row leaves room so the floating WhatsApp button never covers the credit: name, "Home furnishing showroom in Kirti Nagar, New Delhi.", WhatsApp / Call / Directions, explore links, categories, showroom address and phone, ©, GSTIN, "Made by whycreatives.in" (links to https://whycreatives.in) | `components/SiteFooter.tsx` |
| – | Floating WhatsApp | Terracotta (brand colour, not WhatsApp green), fixed on the right on every page; label slides out on hover | `components/FloatingWhatsApp.tsx` |

All WhatsApp buttons use the brand terracotta, and all icons share one line style (`components/icons.tsx`). Scroll reveal (fade and rise, and word-by-word headings) runs through one observer (`components/RevealObserver.tsx`). It also picks up sections added after start-up, so Home shows fully when reached through a link or the back button. An element that has appeared is marked with a `data-shown` attribute, not a class: React rewrites an element's class list whenever it re-renders it (for example on a hot reload in `npm run dev`), which used to drop the mark and blank the category cards. All motion turns off for "reduce motion". Each Home section and the footer sit in their own Suspense boundary, so React hydrates them one at a time instead of in one long task.

**Enquiry API** (`/api/enquiry`, `lib/enquiry.ts` through `worker/api.ts`; `app/api/enquiry/route.ts` only so the form works under `next dev`): same-site Origin only, JSON only, 8 KB body limit, hidden honeypot field, 5 a minute per visitor (rate limiting binding), field rules shared with the form (`lib/enquiry-rules.ts`), Turnstile once its secret is set.

**Stand-in content (local only)**: `seeds/demo-local.sql` points the page at stock images from Pexels and a public-domain William Morris wallpaper (licences in `docs/stock-images.md`), and adds three testimonials clearly marked "Sample review". None of it goes to the client's database. The décor stand-ins show four different sofas; the client will photograph one product in each fabric.

**Page width**: one shared width (`shell` in `app/globals.css`) for the header, every section and the footer: up to 104rem wide, side margins 20 px on phones, 32 px on tablets, 40–64 px on desktops. From 1800 px wide screens up, the root text size grows (18, 20, then 24 px), and since everything is sized in rem the whole page scales up with it. A 2560 px screen now uses about 75% of its width for content (it was 47%). Sections have more space above and below (up to 128 px on desktop), and the longer lines of text were shortened.

**Checks (local, OpenNext build on workerd)**:
Round 6 (3 November 2026: Enquire button opens on hover, thin scrollbar, footer top corners rounded):
- `scripts/interaction-check.mjs`: all 34 checks pass, including the Enquire button opening (40 px → 116 px → back to 40 px), footer corners 48/48/0/0 px, and the footer credit clear of the floating WhatsApp button. Page scrollbar: 6 px wide, rounded, no arrow buttons (Firefox: its standard thin scrollbar). Phone profile: LCP 0.66 s, blocking time 81 ms.

Round 5 (3 November 2026: hero pause button removed; category cards no longer go blank):
- `scripts/interaction-check.mjs`: all 31 checks pass, including "hero has slide dots only" and "category cards stay visible after a re-render". On `npm run dev`, editing `Categories.tsx` used to leave all five cards at opacity 0 after the hot reload; now they stay at 1. No React hydration warnings in the browser console.
- Nothing has been deployed to Cloudflare. The only Wrangler command for this project that talks about deploying was `wrangler check startup` on 30 October, which runs `deploy --dry-run` and stops before uploading. No account ID or database ID is in `wrangler.jsonc`, and GitHub shows no deployments, checks or webhooks.

Round 4 (2 November 2026: hero timer, Our looks slide, wider layout, dark footer, shorter text):
- Phone profile: LCP 0.67 s, layout shift 0, blocking time 78–79 ms. One visit: 1 Worker request, 26 static files (895 KB). Worker CPU for `/`: about 3.5 ms of its own work.
- `scripts/interaction-check.mjs`: all 30 checks pass. New: the hero changes by itself with the mouse resting on it (before: never), waits while the tab is hidden and carries on after, the pause button stops and restarts it; clicking the look arrow slides the new photo in (mid-way: new photo +245 px, old one -128 px at 57% opacity) at p95 16.8 ms with no frames over 50 ms at 4x slower CPU.

Round 3 (2 November 2026: category hover widens again, in steps; Home after a link; full-width footer):
- Phone profile: LCP 0.65 s, layout shift 0, blocking time 70–75 ms. One visit: 1 Worker request, 26 static files (891 KB). Worker CPU for `/`: about 3.7 ms of its own work.
- `scripts/interaction-check.mjs`: all 25 checks pass. New: the hovered card widens (403 px against 183 px), subcategories appear one by one, names never re-wrap, no overlapping text in the cards, Home shows every section after a link and after back/forward (before the fix, all 25 animated elements stayed hidden), footer spans the full width. Category hover at 4x slower CPU: p95 16.8 ms, no frames over 50 ms.

Round 2 (31 October 2026):
- Phone profile (4x slower CPU, fast 4G): LCP 0.67 s, layout shift 0, blocking time 84 ms (Lighthouse definition: after first paint; target under 200).
- Frame timing at 4x slower CPU: hero cross-fade, category hover (second card and across all five), phone menu and full-page scroll all at about 60 fps (p95 16.7–16.8 ms, no frames over 50 ms).
- One visit (phone, scrolled to the bottom): **1 Worker request** (the page), 26 static files (889 KB, free). About 100,000 such visits a day fit in the free plan.
- Worker CPU for `/`: about 3–4.5 ms of its own work per request (local estimate, two runs), under the 10 ms limit.
- `scripts/interaction-check.mjs`: all 18 checks pass (slide change, word-by-word headline on desktop and phone, card hover, swatch swap, look dots and arrows, no `<video>` on the page, form errors, B2B firm field, form submit, phone menu, no sideways scroll). No browser console errors.
- `scripts/enquiry-check.mjs`: all 10 checks pass (valid B2C and B2B saved; bad phone, bad type, other-site post, non-JSON, oversized body and GET refused; honeypot accepted silently; rate limit after 5).

Links to Collection, Gallery and Contact point at pages that come in the next steps, so they show the 404 page for now.

## 12. Needed from the client (by the time we reach each step)

Confirmation that 98112 68268 is on WhatsApp; Instagram handle; logo; product photos; final subcategory names (curtain and blind types); décor images; Watch & Buy room photos and which products are in each; testimonials; WhatsApp number, Instagram handle, showroom phone; the email for the Cloudflare account; domain. Questions go to you as a WhatsApp-ready message when we reach them.

## 13. Sources checked (October 2026)

- OpenNext on Cloudflare: [get started](https://opennext.js.org/cloudflare/get-started), [caching (SSG static-assets cache, cache interception)](https://opennext.js.org/cloudflare/caching), [bindings](https://opennext.js.org/cloudflare/bindings), [custom Worker](https://opennext.js.org/cloudflare/howtos/custom-worker)
- Cloudflare's OpenNext guide and feature table: [Workers docs](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)
- Next.js 16.4 docs bundled in `node_modules/next/dist/docs/` (Partial Prefetching needs Cache Components; `<Link prefetch>` options; route segment `dynamic`)
- Workers free limits, static asset billing and Workers Cache billing: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing), [Workers Cache](https://developers.cloudflare.com/workers/cache/)
- Workers Builds limits and deploy hooks: [limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/), [deploy hooks](https://developers.cloudflare.com/workers/ci-cd/builds/deploy-hooks/)
- D1 and R2 free limits: [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing), [R2 pricing](https://developers.cloudflare.com/r2/pricing)
- Access on Workers and one-time PIN: [changelog](https://developers.cloudflare.com/changelog/post/2026-08-14-workers-access/), [one-time PIN](https://developers.cloudflare.com/cloudflare-one/identity/one-time-pin)
- React `<ViewTransition>` stable: [React 19.3](https://react.dev/blog/2026/09/09/react-19-3)
