// Checks the Home page interactions and animation smoothness in a real
// browser (run against `npm run preview` on port 8787).
//   - hero dots change the slide; headline animates word by word; the hero
//     moves on by itself (mouse over it, after a hidden tab), dots only
//   - category hover widens the card, then the subcategories appear one by
//     one; names never re-wrap and nothing overlaps (desktop)
//   - Home after a client-side link and after back/forward shows everything
//   - footer spans the full width
//   - interactive room: tap points and shapes pick an element, its
//     description shows, every element changes fabric (wipe or fade),
//     smoothly; on a phone it pans to the element and can be swiped
//   - no <video> anywhere
//   - enquiry form errors, B2B firm field and submit
//   - phone menu opens and closes
//   - frame timing while animations run (long frames = visible stutter)
//   - About Us: photo header, reveals, smooth scrolling, links; Gallery gone
//   - Contact: links, hover, the enquiry form sends with source "contact"
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
  const enq = page.locator('header a.hdr-pill');
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

  // Interactive room (Home 03): every element can be tapped and changed.
  const room = page.locator('section[aria-labelledby="room-title"]');
  await room.locator(".room-frame").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1400);
  const spots = await room.locator("[data-spot]").evaluateAll((els) => els.map((e) => e.dataset.spot));
  const ALL = ["curtains", "blind", "sofa", "armchair", "cushions", "rug", "wall"];
  ok("room has a tap point on every element", ALL.every((s) => spots.includes(s)), spots.join(", "));
  const frameBox = await room.locator(".room-frame").boundingBox();
  // On a desktop the stage fills the frame, so canvas units map straight on.
  const at = (x, y) => [frameBox.x + (x / 1600) * frameBox.width, frameBox.y + (y / 1000) * frameBox.height];
  const heading = () => room.locator("h3").innerText().catch(() => "");
  const layerIds = (slug) =>
    room
      .locator(slug === "rug" ? ".room-rug-img[data-option]" : `[data-room="${slug}"] svg[data-option]`)
      .evaluateAll((els) => els.map((e) => e.dataset.option));

  // Tap the curtain fabric itself (the right-hand panel, away from its dot).
  await page.mouse.click(...at(930, 300));
  await page.waitForTimeout(900);
  const roomText = await room.innerText();
  ok("tapping the curtains shows them with a description", (await heading()) === "Curtains" && /Floor-length curtains/.test(roomText), await heading());
  const hint = await room.locator(".room-hint").evaluate((e) => Number(getComputedStyle(e).opacity));
  ok("room hint goes once something is tapped", hint < 0.1, `opacity ${hint}`);

  // Pick a fabric: mid-way the new one is wiping down over the old one.
  const radios = room.locator('[role="radio"]');
  const before = await layerIds("curtains");
  const changeTiming = frameTiming(page, 1500);
  await radios.nth(2).click();
  await page.waitForTimeout(380);
  const midLayers = await layerIds("curtains");
  const midClip = await room.locator('[data-room="curtains"] svg.room-tex-in').evaluate((e) => getComputedStyle(e).clipPath).catch(() => "none");
  const ct = await changeTiming;
  await page.waitForTimeout(800);
  const after = await layerIds("curtains");
  const checkedName = await room.locator('[role="radio"][aria-checked="true"]').innerText();
  ok("picking a fabric changes the curtains", after.length === 1 && after[0] !== before[0], `${before.join(",")} -> ${after.join(",")} (${checkedName})`);
  ok("curtain fabric wipes down over the old one", midLayers.length === 2 && /inset\(0px 0px [1-9]/.test(midClip), `mid-way: ${midLayers.length} layers, ${midClip}`);
  ok("fabric change smooth", ct.over50 <= 1, `p95 ${ct.p95.toFixed(1)} ms, max ${ct.max.toFixed(1)} ms, frames >50ms: ${ct.over50}`);
  const panelText = await room.innerText();
  const enquireHref = decodeURIComponent((await room.getByRole("link", { name: "Enquire", exact: true }).getAttribute("href")) ?? "");
  ok("the chosen fabric's name and description show", panelText.includes(checkedName) && /smooth velvet pile/.test(panelText), checkedName);
  ok("Enquire names the chosen fabric", enquireHref.includes(`"${checkedName}"`) && enquireHref.includes("curtains"), enquireHref.split("text=")[1] ?? "");

  // Tap the sofa fabric and the rug (a 3D plane) directly.
  await page.mouse.click(...at(1150, 770));
  await page.waitForTimeout(700);
  const sofaHead = await heading();
  await page.mouse.click(...at(700, 930));
  await page.waitForTimeout(700);
  const rugHead = await heading();
  ok("tapping the sofa and the rug picks them", sofaHead === "Sofa" && rugHead === "Rug", `${sofaHead}, ${rugHead}`);

  // Every element changes when a fabric is picked from the list.
  const changed = [];
  for (const slug of ALL) {
    await room.getByRole("button", { name: "Back to the whole room" }).click();
    await page.waitForTimeout(250);
    await room.locator(`[data-room-item="${slug}"]`).click();
    await page.waitForTimeout(450);
    const was = await layerIds(slug);
    const target = room.locator('[role="radio"][aria-checked="false"]').first();
    await target.click();
    await page.waitForTimeout(1400);
    const now = await layerIds(slug);
    if (now.length === 1 && now[0] !== was[was.length - 1]) changed.push(slug);
  }
  ok("every element in the room can be changed", changed.length === ALL.length, changed.join(", "));
  await room.getByRole("button", { name: "Back to the whole room" }).click();
  await page.waitForTimeout(400);
  const roomHref = decodeURIComponent((await room.getByRole("link", { name: "Enquire about this room" }).getAttribute("href")) ?? "");
  ok("room enquiry lists every element", ["Curtains", "Blind", "Sofa", "Armchair", "Cushions", "Rug", "Wallpaper"].every((n) => roomHref.includes(`${n}:`)), `${roomHref.split("\n").length - 1} lines`);
  const oldSections = await page.locator('section[aria-labelledby="looks-title"], section[aria-labelledby="decor-title"]').count();
  ok("Our looks is merged into the room (old sections gone)", oldSections === 0, `${oldSections} old sections`);

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

  // No visible text or button name on the page says "WhatsApp" (the buttons
  // show the WhatsApp icon and say "Enquire" / "Message us").
  const waText = await page.evaluate(() => {
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/whatsapp/i.test(n.textContent) && !n.parentElement.closest("script,style")) hits.push(n.textContent.trim());
    document.querySelectorAll("[aria-label]").forEach((el) => /whatsapp/i.test(el.getAttribute("aria-label")) && hits.push(el.getAttribute("aria-label")));
    return hits;
  });
  ok("no 'WhatsApp' wording on the page", waText.length === 0, waText.join(" | ") || "none");
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

  // Phone: the room pans to what is picked, and can be swiped sideways.
  const room = page.locator('section[aria-labelledby="room-title"]');
  await room.locator(".room-frame").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  const stageX = () => room.locator(".room-stage").evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).m41);
  const x0 = await stageX();
  await room.locator('[data-room-item="armchair"]').click();
  await page.waitForTimeout(1300);
  const x1 = await stageX();
  const fb = await room.locator(".room-frame").boundingBox();
  const sb = await room.locator('[data-spot="armchair"]').boundingBox();
  ok("phone: picking the armchair pans the room to it", x1 > x0 + 20 && sb.x >= fb.x && sb.x + sb.width <= fb.x + fb.width, `stage moved ${(x1 - x0).toFixed(0)} px`);
  // A finger swipe to the left (real touch events).
  const fb2 = await room.locator(".room-frame").boundingBox();
  const ty = fb2.y + fb2.height * 0.3;
  let tx = fb2.x + fb2.width * 0.75;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: tx, y: ty }] });
  for (let i = 1; i <= 10; i++) {
    tx -= 20;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: tx, y: ty }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);
  const x2 = await stageX();
  ok("phone: the room can be swiped sideways", x2 < x1 - 60, `swiped ${(x2 - x1).toFixed(0)} px`);
  const roomOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("phone: room causes no sideways page scroll", roomOverflow <= 0, `${roomOverflow}px extra`);

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

