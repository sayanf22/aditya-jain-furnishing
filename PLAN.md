# Aditya Jain – Home Furnishing Showroom Website: Build Plan

Status: plan v3 (vinext). Setup and local database done. Waiting for the design guide.
Source of truth: **Website Development Agreement – Revised, 26 October 2026**. It replaces the 12 October agreement in full. The other PDFs fill in detail only where the revised agreement says nothing.
Client PDFs: `docs/client-pdfs/` (kept out of git).

---

## 1. Decisions confirmed

| Topic | Decision |
|---|---|
| Framework | Next.js code (App Router) run by **vinext**, Cloudflare's Next.js-on-Vite toolchain. No OpenNext |
| Hosting | Cloudflare Workers **Free plan** only, in the client's own Cloudflare account |
| Way of working | One page at a time: design and build the Home page, get approval, then the next page |
| Footer credit | "Built by WhyCreatives", in the bottom legal row next to the copyright line |
| Upholstery Fabric | Flat list as in the revised agreement: Fabric, Velvet, Linen, Prints, Leather |
| Best-sellers, "12+ years" | Left out (dropped from the revised agreement, not confirmed) |
| Code repository | Private GitHub repo `sayanf22/aditya-jain-furnishing` |

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
1. **Home**: Hero (2–3 animations) → Five main categories (hover expands subcategories) → Interactive home décor → Watch & Buy → Customer testimonials → Quick enquiry.
2. **Collection**: browse by category and subcategory, with images and descriptions.
3. **Gallery**: products and décor, with zoom and search.
4. **Contact**: enquiry form, WhatsApp, Instagram, phone.
5. **Admin dashboard** (secure login): categories, subcategories, products and images, décor images, Watch & Buy, testimonials, enquiries (B2C/B2B), contact details.

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

## 5. The 10 ms CPU limit and how we avoid it

On the free plan, each request may use 10 ms of CPU. Waiting for D1, R2 or another server does **not** count, only the Worker's own computing. The work that can go over is rendering a page. The options:

| Option | How it works | Updates go live | CPU risk | Free-plan request count |
|---|---|---|---|---|
| **A. Snapshot at build** | A script copies the catalogue from D1 into JSON before the build; every page is pre-rendered into static files. Publish button rebuilds | 2–3 minutes after pressing Publish | None: no rendering at request time | 1 request per page view |
| **B. Edge cache (ISR) with Workers Cache** | vinext renders a page once on the Worker, Cloudflare caches it worldwide and serves the copy without running the Worker. Saving in the dashboard clears that page's cache; it re-renders once on the next visit. Deploys pre-fill the cache (`--warm-cache`) | Seconds after saving | Only on that one re-render after a change | Every file counts, about 10–15 per page view, so roughly 7,000–10,000 page views a day |
| C. Workers Paid | Raises the limit to 30 seconds | – | None | $5 a month, paid by the client. Not wanted |

Whichever we pick, we keep the other heavy work off the request path: photos are resized in the admin's browser before upload, admin login uses Cloudflare Access (no password hashing), and enquiry checks are network waits.

**What I tested**: vinext cannot read D1 while pre-rendering during the build ("Cloudflare bindings are unavailable during build-time prerendering"). So option B needs the edge cache, and option A needs the JSON snapshot script. Reading D1 at request time works.

**Recommendation**: build the pages so they read data through one module (`lib/content.ts`). That module can read D1 (option B) or the snapshot (option A), so switching later only changes configuration. Once the Home page exists, we deploy a test copy to a WhyCreatives Cloudflare account and read the real CPU time per render in Workers Observability. If a render stays under about 5 ms, use B (instant updates). If not, use A.

## 6. Stack (installed)

| Layer | Package | Installed version |
|---|---|---|
| Next.js API on Vite | vinext | 1.4.0 |
| Cloudflare adapter and deploy | @vinext/cloudflare, @cloudflare/vite-plugin | 1.3.0, 1.66.0 |
| Bundler | Vite | 8.3.5 |
| UI | React, React DOM | 19.3.1 (`<ViewTransition>` is stable in 19.3) |
| Styling | Tailwind CSS | 4.3.3 |
| Language | TypeScript | 7.0.2 |
| Cloudflare CLI | Wrangler | 4.156.0 (the new `cf` CLI is still beta, so not used) |
| Screenshot checks | Playwright + Chromium | 1.64.1 |

Added when a step needs them: Zod (enquiry form and admin input), jose (Access token check), @dnd-kit/react (admin drag-reorder).

Node.js 22.16.0 is installed and meets every package's requirement; `.node-version` pins 22 for Cloudflare's build machines.

**Known audit note**: `npm audit` reports 5 moderate issues, all from one path: vinext → @vercel/og → satori → fflate 0.7 (an infinite loop when unzipping a malformed ZIP64 file). We don't generate OG images or unzip anything, and the only "fix" npm offers is downgrading vinext to 0.2.1. Recheck when vinext updates.

**Cloudflare services (all free)**
| Service | Use | Free limit |
|---|---|---|
| Workers + static assets | Site and API | 100,000 Worker requests a day; 10 ms CPU per request |
| D1 (`DB`) | Catalogue data, enquiries | 5 GB; 5 million rows read and 100,000 written a day |
| R2 (`MEDIA`) | Photos, videos | 10 GB; 1M writes and 10M reads a month; no egress fees |
| Workers Builds | Builds on push (and Publish, if option A) | 3,000 build minutes a month |
| Access (Zero Trust free) | Admin login with an email one-time code | No passwords stored |
| Turnstile | Spam protection on the enquiry form | Free |

**Photos**: resized in the admin's browser into 3 WebP widths (about 480, 960, 1600 px) and stored in R2. Frames follow each photo's own shape and show the whole product.

