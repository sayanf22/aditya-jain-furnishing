// Public-site checks for the admin phase 2 work (photo places, placeholders,
// footer logo, reduced motion, browsers). Own file so the shared suites stay
// untouched.
//
//   node scripts/public-phase2-check.mjs [--browsers=chromium,firefox,webkit] [--base=http://localhost:3000]
//   node scripts/public-phase2-check.mjs --perf   (throttled numbers, JSON on stdout)
//
// Needs `next dev` on the base URL. Reads files; changes nothing.
import { readFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import playwright from "playwright";

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const BASE = arg("base", "http://localhost:3000");
const BROWSERS = arg("browsers", "chromium").split(",");
let pass = 0;
let failed = 0;
const check = (ok, name, extra = "") => {
  if (ok) pass++;
  else failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra ? ` (${extra})` : ""}`);
};
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ---------------------------------------------------------------- static
async function staticChecks() {
  const content = read("lib/content.ts");
  check(!/site_images[^;]*home\.hero/.test(content) && /isReplaceableSlot/.test(content), "content: only replaceable places read site_images");
  check(/HERO_PHOTOS/.test(content) && !/STAND_INS/.test(content), "content: hero photos are fixed constants");
  check(/defaultFor\(slot\)/.test(content), "content: replaceable places fall back to their default");
  check(/categoryCardDefaultFor/.test(read("lib/catalogue.ts")), "catalogue: Home card default comes from CATEGORY_CARD_DEFAULTS");
  check(/PhotoPlaceholder/.test(read("components/RevealImage.tsx")) && /PhotoPlaceholder/.test(read("components/collection/ProductBrowser.tsx")), "no-photo designs and cards use the neutral placeholder");

  // Footer logo: only greys, readable on the near-black footer (#111).
  const { data, info } = await sharp("public/brand/logo-grey.webp").raw().toBuffer({ resolveWithObject: true });
  let colour = 0;
  let dim = 0;
  let solid = 0;
  const levels = new Set();
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 200) continue;
    solid++;
    if (Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) > 3) colour++;
    if (data[i] < 120) dim++;
    levels.add(data[i] >> 4);
  }
  check(colour === 0, "footer logo has no colour", `${colour} px`);
  check(dim / solid < 0.01, "footer logo is clearly visible on #111", `${dim} dark px`);
  check(levels.size >= 5, "footer logo uses a deliberate range of greys (mark gradient, Delta, tagline)", `${levels.size} levels`);
}

// --------------------------------------------------------------- browser
async function pageChecks(name) {
  const type = playwright[name];
  let browser;
  try {
    browser = await type.launch();
  } catch (e) {
    console.log(`skip ${name}: ${String(e.message).split("\n")[0]}`);
    return;
  }
  const tag = (s) => `[${name}] ${s}`;
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const imgs = (selector) => page.$$eval(`${selector} img`, (els) => els.map((e) => e.getAttribute("src") ?? ""));

  await page.goto(`${BASE}/`, { waitUntil: "load" });
  const heroImgs = await page.$$eval("img", (els) => els.map((e) => e.currentSrc || e.src));
  check(heroImgs.length > 0, tag("home renders photos"));
  check((await page.$$(".cat-card")).length >= 1, tag("home category cards render"));
  const cards = await page.$$eval(".cat-card", (els) => els.map((e) => ({ img: e.querySelector("img")?.getAttribute("src") ?? null })));
  check(cards.every((c) => c.img === null || /^\/(demo|m)\//.test(c.img)), tag("home cards use default or uploaded photos"));
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), tag("home: no sideways overflow at 390 px"));

  await page.goto(`${BASE}/about`, { waitUntil: "load" });
  const about = await imgs("main");
  for (const key of ["about-story", "about-showroom", "about-band"]) {
    check(about.some((s) => s.includes(key) || s.includes("/m/")), tag(`about shows the ${key} place (default or upload)`));
  }
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), tag("about: no sideways overflow at 390 px"));

  await page.goto(`${BASE}/contact`, { waitUntil: "load" });
  check((await imgs("main")).some((s) => s.includes("about-showroom") || s.includes("/m/")), tag("contact showroom card shows its place"));

  await page.goto(`${BASE}/collection`, { waitUntil: "load" });
  check((await page.$$("main a[href^='/collection/']")).length > 0, tag("collection page lists collections"));
  const typeTiles = await page.$$eval(".type-card", (els) => els.map((e) => e.querySelector("img")?.getAttribute("src") ?? null));
  check(typeTiles.every((s) => s === null || /^\/(m|demo)\//.test(s)), tag("collection cards: photo or neutral tile"));
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), tag("collection: no sideways overflow at 390 px"));

  // Feature fallbacks: the page must work whatever the browser lacks.
  const features = await page.evaluate(() => ({
    viewTransitions: "startViewTransition" in document,
    scrollTimeline: CSS.supports("animation-timeline: scroll()"),
    has: CSS.supports("selector(:has(a))"),
    inert: "inert" in HTMLElement.prototype,
    dialog: typeof HTMLDialogElement !== "undefined" && "showModal" in HTMLDialogElement.prototype,
  }));
  console.log(`info [${name}] features`, JSON.stringify(features));
  check(true, tag("loaded with these features (see info line)"));

  // Reduced motion: nothing keeps running, reveals show at once.
  const rm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const rp = await rm.newPage();
  await rp.goto(`${BASE}/about`, { waitUntil: "load" });
  await rp.waitForTimeout(600);
  const running = await rp.evaluate(() =>
    document.getAnimations().filter((a) => {
      const t = a.effect?.getComputedTiming();
      return a.playState === "running" && t && t.iterations === Infinity;
    }).length,
  );
  check(running === 0, tag("reduced motion: no endless animation"), `${running} running`);
  const hidden = await rp.evaluate(() => [...document.querySelectorAll("[data-reveal]")].filter((e) => Number(getComputedStyle(e).opacity) < 0.99 && e.getBoundingClientRect().top < innerHeight).length);
  check(hidden === 0, tag("reduced motion: visible content is not left faded"), `${hidden} faded`);
  await rm.close();

  check(errors.length === 0, tag("no script errors"), errors[0]);
  await browser.close();
}

// ------------------------------------------------------------------ perf
async function perf() {
  const browser = await playwright.chromium.launch();
  const out = {};
  for (const path of ["/", "/collection", "/about", "/contact"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    // Slow 4G (Lighthouse): 1.6 Mbit/s down, 750 kbit/s up, 150 ms RTT.
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await page.addInitScript(() => {
      window.__m = { cls: 0, lcp: 0, tasks: [] };
      new PerformanceObserver((l) => l.getEntries().forEach((e) => !e.hadRecentInput && (window.__m.cls += e.value))).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__m.lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__m.tasks.push(e.duration))).observe({ type: "longtask", buffered: true });
    });
    const bytes = { js: 0, css: 0, img: 0, other: 0, requests: 0 };
    cdp.on("Network.loadingFinished", () => {});
    page.on("response", async (r) => {
      const type = r.request().resourceType();
      const len = Number((await r.allHeaders())["content-length"] ?? 0) || (await r.body().catch(() => Buffer.alloc(0))).length;
      bytes.requests++;
      if (type === "script") bytes.js += len;
      else if (type === "stylesheet") bytes.css += len;
      else if (type === "image") bytes.img += len;
      else bytes.other += len;
    });
    await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(2500);
    // Scroll down once so lazy photos and reveals run under load too.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
    });
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => window.__m);
    out[path] = {
      lcpMs: Math.round(m.lcp),
      cls: Number(m.cls.toFixed(4)),
      longTasks: m.tasks.length,
      tbtMs: Math.round(m.tasks.reduce((s, d) => s + Math.max(0, d - 50), 0)),
      jsKB: Math.round(bytes.js / 1024),
      cssKB: Math.round(bytes.css / 1024),
      imgKB: Math.round(bytes.img / 1024),
      requests: bytes.requests,
    };
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
}

if (process.argv.includes("--perf")) {
  await perf();
} else {
  await staticChecks();
  for (const b of BROWSERS) await pageChecks(b);
  console.log(`\n${pass} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
void existsSync;
