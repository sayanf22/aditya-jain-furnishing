// Worker entry point (OpenNext "custom worker").
//
// Requests are split in two so a page view stays cheap on the Workers Free
// plan (10 ms CPU per request):
//   /api/*    -> small hand-written handlers in worker/api.ts. They never load
//               the Next.js server, so form posts and dashboard calls stay
//               well under the CPU limit even on a cold start.
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
import { handleApi } from "./api";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return handleApi(request, env, pathname);
    }
    return nextHandler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<CloudflareEnv>;
