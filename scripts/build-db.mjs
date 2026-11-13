// Runs before `next build` (npm script prebuild:next). Prepares the LOCAL
// D1 database that the pre-rendered pages are built from. Nothing here
// talks to Cloudflare or to the live database: every command is --local.
//
//   1. Apply the migrations (schema, catalogue, business details).
//   2. On Cloudflare Workers Builds only (WORKERS_CI=1, set by Cloudflare):
//      load the stand-in design content (seeds/demo-local.sql: stock photos
//      for the hero, categories and interactive room) so the live preview matches the local
//      one, then remove the "Sample review" testimonials, which must not go
//      on a public site. Real content comes from the admin dashboard later.
//      On this computer the local database is left as it is.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

run("npx wrangler d1 migrations apply DB --local");

if (process.env.WORKERS_CI === "1") {
  run("npx wrangler d1 execute DB --local --file seeds/demo-local.sql");
  run('npx wrangler d1 execute DB --local --command "DELETE FROM testimonials"');
}
