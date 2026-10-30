// Screenshots of a page, one per section, at phone and desktop widths.
// Usage: node scripts/screens.mjs [url] [outDir]
// Writes <outDir>/<width>-<n>-<section>.png and a full-page shot, and lists
// any browser console errors.
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://localhost:8787/";
const out = process.argv[3] ?? ".stock/screens";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];
for (const [label, width, height, mobile] of [
  ["phone", 390, 844, true],
  ["desktop", 1440, 900, false],
]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  page.on("console", (m) => m.type() === "error" && errors.push(`${label}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  await page.goto(url, { waitUntil: "networkidle" });
  // Scroll through once so lazy images load and reveal animations finish.
  const total = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < total; y += height / 2) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${label}-0-top.png` });

  // The fixed header would otherwise be stamped into the middle of each
  // section shot.
  await page.addStyleTag({ content: "header{visibility:hidden!important}" });
  const sections = await page.$$("main > section, main > div, footer");
  let n = 1;
  for (const s of sections) {
    const name = (await s.evaluate((el) => el.getAttribute("aria-labelledby") || el.getAttribute("aria-label") || el.tagName.toLowerCase())).replace(/[^a-z0-9]+/gi, "-").slice(0, 30);
    await s.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await s.screenshot({ path: `${out}/${label}-${n}-${name}.png` });
    n++;
  }
  await page.close();
}
await browser.close();
console.log(errors.length ? `browser errors:\n${errors.join("\n")}` : "browser errors: none");
