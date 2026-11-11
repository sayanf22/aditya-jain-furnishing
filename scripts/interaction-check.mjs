// Checks the Home page interactions and animation smoothness in a real
// browser (run against `npm run preview` on port 8787).
//   - hero dots change the slide; headline animates word by word; the hero
//     moves on by itself (mouse over it, after a hidden tab), dots only
//   - Our looks: the arrow slides the next photo in
//   - category hover widens the card, then the subcategories appear one by
//     one; names never re-wrap and nothing overlaps (desktop)
//   - Home after a client-side link and after back/forward shows everything
//   - footer spans the full width
//   - décor swatch swaps the photo
//   - shop-the-look dots and arrows; no <video> anywhere
//   - enquiry form errors, B2B firm field and submit
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

  // Hero slide change through a dot, with frame timing during the cross-fade
  // and the word-by-word headline.
  const dots = page.locator('button[aria-label^="Show slide"]');
  const titleBefore = await page.locator("h1").innerText();
  const timingPromise = frameTiming(page, 1600);
  await dots.nth(2).click();
  const heroTiming = await timingPromise;
  await page.waitForTimeout(400);
  const titleAfter = await page.locator("h1").innerText();
  ok("hero dot changes slide", titleBefore !== titleAfter, `"${titleAfter}"`);
  ok("hero cross-fade smooth", heroTiming.over50 <= 2, `p95 ${heroTiming.p95.toFixed(1)} ms, max ${heroTiming.max.toFixed(1)} ms, frames >50ms: ${heroTiming.over50}`);

  const wordCount = await page.locator("h1 .word").count();
  ok("hero headline animates word by word", wordCount >= 4, `${wordCount} words`);
  await page.close();
}

