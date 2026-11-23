// Worker entry point (OpenNext "custom worker").
//
// Requests are split in two so a page view stays cheap on the Workers Free
// plan (10 ms CPU per request):
//   /api/*    -> small hand-written handlers in worker/api.ts. They never load
//               the Next.js server, so form posts and dashboard calls stay
//               well under the CPU limit even on a cold start.
//   /m/*      -> photos from R2 that the last build did not copy next to the
//               pages (lib/server/media.ts).
//   all else  -> the OpenNext handler. Pre-rendered pages are answered from
//               Workers Static Assets by cache interception, also without
//               loading the Next.js server.
//
// Because of this split, API endpoints live in worker/, not in app/api/.

// `.open-next/worker.js` is generated at build time, so it may not exist
// when type-checking a fresh clone.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { default as nextHandler } from "../.open-next/worker.js";
import type { AdminEnv } from "../lib/server/env";
import { withSecurityHeaders } from "../lib/server/headers";
import { serveMedia } from "../lib/server/media";
import { autoPublishIfDue } from "../lib/server/publish";
import { handleApi } from "./api";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return handleApi(request, env as unknown as AdminEnv, ctx, pathname);
    }
    if (pathname.startsWith("/m/")) {
      return serveMedia(request, env as unknown as AdminEnv, pathname, ctx);
    }
    // Headers in public/_headers only reach files served straight from static
    // assets, so pages answered here get the same ones added in code.
    return withSecurityHeaders(await nextHandler.fetch(request, env, ctx), pathname);
  },
  // Every 3 minutes (wrangler.jsonc triggers.crons): publish saved dashboard changes once editing has stopped.
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(autoPublishIfDue(env as unknown as AdminEnv).catch((e) => console.error("auto publish error", e instanceof Error ? e.name : "unknown")));
  },
} satisfies ExportedHandler<CloudflareEnv>;
