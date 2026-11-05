import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Free-plan setup: public pages are pre-rendered at build time and stored in
// Workers Static Assets (read-only). Cache interception answers requests for
// those pages straight from that store without loading the Next.js server,
// so a page view costs very little Worker CPU.
//
// When the site later needs on-demand updates (revalidatePath) or more
// server-side rendering, switch incrementalCache to the R2 cache with a D1
// tag cache, as described in https://opennext.js.org/cloudflare/caching.
const config = defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});

export default {
  ...config,
  // `npm run build` runs the whole OpenNext build (so Cloudflare Workers
  // Builds' default "npm run build" + "npx wrangler deploy" work). OpenNext
  // would otherwise call `npm run build` itself for the Next.js step and loop,
  // so point it at the plain Next.js build. `prebuild:next` (binding types +
  // D1 migrations on the build machine's local database) runs before it.
  buildCommand: "npm run build:next",
};