// Hero timer, at normal speed: it must move on by itself every 6 s, even
// with the mouse resting on it (it used to stop there), keep going after
// the tab was in the background, and stop while paused.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: "load" });
  const h1 = () => page.locator("h1").innerText();
  await page.mouse.move(720, 450);
  const t0 = await h1();
  await page.waitForTimeout(9000);
  const t1 = await h1();
  ok("hero changes by itself with the mouse over it", t0 !== t1, `"${t0.slice(0, 22)}…" -> "${t1.slice(0, 22)}…"`);

  const setVisible = (v) =>
    page.evaluate((visible) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (visible ? "visible" : "hidden") });
      document.dispatchEvent(new Event("visibilitychange"));
    }, v);
  await setVisible(false);
  await page.waitForTimeout(7000);
  const t2 = await h1();
  await setVisible(true);
  await page.waitForTimeout(7000);
  const t3 = await h1();
  ok("hero waits while the tab is hidden, then carries on", t2 === t1 && t3 !== t2);

  const heroButtons = await page.locator('section[aria-label="Showroom highlights"] button').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  ok("hero has slide dots only (no pause button)", heroButtons.length > 0 && heroButtons.every((l) => l?.startsWith("Show slide")), heroButtons.join(", "));

  // Header Enquire: a round icon that opens to show "Enquire" on hover.
  const enq = page.locator('header a[aria-label="Enquire on WhatsApp"]');
  await page.mouse.move(720, 600);
  await page.waitForTimeout(600);
  const enqRest = (await enq.boundingBox()).width;
  await enq.hover();
  await page.waitForTimeout(800);
  const enqOpen = (await enq.boundingBox()).width;
  const enqLabel = await enq.locator(".hdr-label > span > span").evaluate((s) => Number(getComputedStyle(s).opacity));
  await page.mouse.move(720, 600);
  await page.waitForTimeout(800);
  const enqBack = (await enq.boundingBox()).width;
  // At rest it must be an exact circle on every screen, including the wide
  // ones where the page's rem size scales up (it used to look like an egg).
  const shapes = [];
  for (const [w, h] of [[1920, 1080], [2560, 1440]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.mouse.move(w / 2, h - 60);
    await page.waitForTimeout(700);
    const box = await enq.boundingBox();
    shapes.push(`${w}px ${box.width.toFixed(1)}x${box.height.toFixed(1)}`);
    if (Math.abs(box.width - box.height) > 0.6) shapes.push("NOT ROUND");
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  ok("header Enquire is a circle at rest on wide screens", !shapes.includes("NOT ROUND"), shapes.join(", "));
  ok(
    "header Enquire opens on hover to show its label",
    enqRest <= 41 && enqOpen > 90 && enqLabel > 0.95 && enqBack <= 41,
    `${enqRest.toFixed(0)} px -> ${enqOpen.toFixed(0)} px -> ${enqBack.toFixed(0)} px`,
  );

  // Sections stay visible when React re-renders them. Simulated by having
  // React's own class handling rewrite the class list, as a hot reload or a
  // prop change does: the "shown" mark must survive.
  const cats = page.locator('section[aria-labelledby="categories-title"]');
  await cats.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.locator(".cat-card").evaluateAll((els) =>
    els.forEach((el) => {
      const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
      if (key) el.className = el[key].className;
    }),
  );
  await page.waitForTimeout(1200);
  const afterRerender = await page.locator(".cat-card").evaluateAll((els) => els.filter((el) => Number(getComputedStyle(el).opacity) > 0.9).length);
  ok("category cards stay visible after a re-render", afterRerender === 5, `${afterRerender} of 5`);
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const cdp = await page.context().newCDPSession(page);
  await page.goto(url, { waitUntil: "networkidle" });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  // Category hover, on the second card (the one reported as not smooth),
  // then moving across all five.
  const cards = page.locator(".cat-card");
  const card = cards.nth(1);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);

  // Name, chip row and button of every card must not overlap, and each
  // name keeps its line count whether its card is open or closed.
  const cardLayout = () =>
    page.locator(".cat-card").evaluateAll((els) =>
      els.map((el) => {
        const box = (sel) => {
          const n = el.querySelector(sel);
          if (!n) return null;
          const r = n.getBoundingClientRect();
          return r.height > 1 ? { top: r.top, bottom: r.bottom } : null;
        };
        return { width: el.getBoundingClientRect().width, title: box("h3"), subs: box(".cat-subs"), button: box(".btn") };
      }),
    );
  const overlaps = (list) =>
    list.filter((c) => {
      const parts = [c.title, c.subs, c.button].filter(Boolean);
      return parts.some((a, i) => parts.slice(i + 1).some((b) => a.bottom > b.top + 0.5));
    }).length;
  const rest = await cardLayout();

  const hoverTiming = frameTiming(page, 2600);
  await card.hover();
  await page.waitForTimeout(700);
  for (let i = 0; i < 5; i++) {
    await cards.nth(i).hover();
    await page.waitForTimeout(350);
  }
  await card.hover();
  const catTiming = await hoverTiming;

  // Chips rise in one after another: shortly after hover, the first is
  // further along than the last.
  await page.mouse.move(5, 5);
  await page.waitForTimeout(1200);
  await card.hover();
  await page.waitForTimeout(430);
  const early = await card.locator(".cat-chip").evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)));
  await page.waitForTimeout(1200);
  const open = await cardLayout();
  const chipOps = await card.locator(".cat-chip").evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)));
  const others = open.filter((_, i) => i !== 1).map((c) => c.width);
  const widen = open[1].width / Math.max(...others);
  const titleSteady = rest.every((c, i) => Math.abs(c.title.bottom - c.title.top - (open[i].title.bottom - open[i].title.top)) < 1);

  ok("category hover widens the card", widen > 1.6, `${open[1].width.toFixed(0)} px vs ${Math.max(...others).toFixed(0)} px for the others`);
  ok("category hover reveals subcategories", chipOps.length > 0 && chipOps.every((o) => o > 0.95), `chip opacity ${chipOps.map((o) => o.toFixed(2)).join(",")}`);
  ok("subcategories appear one by one", early.length > 1 && early[0] > early[early.length - 1] + 0.1, `at 0.43 s: ${early.map((o) => o.toFixed(2)).join(",")}`);
  ok("category names never re-wrap", titleSteady);
  ok("no overlapping text in category cards", overlaps(rest) === 0 && overlaps(open) === 0, `rest ${overlaps(rest)}, open ${overlaps(open)}`);
  ok("category hover smooth", catTiming.over50 <= 1, `p95 ${catTiming.p95.toFixed(1)} ms, max ${catTiming.max.toFixed(1)} ms, frames >50ms: ${catTiming.over50}`);

  // Décor swatch swap.
  const radios = page.locator('[role="radiogroup"] [role="radio"]');
  await radios.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  // Mid-way, the new photo is only partly revealed (a wipe, not a fade), the
  // old one is still showing beside it, and the light edge is on screen.
  const decor = page.locator('section[aria-labelledby="decor-title"]');
  const wipeTiming = frameTiming(page, 1400);
  await radios.nth(1).click();
  await page.waitForTimeout(380);
  const midWipe = await decor.evaluate((s) => {
    const layers = [...s.querySelectorAll(".aspect-\\[4\\/3\\] > div")].map((d) => ({ z: d.style.zIndex, op: d.style.opacity, clip: getComputedStyle(d).clipPath }));
    const top = layers.find((l) => l.z === "2");
    const under = layers.find((l) => l.z === "1");
    const m = /inset\(0px ([\d.]+)%|inset\(0px ([\d.]+)px/.exec(top?.clip ?? "");
    return { clip: top?.clip ?? "", under: under?.op ?? "none", edge: Boolean(s.querySelector(".decor-wipe-edge")), hidden: m ? Number(m[1] ?? m[2]) : 0 };
  });
  const wt = await wipeTiming;
  await page.waitForTimeout(900);
  const checked = await radios.nth(1).getAttribute("aria-checked");
  const label = await decor.locator('[aria-live="polite"]').innerText();
  const shown = await decor.evaluate((s) =>
    [...s.querySelectorAll(".aspect-\\[4\\/3\\] > div")].filter((d) => d.style.opacity === "1").map((d) => d.querySelector("img").currentSrc.split("/").pop()),
  );
  ok("décor swatch swaps photo", checked === "true" && label === "Tan leather" && shown.length === 1 && shown[0].includes("leather"), `${label}, showing ${shown.join(",")}`);
  ok("décor change is a wipe", midWipe.hidden > 2 && midWipe.under === "1" && midWipe.edge, `mid-way: ${midWipe.clip}, old photo still under it, edge line ${midWipe.edge ? "on" : "off"}`);
  ok("décor wipe smooth", wt.over50 <= 1, `p95 ${wt.p95.toFixed(1)} ms, max ${wt.max.toFixed(1)} ms, frames >50ms: ${wt.over50}`);

  // Our looks: a dot shows its product, arrows change the look.
  const looks = page.locator('section[aria-labelledby="looks-title"]');
  await looks.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  const firstDot = looks.locator("button[aria-pressed]").first();
  const dotName = (await firstDot.getAttribute("aria-label")) ?? "";
  await firstDot.click();
  await page.waitForTimeout(700);
  const panelText = await looks.locator('[aria-live="polite"]').innerText();
  ok("look dot shows its product", panelText.includes(dotName) && /Enquire on WhatsApp/.test(panelText), dotName);
  const activeLook = () => looks.locator("[data-look] img").evaluateAll((imgs) => imgs.find((i) => i.alt)?.alt);
  const lookBefore = await activeLook();
  // Mid-way through the change, the new photo is still sliding in from the
  // right and the old one is still visible beside it.
  const lookTiming = frameTiming(page, 1300);
  await looks.locator('button[aria-label="Next look"]').first().click();
  await page.waitForTimeout(160);
  const mid = await looks.locator("[data-look]").evaluateAll((els) =>
    els.map((el) => ({ x: new DOMMatrix(getComputedStyle(el).transform).m41, opacity: Number(getComputedStyle(el).opacity), z: el.style.zIndex })),
  );
  const lt = await lookTiming;
  const lookAfter = await activeLook();
  const incoming = mid.find((m) => m.z === "2");
  const outgoing = mid.find((m) => m.z === "1");
  ok("next arrow changes the look", lookBefore !== lookAfter, `${lookBefore} -> ${lookAfter}`);
  ok(
    "look slides in when the arrow is clicked",
    Boolean(incoming && outgoing && incoming.x > 5 && outgoing.x < -1 && outgoing.opacity > 0.2),
    incoming && outgoing ? `new photo at +${incoming.x.toFixed(0)} px, old at ${outgoing.x.toFixed(0)} px (opacity ${outgoing.opacity.toFixed(2)})` : "no animation found",
  );
  ok("look change smooth", lt.over50 <= 1, `p95 ${lt.p95.toFixed(1)} ms, max ${lt.max.toFixed(1)} ms, frames >50ms: ${lt.over50}`);

  // No video anywhere.
  const videos = await page.locator("video").count();
  ok("no video on the page", videos === 0, `${videos} video elements`);

  // Enquiry form: errors first, then a B2B submission through the UI.
  const form = page.locator('section[aria-labelledby="enquiry-title"] form');
  await form.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await form.locator('button[type="submit"]').click();
  const errorCount = await form.locator('[role="alert"]').count();
  ok("empty form shows errors", errorCount >= 3, `${errorCount} messages`);
  await form.locator("#eq-type").selectOption("B2B");
  await page.waitForTimeout(600);
  const companyVisible = await form.locator("#eq-company").isVisible();
  await form.locator("#eq-company").fill("Check Studio");
  await form.locator("#eq-name").fill("UI Check");
  await form.locator("#eq-phone").fill("9811000000");
  await form.locator("#eq-interest").selectOption("curtains-blinds");
  await form.locator("#eq-message").fill("Submitted by the interaction check script.");
  await form.locator('button[type="submit"]').click();
  await page.waitForTimeout(1500);
  const sent = await page.locator('section[aria-labelledby="enquiry-title"]').innerText();
  ok("firm field appears for B2B", companyVisible);
  ok("form submits and thanks the visitor", /enquiry has been sent/.test(sent));

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

  const footerGap = await page.locator("footer").evaluate((el) => window.innerWidth - el.getBoundingClientRect().width - (window.innerWidth - document.documentElement.clientWidth));
  ok("footer spans the full width", Math.abs(footerGap) < 1, `${footerGap.toFixed(0)} px short`);
  const corners = await page.locator("footer").evaluate((f) => {
    const cs = getComputedStyle(f);
    return [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius].map(parseFloat);
  });
  ok("footer has rounded top corners only", corners[0] > 0 && corners[1] > 0 && corners[2] === 0 && corners[3] === 0, `${corners.join("/")} px`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  const creditClear = await page.evaluate(() => {
    const credit = [...document.querySelectorAll("footer a")].find((a) => a.href.includes("whycreatives.in"))?.getBoundingClientRect();
    const fab = document.querySelector(".float-wa")?.getBoundingClientRect();
    if (!credit || !fab) return "missing";
    const overlap = credit.right > fab.left && credit.left < fab.right && credit.bottom > fab.top && credit.top < fab.bottom;
    return overlap ? "covered" : "clear";
  });
  ok("floating WhatsApp button doesn't cover the footer credit", creditClear === "clear", creditClear);
  await page.close();
}

// Home reached from another page through a link (client-side navigation),
// then through the browser's back and forward buttons: every section must
// still appear once scrolled to.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const home = new URL("/", url).href;
  const hidden = () =>
    page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 100));
      }
      await new Promise((r) => setTimeout(r, 1000));
      return document.querySelectorAll(".js [data-reveal]:not([data-shown]), .js [data-words]:not([data-shown])").length;
    });
  await page.goto(new URL("/collection", url).href, { waitUntil: "networkidle" });
  await page.locator('nav[aria-label="Main"] a[href="/"]').click();
  await page.waitForURL(home);
  await page.waitForTimeout(800);
  const afterLink = await hidden();
  await page.goBack();
  await page.waitForTimeout(800);
  await page.goForward();
  await page.waitForURL(home);
  await page.waitForTimeout(800);
  const afterBack = await hidden();
  ok("Home shows every section after a link", afterLink === 0, `${afterLink} hidden`);
  ok("Home shows every section after back and forward", afterBack === 0, `${afterBack} hidden`);
  await page.close();
}

