// Counts what a visit to a page asks for, split by whether it runs the
// Worker (counts toward the free plan's 100,000 requests a day) or is a
// static file (free, not counted). Scrolls the whole page like a visitor.
// Usage: node scripts/request-count.mjs [url]
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://localhost:8787/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const requests = [];
page.on("requestfinished", async (req) => {
  const res = await req.response();
  const size = Number(res?.headers()["content-length"] ?? 0) || (await res?.body().catch(() => Buffer.alloc(0)))?.length || 0;
  requests.push({ url: new URL(req.url()), type: req.resourceType(), size });
});
await page.goto(url, { waitUntil: "networkidle" });
const total = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y < total; y += 400) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.waitForTimeout(150);
}
await page.waitForTimeout(2500);
await browser.close();

const local = requests.filter((r) => r.url.origin === new URL(url).origin);
// Static files never reach the Worker: /_next/static/*, and files from public/.
const isStatic = (r) => r.url.pathname.startsWith("/_next/static/") || /\.(webp|png|jpe?g|svg|ico|mp4|woff2?|css|js)$/.test(r.url.pathname);
const worker = local.filter((r) => !isStatic(r));
const statics = local.filter(isStatic);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const sum = (list) => list.reduce((a, r) => a + r.size, 0);
console.log(`Page ${url} (phone, scrolled to the bottom)`);
console.log(`  Worker requests (count toward 100,000/day): ${worker.length}  -> ${worker.map((r) => r.url.pathname + r.url.search).join(", ")}`);
console.log(`  Static files (free): ${statics.length}, ${kb(sum(statics))} transferred`);
for (const t of ["script", "stylesheet", "image", "font", "media"]) {
  const list = statics.filter((r) => r.type === t);
  if (list.length) console.log(`    ${t.padEnd(10)} ${String(list.length).padStart(3)} files  ${kb(sum(list))}`);
}
console.log(`  Visits per day inside 100,000 Worker requests: about ${Math.floor(100000 / Math.max(1, worker.length)).toLocaleString("en-IN")}`);