// About Us (desktop, 4x slower CPU): the header sits on the photo, the
// photo drifts with the scroll (scroll-driven animation), every section and
// photo is uncovered once scrolled to, and scrolling stays smooth.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const cdp = await page.context().newCDPSession(page);
  const res = await page.goto(new URL("/about", url).href, { waitUntil: "networkidle" });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.waitForTimeout(1200);
  const top = await page.evaluate(() => ({
    header: getComputedStyle(document.querySelector("header")).backgroundColor,
    h1: document.querySelector("h1")?.textContent.replace(/\s+/g, " ").trim(),
    heroImg: document.querySelector(".page-hero-img")?.complete,
    scrollDriven: CSS.supports("animation-timeline: scroll()") ? getComputedStyle(document.querySelector(".page-hero-media")).animationName : "not supported",
  }));
  ok("About Us page loads with its photo header", res.status() === 200 && top.heroImg && /Kirti Nagar/.test(top.h1), `"${top.h1}"`);
  ok("header is transparent over the About Us photo", top.header === "rgba(0, 0, 0, 0)", top.header);
  ok("About Us photo drifts with the scroll", top.scrollDriven === "page-hero-drift" || top.scrollDriven === "not supported", top.scrollDriven);

  const scrollTiming = frameTiming(page, 3500);
  const after = await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 30) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(r));
    }
    await new Promise((r) => setTimeout(r, 2200));
    const covers = [...document.querySelectorAll(".img-reveal")].filter((el) => getComputedStyle(el, "::after").transform !== "matrix(1, 0, 0, 0, 0, 0)").length;
    return {
      hidden: document.querySelectorAll(".js [data-reveal]:not([data-shown]), .js [data-words]:not([data-shown])").length,
      covers,
      header: getComputedStyle(document.querySelector("header")).backgroundColor,
    };
  });
  const st = await scrollTiming;
  ok("About Us shows every section once scrolled", after.hidden === 0, `${after.hidden} hidden`);
  ok("About Us photos are uncovered once scrolled", after.covers === 0, `${after.covers} still covered`);
  ok("About Us scrolling smooth", st.over50 <= 2, `p95 ${st.p95.toFixed(1)} ms, max ${st.max.toFixed(1)} ms, frames >50ms: ${st.over50}`);
  ok("header turns solid after scrolling", after.header !== "rgba(0, 0, 0, 0)", after.header);

  const tiles = await page.$$eval(".about-tile", (els) => els.map((a) => a.getAttribute("href")));
  ok("About Us links to all five collections", tiles.length === 5 && tiles.every((h) => h.startsWith("/collection/")), tiles.join(", "));
  const nav = await page.$$eval('nav[aria-label="Main"] a', (els) => els.map((a) => a.textContent.trim()));
  ok("menu shows About Us instead of Gallery", nav.includes("About Us") && !nav.includes("Gallery"), nav.join(" · "));
  const waText = await page.evaluate(() => {
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/whatsapp/i.test(n.textContent) && !n.parentElement.closest("script,style")) hits.push(n.textContent.trim());
    document.querySelectorAll("[aria-label]").forEach((el) => /whatsapp/i.test(el.getAttribute("aria-label")) && hits.push(el.getAttribute("aria-label")));
    return hits;
  });
  ok("About Us has no 'WhatsApp' wording", waText.length === 0, waText.join(" | ") || "none");
  const gallery = await page.goto(new URL("/gallery", url).href);
  ok("old Gallery page is gone", gallery.status() === 404, `status ${gallery.status()}`);
  await page.close();
}

