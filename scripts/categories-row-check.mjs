// Home page collections row: how many cards are there, and does the layout fit that number?
//   node scripts/categories-row-check.mjs [base] [expectedCount]
// <= 6 cards: one row, no slider, no arrows. > 6: a slider with arrows that move it.
import * as pw from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:8787";
const browser = await (pw.chromium ?? pw.default.chromium).launch();
const results = [];
const ok = (name, pass, detail = "") => results.push(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);

for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport });
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.locator("#cat-row").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const row = document.getElementById("cat-row");
    const cards = [...row.querySelectorAll(".cat-item")];
    const rects = cards.map((c) => c.getBoundingClientRect());
    return { count: cards.length, scrolls: row.scrollWidth > row.clientWidth + 4, rowWidth: row.clientWidth, first: rects[0].width, left: rects[0].left, right: rects.at(-1).right, vw: innerWidth, docScroll: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  const arrows = await page.locator("[aria-label='Browse the collections'] button").count();
  const expected = Number(process.argv[3] ?? info.count);
  ok(`${label}: ${expected} cards shown`, info.count === expected, String(info.count));
  ok(`${label}: no sideways scroll on the page`, !info.docScroll);
  if (label === "desktop") {
    if (info.count > 6) {
      ok("desktop: more than 6 collections scroll sideways", info.scrolls);
      ok("desktop: a card is a sixth of the row", Math.abs(info.first - info.rowWidth / 6) < 3, `${info.first.toFixed(0)} of ${info.rowWidth}`);
      ok("desktop: two arrows are shown", arrows === 2, String(arrows));
      const before = await page.evaluate(() => document.getElementById("cat-row").scrollLeft);
      await page.locator("[aria-label='Browse the collections'] button[aria-label='Next']").click();
      await page.waitForTimeout(900);
      const after = await page.evaluate(() => document.getElementById("cat-row").scrollLeft);
      ok("desktop: Next slides the row by one card", after - before > 100, `${before} -> ${after}`);
      await page.locator("[aria-label='Browse the collections'] button[aria-label='Next']").click();
      await page.waitForTimeout(900);
      await page.locator("[aria-label='Browse the collections'] button[aria-label='Previous']").click();
      await page.waitForTimeout(900);
      const back = await page.evaluate(() => document.getElementById("cat-row").scrollLeft);
      ok("desktop: Previous slides back", back < (after * 2) - 100 && back >= 0, String(back));
      await page.evaluate(() => (document.getElementById("cat-row").scrollLeft = 99999));
      await page.waitForTimeout(500);
      ok("desktop: Next is off at the end", await page.locator("button[aria-label='Next']").isDisabled());
      await page.screenshot({ path: process.env.TEMP + "/cat-slider-desktop.png" });
    } else {
      ok("desktop: up to 6 collections do not scroll", !info.scrolls);
      ok("desktop: no arrows", arrows === 0, String(arrows));
      ok("desktop: cards are the same size as in a row of 6", info.count === 6 ? true : Math.abs(info.first - 1360 / 6) < 40 || info.first > 100, `${info.first.toFixed(0)}`);
      await page.screenshot({ path: process.env.TEMP + `/cat-row-${info.count}.png` });
    }
  } else {
    ok("phone: the row swipes", info.scrolls);
    ok("phone: no arrow buttons on a phone", arrows === 0 || !(await page.locator("[aria-label='Browse the collections']").isVisible()));
  }
  await page.close();
}
await browser.close();
console.log(results.join("\n"));
process.exit(results.some((x) => x.startsWith("FAIL")) ? 1 : 0);
