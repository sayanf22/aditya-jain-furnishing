// Runs before `next build` (npm script prebuild:next). Prepares the LOCAL
// D1 database that the pre-rendered pages are built from. Nothing here
// talks to Cloudflare or to the live databases: every wrangler command is
// --local, and the content sync only reads the live site's export endpoint.
//
//   1. Apply the migrations (schema, catalogue, business details).
//   2. Fill in the content, one of three ways:
//      a. EXPORT_URL and EXPORT_TOKEN set (Workers Builds build variables):
//         scripts/sync-content.mjs loads what the owner published in the
//         dashboard. Only the interactive room's stand-in content is added
//         (seeds/demo-room.sql); the dashboard does not edit it. If the sync
//         fails the build stops: it never publishes an empty site.
//      b. WORKERS_CI=1 without those variables: the stand-in design content
//         (seeds/), so a preview matches the local one; "Sample review"
//         testimonials are removed, they must not go on a public site.
//      c. Otherwise (this computer): the local database is left as it is.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const { EXPORT_URL, EXPORT_TOKEN, WORKERS_CI } = process.env;

run("npx wrangler d1 migrations apply DB --local");

if (EXPORT_URL || EXPORT_TOKEN) {
  if (!EXPORT_URL || !EXPORT_TOKEN) {
    console.error("EXPORT_URL and EXPORT_TOKEN must be set together. Stopping the build.");
    process.exit(1);
  }
  run("node scripts/sync-content.mjs");
  run("npx wrangler d1 execute DB --local --file seeds/demo-room.sql");
} else if (WORKERS_CI === "1") {
  console.warn("EXPORT_URL and EXPORT_TOKEN are not set: building from the stand-in content, not the dashboard.");
  run("npx wrangler d1 execute DB --local --file seeds/demo-local.sql");
  run("npx wrangler d1 execute DB --local --file seeds/demo-room.sql");
  run("npx wrangler d1 execute DB --local --file seeds/demo-catalogue.sql");
  run('npx wrangler d1 execute DB --local --command "DELETE FROM testimonials"');
}
