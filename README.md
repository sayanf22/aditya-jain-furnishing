# Delta Furnishings – Home Furnishing Showroom Website

Website for Delta Furnishings Pvt Ltd, Kirti Nagar, New Delhi (client: Aditya Jain). Next.js 16 (App Router) on Cloudflare Workers through the OpenNext adapter (`@opennextjs/cloudflare`). Made by [whycreatives.in](https://whycreatives.in). The full plan is in [PLAN.md](PLAN.md).

The live site is deployed by Cloudflare Workers Builds: every push to `main` runs `npm run build`, then `npx wrangler deploy`. The pages are static for now; the live database has no tables yet, so the enquiry form works only locally.

## Setup

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
npm run db:migrate:local      # schema, catalogue, business details
npm run db:seed:demo          # LOCAL ONLY: stand-in images and sample text for the design preview
```

Stand-in images are already in `public/demo/`. To download them again: `npm run stock` (sources and licences in [docs/stock-images.md](docs/stock-images.md)).

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Next.js dev server on http://localhost:3000, with local D1 and R2 |
| `npm run build` | Full OpenNext build into `.open-next/` (binding types, `scripts/build-db.mjs`, `next build`, Worker bundle). Cloudflare Workers Builds runs this, then `npx wrangler deploy`. `scripts/build-db.mjs` applies the migrations to the build machine's local D1; on Workers Builds (`WORKERS_CI=1`) it also loads the stand-in design content and removes the sample reviews, so the static pages match the local preview. It never touches the live database |
| `npm run build:next` | Only the Next.js build (pages are pre-rendered from the local D1) |
| `npm run preview` | OpenNext build, then serves the Worker locally (workerd) on http://localhost:8787 |
| `npm run typecheck` | Regenerates binding types, then type-checks |
| `npm run lint` | ESLint |
| `npm run db:migrate:local` | Applies D1 migrations to the local database |
| `npm run db:seed:demo` | Fills the local database with the design-preview content |
| `npm run stock` | Downloads and converts the stand-in stock images (the site has no video) |
| `npm run perf -- <url>` | Phone-profile speed check (LCP, layout shift, blocking time, bytes) |
| `npm run cpu -- <routes…>` | Local estimate of Worker CPU time per request (needs `npx wrangler dev --port 8787 --local --inspector-port 9230` after an OpenNext build) |
| `node scripts/server-timing.mjs <base> <routes…>` | Local Worker response times per route |
| `node scripts/interaction-check.mjs` | Checks Home page interactions and animation frame timing |
| `node scripts/enquiry-check.mjs` | Checks `/api/enquiry`: valid B2C and B2B saved, bad input, honeypot, other-site post, non-JSON, oversized body, rate limit, GET. Clean up afterwards with `npx wrangler d1 execute aditya-jain-furnishing-db --local --command "DELETE FROM enquiries WHERE source='check' OR name='UI Check'"` |
| `node scripts/request-count.mjs` | Worker requests vs free static files for one visit |
| `node scripts/screens.mjs` | Section-by-section screenshots at 390 px and 1440 px (into `.stock/screens/`) |
| `npm run deploy` | Deploys to Cloudflare. **Not used until the client's account exists** |
