# Aditya Jain – Home Furnishing Showroom Website: Build Plan

Status: plan v2 (Next.js), waiting for final approval. Nothing is installed yet.
Source of truth: **Website Development Agreement – Revised, 26 October 2026**. It replaces the 12 October agreement in full. The other PDFs fill in detail only where the revised agreement says nothing.
Client PDFs: `docs/client-pdfs/` (kept out of git).

---

## 1. Decisions confirmed

| Topic | Decision |
|---|---|
| Framework | Next.js |
| Hosting | Cloudflare Workers **Free plan** only, in the client's own Cloudflare account |
| Footer credit | "Built by WhyCreatives" (the agreement's wording), in the bottom legal row next to the copyright line |
| Upholstery Fabric | Flat list as in the revised agreement: Fabric, Velvet, Linen, Prints, Leather. The data model can still group subcategories later if the client asks |
| Best-sellers, "12+ years" | Left out. Both were dropped from the revised agreement and are not confirmed |
| Project folder | This folder; PDFs moved to `docs/client-pdfs/` |
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
| Enquiry form | Excluded (12 Oct) | Included, with B2C / B2B dropdown; enquiries viewed in the dashboard; no email or SMS alerts |
| Instagram | Not mentioned | Quick-enquiry link, plus tap-to-call |
| Interactive décor | "Choose curtain, then fabric" game (meeting) | Admin uploads ready images; visitor taps a texture; the image swaps. Nothing generated |
| Animations | Hover effects were a separate add-on | Hero, page transitions, scroll, gallery zoom, hover, product cards and buttons all included |
| Admin dashboard | Products and images only | Every part of the site |
| Hosting cost | "Evaluate the $5 plan" (meeting) | Free plan; paid plan only if usage outgrows it, paid by the client |

## 4. What we are building

**Pages**
1. **Home**, in this order: Hero (2–3 animations) → Five main categories (hover expands subcategories) → Interactive home décor → Watch & Buy → Customer testimonials → Quick enquiry.
2. **Collection**: browse by category and subcategory, with images and descriptions.
3. **Gallery**: products and décor, with zoom and search.
4. **Contact**: enquiry form, WhatsApp, Instagram, phone.

**Catalogue**
| # | Category | Inside |
|---|---|---|
| 1 | Upholstery Fabric | Fabric, Velvet, Linen, Prints, Leather (more as finalised) |
| 2 | Curtains & Blinds | Curtains (up to 10 categories, each with a photo and one line, plus Prints) · Blinds (4–5 categories) |
| 3 | Carpets & Mats | Carpets · Mats · Direct collections (everything on one page) |
| 4 | Cushions | One collection |
| 5 | Wallpaper | One collection |

About 180–240 product images in total.

**Site-wide**: WhatsApp icon fixed on the right; Instagram quick-enquiry; tap-to-call; every product has a WhatsApp button that names the product. No cart, checkout or payments.

**Admin dashboard** (secure login): the five categories; subcategories (add, rename, reorder); products and images (add, edit, reorder, remove); décor images; Watch & Buy; testimonials; enquiries marked B2C or B2B; contact details.

**Not included**: cart or payments, email or SMS alerts, extra categories or pages, photography, video or image editing, advanced SEO.

## 5. How Next.js runs on the free plan

The free plan allows 10 ms of CPU per request. Rendering Next.js pages on the server for each visit (the OpenNext adapter) can go over that and fail with error 1102. So the public site is built ahead of time:

```
Visitor ──► Cloudflare ──► Static pages (HTML, CSS, JS from Next.js static export)   free, unlimited
                      └──► Small API Worker  /api/*  /media/*                          counts toward 100,000/day
                                 ├── D1   catalogue data, enquiries
                                 └── R2   photos and videos

Admin edits in dashboard ──► saved to D1 / R2 immediately
Admin presses "Publish"  ──► Workers Builds rebuilds the static pages (about 2–3 minutes) ──► live
```

- **Public pages** are a Next.js **static export** (`output: 'export'`), served as Workers static assets. Cloudflare doesn't bill or limit these requests.
- **API Worker** (Hono) handles the enquiry form, the admin API, and photo delivery. Each call does a short D1 or R2 lookup, well under 10 ms CPU.
- **Admin dashboard** is a set of client-side React pages inside the same Next.js app. It reads and writes live data through the API, so the admin always sees current data.
- **Publishing**: the admin's "Publish" button calls a Workers Builds deploy hook. The build reads the catalogue from D1 and regenerates every page. The free plan allows 3,000 build minutes a month, about 1,000 publishes.

**The trade-off**: changes reach the public site 2–3 minutes after pressing Publish, not instantly. Enquiries are not affected; they are saved and shown in the dashboard immediately.

## 6. Stack and dependencies

| Layer | Choice | Version (npm, 31 Oct 2026) |
|---|---|---|
| Framework | Next.js (App Router, static export) | next 16.4.3 |
| UI | React, React DOM | 19.3.1 (`<ViewTransition>` is stable in 19.3) |
| Styling | Tailwind CSS 4 | 4.3.3 |
| Language | TypeScript | latest supported by Next 16.4 (checked at install) |
| API Worker | Hono | 4.13.14 |
| Validation | Zod | 4.6.7 |
| Admin login check | jose (verifies the Cloudflare Access token) | 6.2.14 |
| Admin drag-reorder | @dnd-kit/react (admin pages only) | 0.5.1 |
| Cloudflare CLI | Wrangler | 4.156.0 |
| Screenshot checks | Playwright | 1.64.1 |
| Lint and format | ESLint (eslint-config-next), Prettier | latest |

Node.js: the installed 22.16.0 meets Next.js 16.4 (needs 20.9+) and Wrangler (needs 22+), so no upgrade is needed. The build environment is pinned to Node 22 with `.node-version`.

**Cloudflare services (all free)**
| Service | Use | Free limit |
|---|---|---|
| Workers + static assets | Site and API | Static requests free and unlimited; 100,000 Worker requests a day; 10 ms CPU per request |
| D1 | Catalogue data, enquiries | 5 GB; 5 million rows read and 100,000 written a day |
| R2 | Photos, Watch & Buy videos | 10 GB; 1M writes and 10M reads a month; no egress fees |
| Workers Builds | Rebuild on Publish | 3,000 build minutes a month |
| Access (Zero Trust free) | Admin login with an email one-time code | No passwords stored |
| Turnstile | Spam protection on the enquiry form | Free |

**Photos**: the dashboard resizes each photo in the browser before upload and stores 3 WebP widths (about 480, 960, 1600 px) in R2. This uses no Cloudflare image quota and keeps uploads small. `next/image` uses a custom loader that picks the right width. Frames follow each photo's own shape and show the whole product.

**Animations**, no animation library:
- Page slide from the right: React `<ViewTransition>`.
- Hero reveal, category tiles appearing one after another, hover and button effects: CSS.
- Scroll fade-and-rise: a small IntersectionObserver hook.
- Gallery zoom: native `<dialog>` with a View Transition.
- All motion turns off for visitors who set "reduce motion".

**Performance targets**: Lighthouse 95+ on mobile; LCP under 2 seconds on 4G; hero image under 150 KB; fonts self-hosted through `next/font` (no italic or thin weights).

**Not used, and why**
- OpenNext (server rendering): the 10 ms CPU risk described in §5.
- vinext (Cloudflare's new Next.js toolchain): still in beta.
- Cloudflare Images binding: browser-side resizing does the same job with no quota.

## 7. Data model (D1)

| Table | Holds |
|---|---|
| `categories` | The five categories: name, slug, image, short line, order |
| `subcategories` | Category, optional parent group (for Curtains and Blinds), name, slug, image, one line, order |
| `products` | Subcategory or category (Cushions, Wallpaper), name, description, visible, order |
| `product_images` | R2 key, width, height, alt text, order |
| `decor_scenes`, `decor_options` | A scene (for example, a sofa) and its texture options, each with a swatch and a ready image |
| `watch_items` | Video, poster image, title, linked product |
| `testimonials` | Name, text, visible, order |
| `enquiries` | Date, B2C or B2B, name, phone, message, product or category, read or unread |
| `settings` | WhatsApp number, Instagram handle, phone, address, hero images |
| `publish_log` | When Publish was pressed and the build ID |

## 8. Routes

| Route | Type | Purpose |
|---|---|---|
| `/` | Static | Home |
| `/collection` | Static | All five categories |
| `/collection/[category]` | Static | Category with its subcategories |
| `/collection/[category]/[subcategory]` | Static | Products; each opens in a zoom view with description and WhatsApp button |
| `/collection/[category]/all` | Static | Direct collections: everything in the category |
| `/gallery` | Static | Grid, search and category filter (search runs in the browser) |
| `/contact` | Static | Enquiry form and contact options |
| `/admin/*` | Static shell, live data | Dashboard (behind Access) |
| `/api/enquiry` | Worker | Form submission |
| `/api/admin/*` | Worker | Dashboard data, uploads, Publish (behind Access) |
| `/media/*` | Worker | Photos and videos from R2, cached for a year |
| `/sitemap.xml`, `/robots.txt` | Static | Basic SEO |

## 9. Project layout

```
client4/
├─ app/                 Next.js pages (public site and /admin)
├─ components/          UI pieces
├─ lib/                 shared types, image loader, WhatsApp link builder
├─ worker/              API Worker (Hono): enquiry, admin API, media
├─ migrations/          D1 schema (SQL)
├─ scripts/             export-content.ts: reads D1 into JSON before `next build`
├─ public/              icons, fonts if not from next/font
├─ docs/client-pdfs/    client PDFs (not in git)
├─ wrangler.jsonc       Worker, static assets, D1, R2 bindings
├─ next.config.ts       output: 'export', custom image loader
└─ PLAN.md
```

## 10. Build steps

Each step ends with a check before the next one starts.

| Step | Work | Check |
|---|---|---|
| 0 | Move PDFs, start git, create the private repo, approve this plan | Your reply |
| 1 | Create the Next.js app; install the dependencies in §6; Wrangler config with static assets and API Worker; lint and format | `next build` exports to `out/`; `wrangler dev` serves the pages and `/api/health` |
| 2 | Local D1 and R2; schema migrations; seed the confirmed category structure; content export script | Migrations apply; the export lists the five categories in order |
| 3 | **Your design guide** → colours, type, spacing, fonts; base layout, header, footer, floating WhatsApp button | Screenshots at 390 px and 1440 px |
| 4 | Home page sections in the agreed order | Screenshots; section order matches the agreement |
| 5 | Collection pages: categories, hover-to-expand, product grids, direct collections | All routes export; no cropped product photos |
| 6 | Gallery: grid, zoom, search, filter | Search finds products; zoom works by touch and keyboard |
| 7 | Interactive décor: tap a texture, the ready image swaps (next images preloaded) | Works on mobile; no layout shift |
| 8 | Watch & Buy (video loads only when on screen) and testimonials | WhatsApp link names the product |
| 9 | Contact page and enquiry form (B2C/B2B), Turnstile, rate limit, saved to D1 | Test enquiry appears in D1; bad input rejected |
| 10 | Admin dashboard: every section in §4, photo resize and upload, drag reorder, Publish | Full add, edit, reorder, delete and publish cycle works locally |
| 11 | Animations and micro-interactions; reduce-motion support | Visual check on a mid-range phone profile |
| 12 | Performance pass: image sizes, font loading, cache headers | Lighthouse mobile 95+ |
| 13 | Basic SEO: titles, descriptions, Open Graph, sitemap, LocalBusiness data from confirmed details only | Sitemap valid; Rich Results test passes |
| 14 | Deploy to the client's Cloudflare account on `workers.dev`; connect Workers Builds to the repo; deploy hook; whole preview behind Access during review | Preview loads for approved emails only; Publish rebuilds it |
| 15 | Client review and revisions (6 minor included) | Client approval |
| 16 | Launch after final payment: connect the domain; Access on `/admin` and `/api/admin` only | SSL, speed, admin login, enquiry form all checked live |

## 11. Needed from the client (by the time we reach each step)

Logo; product photos; final subcategory names; décor images (ready images per texture); Watch & Buy content; testimonials; WhatsApp number, Instagram handle, showroom phone; the email for the Cloudflare account; domain. Questions go to you as a WhatsApp-ready message when we reach them.

## 12. Sources checked (October 2026)

- Workers free limits and static asset billing: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing), [static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations)
- Next.js static export and what it doesn't support: [Next.js docs](https://nextjs.org/docs/app/guides/static-exports)
- Cloudflare's Next.js guidance (vinext beta, OpenNext): [Workers Next.js guide](https://developers.cloudflare.com/workers/frameworks/framework-guides/nextjs)
- Workers Builds limits and deploy hooks: [limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/), [deploy hooks](https://developers.cloudflare.com/workers/ci-cd/builds/deploy-hooks/)
- D1 and R2 free limits: [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing), [R2 pricing](https://developers.cloudflare.com/r2/pricing)
- Access on Workers and one-time PIN: [changelog](https://developers.cloudflare.com/changelog/post/2026-08-14-workers-access/), [one-time PIN](https://developers.cloudflare.com/cloudflare-one/identity/one-time-pin)
- React `<ViewTransition>` stable: [React 19.3](https://react.dev/blog/2026/09/09/react-19-3)
- Package versions and Node requirements: npm registry (`npm view`)
