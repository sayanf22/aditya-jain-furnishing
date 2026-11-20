// Browser check of the phase-2 dashboard screens (email-code sign-in, default
// photos, no hero places, neutral placeholders, delete wording).
//
//   next dev on :3000 (or BASE=...)   node scripts/admin-phase2-check.mjs
//
// The API is stubbed in the browser (page.route), so it needs no Worker and
// changes no data. Backend behaviour is covered by worker/dev/api-check.mjs.
import { chromium, firefox, webkit } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ENGINES = { chromium, firefox, webkit };
const engineName = process.env.ENGINE ?? "chromium";
const VIEWPORTS = [
  ["1440", { width: 1440, height: 900 }],
  ["390", { width: 390, height: 844 }],
];
let current = "";
let failed = 0;
const ok = (name, pass, detail = "") => {
  if (!pass) failed += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  [${engineName} ${current}] ${name}${!pass && detail ? `  -> ${detail}` : ""}`);
};

const ME = { user: { id: 1, email: "owner@example.com", name: "Owner", totpEnabled: false }, csrf: "tok", idleExpiresAt: "2999-01-01T00:00:00Z", expiresAt: "2999-01-01T00:00:00Z" };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const SLOTS = [
  { slot: "about.story", group: "About", label: "About: who we are", shape: "tall", widths: [480, 800, 1200], hint: "Upright photo", defaultKey: "demo/about-story", mediaKey: null, alt: null, media: null },
  { slot: "about.band", group: "About", label: "About: closing band", shape: "wide", widths: [800, 1200, 1600, 2048], hint: "Wide photo", defaultKey: "demo/about-band", mediaKey: "m/0123456789abcdef", alt: null, media: null },
  { slot: "about.hero", group: "About", label: "About hero", shape: "wide", widths: [1600], hint: "", defaultKey: "demo/about-hero", mediaKey: null, alt: null, media: null },
  { slot: "home.hero.1", group: "Home", label: "Home hero 1", shape: "wide", widths: [1600], hint: "", defaultKey: "demo/hero-1", mediaKey: null, alt: null, media: null },
];
const CATALOGUE = {
  totalProducts: 1,
  categories: [{ id: 1, slug: "cushions", name: "Cushions", description: null, imageKey: null, heroImageKey: null, visible: true, position: 0, productCount: 1, children: [] }],
};
const PRODUCT = { id: 7, categoryId: 1, subcategoryId: null, slug: "plain", name: "Plain design", description: null, visible: true, position: 0, images: [], isSample: false, updatedAt: "2026-01-01T00:00:00Z" };

async function stub(page, { emailCodes, log }) {
  await page.route("**/api/admin/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/api/admin", "");
    const method = req.method();
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    log.push({ method, path, body });
    if (path === "/auth/status") return json(route, { setupRequired: false, emailCodes });
    if (path === "/me") return page.__signedIn ? json(route, ME) : json(route, { error: { code: "UNAUTHORIZED", message: "Sign in" } }, 401);
    if (path === "/auth/code/request") return json(route, { ok: true });
    if (path === "/auth/code/verify") return body.code === "123456" ? ((page.__signedIn = true), json(route, { ...ME, mustSetPassword: true })) : json(route, { error: { code: "INVALID", message: "That code is not right.", field: "code" } }, 400);
    if (path === "/auth/password/reset") return json(route, ME);
    if (path === "/site/images" && method === "GET") return json(route, { slots: SLOTS });
    if (path.startsWith("/site/images/") && method === "PUT") return json(route, { ...SLOTS[0], mediaKey: body.mediaKey });
    if (path === "/site/settings") return json(route, {});
    if (path === "/catalogue") return json(route, CATALOGUE);
    if (path.startsWith("/products")) return json(route, { items: path.includes("sample") ? [] : [PRODUCT], nextCursor: null });
    if (path.startsWith("/media")) return json(route, { items: [], nextCursor: null });
    if (path === "/publish") return json(route, { state: "current", version: 1, liveVersion: 1, changesWaiting: 0, requestedAt: null, configured: false });
    if (path.startsWith("/enquiries")) return json(route, { items: [], nextCursor: null, unread: 0 });
    return json(route, {});
  });
}

const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const browser = await ENGINES[engineName].launch();
// A local https Worker (LOCAL_HTTPS=1 node worker/dev/start.mjs) has a self-signed certificate.
if (/^https:\/\/localhost[:/]/.test(BASE)) {
  const orig = browser.newContext.bind(browser);
  browser.newContext = (o = {}) => orig({ ignoreHTTPSErrors: true, ...o });
}
for (const [label, viewport] of VIEWPORTS) {
  current = label;

  // ---- sign in with emailed codes unavailable
  let ctx = await browser.newContext({ viewport });
  let page = await ctx.newPage();
  let log = [];
  await stub(page, { emailCodes: false, log });
  await page.goto(`${BASE}/admin/login`);
  await page.getByLabel("Email").waitFor();
  ok("password form is shown", (await page.getByLabel("Password", { exact: true }).count()) === 1);
  ok("no forgot link when codes are off", (await page.getByRole("button", { name: /Email me a code/ }).count()) === 0);
  ok("says plainly codes are not set up", (await page.getByText("Emailed codes are not set up yet").count()) === 1);
  ok("sign-in page fits the screen", await noOverflow(page));
  await ctx.close();

  // ---- emailed code flow
  ctx = await browser.newContext({ viewport });
  page = await ctx.newPage();
  log = [];
  await stub(page, { emailCodes: true, log });
  await page.goto(`${BASE}/admin/login`);
  await page.getByRole("button", { name: /Email me a code/ }).click();
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").waitFor();
  ok("code requested for the email", log.some((c) => c.path === "/auth/code/request" && c.body.email === "owner@example.com"));
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("That code is not right.").waitFor();
  ok("wrong code shows an error and stays on the code step", (await page.getByLabel("6-digit code").count()) === 1);
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("New password").waitFor();
  ok("right code asks for a new password", true);
  ok("code step fits the screen", await noOverflow(page));
  await page.getByLabel("New password").fill("a long new password 42");
  await page.getByRole("button", { name: "Save and sign in" }).click();
  await page.waitForURL("**/admin");
  ok("password reset sent, then dashboard opens", log.some((c) => c.path === "/auth/password/reset" && c.body.next === "a long new password 42"));
  await ctx.close();

  // ---- dashboard screens (signed in)
  ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  page = await ctx.newPage();
  page.__signedIn = true;
  log = [];
  await stub(page, { emailCodes: true, log });

  await page.goto(`${BASE}/admin/site`);
  await page.getByText("About: who we are").waitFor();
  const text = await page.locator("main").innerText();
  ok("only replaceable places are listed", /who we are/.test(text) && /closing band/.test(text) && !/hero/i.test(text));
  const rows = page.locator(".a-row--slot");
  ok("default place is labelled Default", (await rows.nth(0).getByText("Default", { exact: true }).count()) === 1);
  ok("default place has no Remove", (await rows.nth(0).getByRole("button", { name: /Remove/ }).count()) === 0);
  ok("uploaded place has Remove and Replace", (await rows.nth(1).getByRole("button", { name: /Remove/ }).count()) === 1 && (await rows.nth(1).getByRole("button", { name: "Replace" }).count()) === 1);
  const src = await rows.nth(0).locator("img").first().getAttribute("src");
  ok("default shows its static photo", /^\/demo\/about-story-\d+\.webp$/.test(src ?? ""), String(src));
  await rows.nth(1).getByRole("button", { name: /Remove/ }).click();
  ok("Remove brings back the Default label", (await rows.nth(1).getByText("Default", { exact: true }).count()) === 1);
  await page.getByRole("button", { name: "Save" }).first().click();
  await page.waitForTimeout(400);
  ok("save sends null so the server deletes the upload", log.some((c) => c.method === "PUT" && c.path === "/site/images/about.band" && c.body.mediaKey === null));
  ok("site screen fits the screen", await noOverflow(page));

  await page.goto(`${BASE}/admin/collections`);
  await page.getByText("Cushions").first().waitFor();
  await page.locator(".a-row__main", { hasText: "Cushions" }).click();
  await page.getByText("Card photo").waitFor();
  ok("no header photo field", (await page.getByText("Header photo").count()) === 0);
  ok("home card photo shows Default for a known collection", (await page.locator(".a-photofield .a-badge", { hasText: "Default" }).count()) === 1);
  await page.getByRole("button", { name: /Delete collection/ }).click();
  await page.getByText(/photos are removed too/i).waitFor();
  ok("collection delete says photos are removed too", true);
  await ctx.close();

  ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  page = await ctx.newPage();
  page.__signedIn = true;
  await stub(page, { emailCodes: true, log: [] });
  await page.goto(`${BASE}/admin/designs`);
  await page.getByText("Plain design").waitFor();
  ok("design without photo shows a neutral placeholder (no image)", (await page.locator(".a-row", { hasText: "Plain design" }).locator("img").count()) === 0);
  await page.getByRole("button", { name: "Edit Plain design" }).click();
  await page.getByRole("button", { name: /Delete design/ }).click();
  await page.getByText(/photos are removed too/i).waitFor();
  ok("design delete says photos are removed too", true);
  ok("designs screen fits the screen", await noOverflow(page));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