// About Us on a phone: no sideways scroll, every section shows.
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(new URL("/about", url).href, { waitUntil: "networkidle" });
  const r = await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 300) {
      window.scrollTo(0, y);
      await new Promise((res) => setTimeout(res, 120));
    }
    await new Promise((res) => setTimeout(res, 2000));
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      hidden: document.querySelectorAll(".js [data-reveal]:not([data-shown]), .js [data-words]:not([data-shown])").length,
    };
  });
  ok("About Us on phone: no sideways scroll, all sections shown", r.overflow <= 0 && r.hidden === 0, `${r.overflow}px extra, ${r.hidden} hidden`);
  await page.close();
}

// Contact: every way to reach the showroom links to the right place, the
// cards respond to hover, and the enquiry form sends with source "contact".
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(new URL("/contact", url).href, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const hrefs = await page.$$eval(".contact-option", (els) => els.map((a) => a.getAttribute("href")));
  const has = (re) => hrefs.some((h) => re.test(h));
  ok("contact: message, call and directions links", has(/^https:\/\/wa\.me\/\d+/) && has(/^tel:\+\d+/) && has(/^https:\/\/www\.google\.com\/maps\//), hrefs.map((h) => h.split("?")[0]).join(", "));
  const card = page.locator(".contact-option").nth(1);
  const before = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
  await card.hover();
  await page.waitForTimeout(700);
  const after = await card.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, t: getComputedStyle(el).transform }));
  ok("contact cards lift and turn white on hover", after.bg !== before && after.t !== "none", `${before} -> ${after.bg}, ${after.t}`);
  const address = await page.locator("main address").innerText();
  ok("contact shows the showroom address and GSTIN", /Kirti Nagar/.test(address) && (await page.getByText(/^GSTIN /).first().isVisible()), address.replace(/\n/g, ", "));

  let sent = null;
  page.on("request", (r) => r.url().endsWith("/api/enquiry") && r.method() === "POST" && (sent = r.postDataJSON()));
  await page.selectOption("#eq-type", "B2C");
  await page.fill("#eq-name", "UI Check");
  await page.fill("#eq-phone", "9876543210");
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await page.getByText("Thank you, your enquiry has been sent.").waitFor({ timeout: 8000 }).catch(() => {});
  const thanked = await page.getByText("Thank you, your enquiry has been sent.").isVisible();
  ok("contact form sends and thanks the visitor", thanked && sent?.source === "contact", `source "${sent?.source}"`);
  const waText = await page.evaluate(() => {
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/whatsapp/i.test(n.textContent) && !n.parentElement.closest("script,style")) hits.push(n.textContent.trim());
    document.querySelectorAll("[aria-label]").forEach((el) => /whatsapp/i.test(el.getAttribute("aria-label")) && hits.push(el.getAttribute("aria-label")));
    return hits;
  });
  ok("contact has no 'WhatsApp' wording", waText.length === 0, waText.join(" | ") || "none");
  await page.close();
}

await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
