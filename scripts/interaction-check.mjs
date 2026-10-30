// Checks the Home page interactions and animation smoothness in a real
// browser (run against `npm run preview` on port 8787).
//   - category hover widens the card and reveals subcategories (desktop)
//   - décor swatch swaps the photo
//   - Watch & Buy clip loads only on tap and plays
//   - hero dots change the slide
//   - phone menu opens and closes
//   - frame timing while animations run (long frames = visible stutter)
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://localhost:8787/";
const results = [];
const ok = (name, pass, detail = "") => results.push(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);

// Records requestAnimationFrame gaps for `ms` milliseconds.
async function frameTiming(page, ms) {
  return page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const gaps = [];
        let last = performance.now();
        const start = last;
        function tick(now) {
          gaps.push(now - last);
          last = now;
          if (now - start < duration) requestAnimationFrame(tick);
          else {
            gaps.sort((a, b) => a - b);
            resolve({
              frames: gaps.length,
              p95: gaps[Math.floor(gaps.length * 0.95)],
              max: gaps[gaps.length - 1],
              over50: gaps.filter((g) => g > 50).length,
            });
          }
        }
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

const browser = await chromium.launch();

// Desktop, with a 4x slower CPU to approximate a mid-range laptop/phone.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const cdp = await page.context().newCDPSession(page);
  await page.goto(url, { waitUntil: "networkidle" });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  // Hero slide change through a dot, with frame timing during the cross-fade.
  const dots = page.locator('section[aria-roledescription="carousel"] button[aria-label^="Show slide"]');
  const titleBefore = await page.locator("h1").innerText();
  const timingPromise = frameTiming(page, 1600);
  await dots.nth(2).click();
  const heroTiming = await timingPromise;
  await page.waitForTimeout(400);
  const titleAfter = await page.locator("h1").innerText();
  ok("hero dot changes slide", titleBefore !== titleAfter, `"${titleAfter}"`);
  ok("hero cross-fade smooth", heroTiming.over50 <= 2, `p95 ${heroTiming.p95.toFixed(1)} ms, max ${heroTiming.max.toFixed(1)} ms, frames >50ms: ${heroTiming.over50}`);

  // Category hover.
  const card = page.locator(".cat-card").first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  const widthBefore = (await card.boundingBox()).width;
  const hoverTiming = frameTiming(page, 1000);
  await card.hover();
  const catTiming = await hoverTiming;
  await page.waitForTimeout(300);
  const widthAfter = (await card.boundingBox()).width;
  const chipsVisible = await card.locator(".cat-reveal li").first().isVisible();
  const chipOpacity = await card.locator(".cat-reveal").evaluate((el) => getComputedStyle(el).opacity);
  ok("category hover widens card", widthAfter > widthBefore * 1.5, `${widthBefore.toFixed(0)} -> ${widthAfter.toFixed(0)} px`);
  ok("category hover reveals subcategories", chipsVisible && Number(chipOpacity) > 0.9, `opacity ${chipOpacity}`);
  ok("category hover smooth", catTiming.over50 <= 2, `p95 ${catTiming.p95.toFixed(1)} ms, max ${catTiming.max.toFixed(1)} ms, frames >50ms: ${catTiming.over50}`);

  // Décor swatch swap.
  const radios = page.locator('[role="radiogroup"] [role="radio"]');
  await radios.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await radios.nth(1).click();
  await page.waitForTimeout(900);
  const checked = await radios.nth(1).getAttribute("aria-checked");
  const label = await page.locator('section[aria-labelledby="decor-title"] [aria-live="polite"]').innerText();
  const visibleImg = await page
    .locator('section[aria-labelledby="decor-title"] img.decor-layer')
    .evaluateAll((imgs) => imgs.filter((i) => getComputedStyle(i).opacity === "1").map((i) => i.currentSrc.split("/").pop()));
  ok("décor swatch swaps photo", checked === "true" && label === "Tan leather" && visibleImg.length === 1 && visibleImg[0].includes("leather"), `${label}, showing ${visibleImg.join(",")}`);

  // Watch & Buy: no video request before tap, then it plays.
  const videoRequests = [];
  page.on("request", (r) => r.url().endsWith(".mp4") && videoRequests.push(r.url()));
  const play = page.locator('button[aria-label^="Play Curtains clip"]');
  await play.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const beforeTap = videoRequests.length;
  await play.click();
  await page.waitForTimeout(2500);
  const playing = await page.locator("video").first().evaluate((v) => !v.paused && v.currentTime > 0);
  ok("clip not downloaded before tap", beforeTap === 0);
  ok("clip plays after tap", playing, `${videoRequests.length} video request(s)`);

  // Scroll-reveal and general scrolling smoothness.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  const scrollTiming = frameTiming(page, 2500);
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 120) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  const st = await scrollTiming;
  ok("scrolling smooth", st.over50 <= 3, `p95 ${st.p95.toFixed(1)} ms, max ${st.max.toFixed(1)} ms, frames >50ms: ${st.over50}`);
  await page.close();
}

// Phone: menu.
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(url, { waitUntil: "networkidle" });
  const toggle = page.locator('button[aria-controls="mobile-menu"]');
  await toggle.click();
  await page.waitForTimeout(700);
  const openState = await page.locator("#mobile-menu").evaluate((el) => getComputedStyle(el).opacity);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  const closedState = await page.locator("#mobile-menu").evaluate((el) => getComputedStyle(el).opacity);
  ok("phone menu opens and closes", openState === "1" && closedState === "0", `opacity ${openState} -> ${closedState}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("no sideways page scroll on phone", overflow <= 0, `${overflow}px extra`);
  await page.close();
}

await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