// Phone (4x slower CPU): menu smoothness, open and close.
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const cdp = await page.context().newCDPSession(page);
  await page.goto(url, { waitUntil: "networkidle" });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.waitForTimeout(1500);
  const toggle = page.locator('button[aria-controls="mobile-menu"]');
  const menuTiming = frameTiming(page, 2400);
  await toggle.tap();
  await page.waitForTimeout(1000);
  const panel = page.locator("#mobile-menu");
  const openState = await panel.evaluate((el) => getComputedStyle(el).opacity);
  const box = await panel.boundingBox();
  await toggle.tap();
  const mt = await menuTiming;
  await page.waitForTimeout(800);
  const closedState = await panel.evaluate((el) => `${getComputedStyle(el).opacity}/${getComputedStyle(el).visibility}`);
  ok("phone menu opens and closes", openState === "1" && closedState === "0/hidden", `opacity ${openState} -> ${closedState}`);
  ok("phone menu fills the screen", box && box.height > 700, `${box?.height.toFixed(0)} px tall`);
  ok("phone menu smooth", mt.over50 <= 1, `p95 ${mt.p95.toFixed(1)} ms, max ${mt.max.toFixed(1)} ms, frames >50ms: ${mt.over50}`);
  const words = await page.locator("h1 .word").count();
  ok("phone hero animates word by word", words >= 4, `${words} words`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("no sideways page scroll on phone", overflow <= 0, `${overflow}px extra`);

  // Phone: the category row scrolls sideways only. Scrolling the page with
  // a finger on the cards used to move the cards up and down in their row.
  const catRow = page.locator(".cat-row");
  await catRow.scrollIntoViewIfNeeded();
  const rb = await catRow.boundingBox();
  await page.mouse.move(rb.x + 80, rb.y + 150);
  await page.mouse.wheel(0, 80);
  await page.waitForTimeout(1600);
  const rowState = await catRow.evaluate((el) => ({ y: el.scrollTop, oy: getComputedStyle(el).overflowY, extra: el.scrollHeight - el.clientHeight }));
  ok("phone category row never scrolls up and down", rowState.y === 0 && rowState.oy === "hidden", `scrollTop ${rowState.y}, overflow-y ${rowState.oy}`);
  await page.close();
}

await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
