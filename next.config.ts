import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Cache Components / Partial Prefetching stay off: OpenNext's cache
  // interception (which serves pre-rendered pages without starting the
  // Next.js server, keeping CPU per request low on the Workers Free plan)
  // does not work with Partial Prerendering.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  poweredByHeader: false,
  // Pre-render in one worker. Each build worker opens its own local copy of
  // the D1 database, and with ten of them at once (about 50 Collection
  // pages) the local database fails with "Failed to get session commit
  // token". One worker also reads the catalogue once instead of ten times.
  experimental: {
    staticGenerationMinPagesPerWorker: 1000,
    staticGenerationRetryCount: 2,
  },
  // Hide the "N" badge that `next dev` draws in the corner (errors still show).
  devIndicators: false,
};

export default nextConfig;

// Gives `next dev` access to local versions of the Cloudflare bindings
// (D1, R2) declared in wrangler.jsonc. Local only; nothing connects to
// Cloudflare.
initOpenNextCloudflareForDev();