**Animations**, no animation library: React `<ViewTransition>` for the page slide from the right; CSS for the hero reveal, staggered category tiles, hover and button effects; a small IntersectionObserver hook for scroll fade-and-rise; native `<dialog>` for gallery zoom. All motion turns off for "reduce motion".

**Performance targets**: Lighthouse 95+ on mobile; LCP under 2 seconds on 4G; hero image under 150 KB; fonts self-hosted through `next/font` (no italic or thin weights).

## 7. Data model (D1, `migrations/0001_init.sql`)

| Table | Holds |
|---|---|
| `categories` | The five categories: slug, name, tagline, image, position |
| `subcategories` | Category, optional parent group, slug, name, one line, image, position, visible |
| `products` | Category, optional subcategory, slug, name, description, position, visible |
| `product_images` | R2 key, width, height, alt text, position |
| `decor_scenes`, `decor_options` | A scene and its texture options, each with a swatch and a ready image |
| `watch_items` | Video, poster, title, linked product |
| `testimonials` | Name, text, position, visible |
| `enquiries` | Date, B2C or B2B, name, phone, message, product or category, read or unread |
| `settings` | WhatsApp number, Instagram handle, phone, address, hero images |

`migrations/0002_seed_catalogue.sql` adds the five categories and the subcategory names from the revised agreement.

## 8. Routes

| Route | Purpose |
|---|---|
| `/` | Home |
| `/collection` | All five categories |
| `/collection/[category]` | Category with its subcategories |
| `/collection/[category]/[subcategory]` | Products; each opens in a zoom view with description and WhatsApp button |
| `/collection/[category]/all` | Direct collections: everything in the category |
| `/gallery` | Grid, search and category filter |
| `/contact` | Enquiry form and contact options |
| `/admin/*` | Dashboard (behind Access) |
| `/api/enquiry`, `/api/admin/*` | Route handlers: form submission, dashboard data, uploads |
| `/media/*` | Photos and videos from R2, cached for a year |
| `/sitemap.xml`, `/robots.txt` | Basic SEO |

## 9. Commands

| Command | Does |
|---|---|
| `npm run dev` | Local dev server (Vite) |
| `npm run build` | Production build into `dist/` |
| `npm run start` | Runs the built Worker locally with Wrangler |
| `npm run typecheck` | Regenerates binding types, then type-checks |
| `npm run db:migrate:local` | Applies D1 migrations to the local database |
| `npm run deploy` | Deploys (not used until the client's account exists) |

## 10. Build steps

Each step ends with a check before the next one starts.

| Step | Work | Check | Status |
|---|---|---|---|
| 1 | Create the vinext app, pin versions, Wrangler config, git and GitHub | Build, type check, local Worker serves `/` and `/api/hello` | Done |
| 2 | D1 and R2 bindings; schema; seed the catalogue; Playwright | Migrations apply; the five categories come back in order; D1 readable at request time | Done |
| 3 | **Your design guide** → colours, type, spacing, fonts, header, footer, floating WhatsApp button | Screenshots at 390 px and 1440 px | Next |
| 4 | **Home page**, section by section in the agreed order, with its animations | Screenshots; your approval | |
| 5 | Test deploy of the Home page; measure render CPU; choose option A or B (§5) | CPU time per render from Workers Observability | |
| 6 | **Collection pages** | Your approval | |
| 7 | **Gallery** | Your approval | |
| 8 | **Contact** and the enquiry form (B2C/B2B, Turnstile, saved to D1) | Test enquiry saved; bad input rejected | |
| 9 | **Admin dashboard** | Full add, edit, reorder, delete cycle | |
| 10 | Performance and basic SEO | Lighthouse mobile 95+; sitemap valid | |
| 11 | Deploy to the client's Cloudflare account on `workers.dev`, behind Access during review | Preview opens for approved emails only | |
| 12 | Client review and revisions (6 minor included) | Client approval | |
| 13 | Launch after final payment: domain, Access on `/admin` only | SSL, speed, admin login, enquiry form checked live | |

## 11. Needed from the client (by the time we reach each step)

Logo; product photos; final subcategory names (curtain and blind types); décor images; Watch & Buy content; testimonials; WhatsApp number, Instagram handle, showroom phone; the email for the Cloudflare account; domain. Questions go to you as a WhatsApp-ready message when we reach them.

## 12. Sources checked (October 2026)

- Cloudflare's Next.js guidance (vinext recommended, beta note): [Workers Next.js guide](https://developers.cloudflare.com/workers/frameworks/framework-guides/nextjs)
- vinext 1.0 (pre-rendering, ISR, cache warming): [Cloudflare blog](https://blog.cloudflare.com/vinext-nextjs-on-vite/), [vinext on GitHub](https://github.com/cloudflare/vinext), [vinext.dev](https://vinext.dev)
- Workers free limits and Workers Cache billing: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing), [Workers Cache](https://developers.cloudflare.com/workers/cache/)
- `cf` CLI beta status: [cf for Wrangler users](https://developers.cloudflare.com/cf/wrangler/)
- Workers Builds limits and deploy hooks: [limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/), [deploy hooks](https://developers.cloudflare.com/workers/ci-cd/builds/deploy-hooks/)
- D1 and R2 free limits: [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing), [R2 pricing](https://developers.cloudflare.com/r2/pricing)
- Access on Workers and one-time PIN: [changelog](https://developers.cloudflare.com/changelog/post/2026-08-14-workers-access/), [one-time PIN](https://developers.cloudflare.com/cloudflare-one/identity/one-time-pin)
- React `<ViewTransition>` stable: [React 19.3](https://react.dev/blog/2026/09/09/react-19-3)
