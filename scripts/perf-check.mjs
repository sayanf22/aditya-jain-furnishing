// Local speed check for one page, run against the production build served
// by `npm run preview`. It emulates a mid-range phone (4x slower CPU) on a
// fast 4G connection and reports the numbers that decide whether a page
// feels laggy.
//
// Usage: node scripts/perf-check.mjs [url]
//   default url: http://localhost:8787/

import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://localhost:8787/";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 150,
  downloadThroughput: (9 * 1024 * 1024) / 8,
  uploadThroughput: (1.5 * 1024 * 1024) / 8,
});
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

const bytes = { script: 0, stylesheet: 0, image: 0, font: 0, document: 0, other: 0 };
page.on("response", async (res) => {
  const type = res.request().resourceType();
  const len = Number(res.headers()["content-length"] ?? 0) || (await res.body().catch(() => Buffer.alloc(0))).length;
  bytes[type in bytes ? type : "other"] += len;
});

await page.addInitScript(() => {
  window.__perf = { lcp: 0, cls: 0, longTasks: 0, tbt: 0, tasks: [] };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__perf.lcp = e.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      window.__perf.longTasks += 1;
      window.__perf.tbt += Math.max(0, e.duration - 50);
      window.__perf.tasks.push([e.startTime, e.duration]);
    }
  }).observe({ type: "longtask", buffered: true });
});

const started = Date.now();
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(1500);
const loadMs = Date.now() - started;

const result = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  const fcp = performance.getEntriesByName("first-contentful-paint")[0];
  return {
    ttfb: Math.round(nav.responseStart),
    fcp: Math.round(fcp?.startTime ?? 0),
    lcp: Math.round(window.__perf.lcp),
    cls: Number(window.__perf.cls.toFixed(3)),
    longTasks: window.__perf.longTasks,
    // All long-task time over 50 ms, from the start of loading.
    allBlocking: Math.round(window.__perf.tbt),
    // Lighthouse's Total Blocking Time: only the part of each long task
    // after first contentful paint (before it, nothing can be tapped yet).
    tbt: Math.round(
      window.__perf.tasks.reduce((sum, [start, dur]) => {
        const f = fcp?.startTime ?? 0;
        const end = start + dur;
        if (end <= f) return sum;
        const counted = end - Math.max(start, f);
        return sum + Math.max(0, counted - 50);
      }, 0),
    ),
  };
});

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`Page: ${url}  (mobile, 4x CPU slowdown, fast 4G)`);
console.log(`  Time to first byte     ${result.ttfb} ms`);
console.log(`  First contentful paint ${result.fcp} ms`);
console.log(`  Largest contentful     ${result.lcp} ms   (target < 2000)`);
console.log(`  Layout shift (CLS)     ${result.cls}       (target < 0.1)`);
console.log(`  Blocking time (TBT)    ${result.tbt} ms    (target < 200; Lighthouse definition, after first paint)`);
console.log(`  All long-task time     ${result.allBlocking} ms    (including before first paint), long tasks: ${result.longTasks}`);
console.log(`  Load event             ${loadMs} ms`);
console.log(`  Transferred: HTML ${kb(bytes.document)}, JS ${kb(bytes.script)}, CSS ${kb(bytes.stylesheet)}, images ${kb(bytes.image)}, fonts ${kb(bytes.font)}`);

await browser.close();
