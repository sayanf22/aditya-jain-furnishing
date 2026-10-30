# Aditya Jain – Home Furnishing Showroom Website

Next.js 16 (App Router) on Cloudflare Workers through the OpenNext adapter (`@opennextjs/cloudflare`). Built by WhyCreatives. The full plan is in [PLAN.md](PLAN.md).

Everything runs locally for now. Nothing is deployed until the client's Cloudflare account exists.

## Setup

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
npm run db:migrate:local
```

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Next.js dev server on http://localhost:3000, with local D1 and R2 |
| `npm run build` | Next.js production build |
| `npm run preview` | OpenNext build, then serves the Worker locally (workerd) on http://localhost:8787 |
| `npm run typecheck` | Regenerates binding types, then type-checks |
| `npm run lint` | ESLint |
| `npm run db:migrate:local` | Applies D1 migrations to the local database |
| `npm run perf -- <url>` | Phone-profile speed check (LCP, layout shift, blocking time, bytes) |
| `node scripts/server-timing.mjs <base> <routes…>` | Local Worker response times per route |
| `npm run deploy` | Deploys to Cloudflare. **Not used until the client's account exists** |
