// End-to-end browser check of the admin dashboard against the LOCAL Worker.
//
//   node worker/dev/start.mjs          Worker on http://localhost:8787 (local only, never --remote)
//   node scripts/admin-check.mjs       full flow on a 1440 px desktop and a 390 px phone
//   node scripts/admin-check.mjs --hook   publish "happy path" against a tiny fake deploy-hook
//                                         server; start the Worker first with
//                                         WRANGLER_EXTRA="--var DEPLOY_HOOK_URL:http://127.0.0.1:9911/hook"
//
// The default run needs DEPLOY_HOOK_URL empty (the local default), so it also checks that
// publishing answers "not configured". It clears the local sign-in tables (--local only),
// creates its own test rows and removes them again. Screenshots go to %TEMP%\delta-admin\.
import * as pw from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:8787";
if (/^https:\/\/localhost[:/]/.test(BASE)) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const HOOK_MODE = process.argv.includes("--hook");
const HOOK_PORT = 9911;
const SHOTS = join(process.env.TEMP ?? tmpdir(), "delta-admin");
mkdirSync(SHOTS, { recursive: true });

const vars = Object.fromEntries(
  readFileSync(".dev.vars", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const EMAIL = "owner@example.com";
const PASSWORD = "correct horse battery 1";
const PHOTO_A = resolve("public/demo/about-hero-1080.webp");
const PHOTO_B = resolve("public/demo/about-hero-2048.webp");

const results = [];
let current = "";
const ok = (name, pass, detail = "") => {
  results.push({ vp: current, name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"}  [${current}] ${name}${!pass && detail ? `  -> ${detail}` : ""}`);
};

function d1(db, sql) {
  execFileSync("npx", ["wrangler", "d1", "execute", db, "--local", "--command", `"${sql}"`], { stdio: ["ignore", "ignore", "inherit"], shell: true });
}
const resetAuth = () => d1("AUTH_DB", "DELETE FROM sessions; DELETE FROM login_attempts; DELETE FROM admin_users;");

// ------------------------------------------------------------ plain HTTP (Node)
async function http(method, path, { cookie, csrf, headers = {}, body, ip = "10.9.9.9", sameOrigin = true } = {}) {
  const h = { ...(ip === null ? {} : { "CF-Connecting-IP": ip }), ...headers }; // ip null: send no address, like the browser does
  if (cookie) h.Cookie = cookie;
  if (csrf) h["X-CSRF-Token"] = csrf;
  if (method !== "GET" && sameOrigin) {
    h.Origin ??= BASE;
    h["Sec-Fetch-Site"] ??= "same-origin";
  }
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    h["Content-Type"] ??= "application/json";
    payload = typeof body === "string" ? body : JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers: h, body: payload, redirect: "manual" });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, data, headers: res.headers };
}

/** A file with a valid WebP header of the given size (not decodable; the Worker only reads the header). */
function fakeWebp(w, h, pad = 0) {
  const data = Buffer.concat([Buffer.from([0x2f, 0, 0, 0, 0]), Buffer.alloc(40, 7), Buffer.alloc(pad)]);
  data.writeUInt32LE((w - 1) | ((h - 1) << 14), 1);
  const even = data.length % 2;
  const chunk = Buffer.concat([Buffer.from("VP8L"), Buffer.alloc(4), data, Buffer.alloc(even)]);
  chunk.writeUInt32LE(data.length, 4);
  const riff = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), chunk]);
  riff.writeUInt32LE(riff.length - 8, 4);
  return riff;
}
function uploadForm(parts, meta = { label: "check", width: 800, height: 500 }) {
  const f = new FormData();
  f.set("meta", JSON.stringify(meta));
  for (const [w, buf, type = "image/webp"] of parts) f.set(`w${w}`, new Blob([buf], { type }), `x${w}.webp`);
  return f;
}

// ------------------------------------------------------------ browser helpers
const sessionCookie = async (ctx) => {
  const c = (await ctx.cookies()).find((x) => x.name === "__Host-delta_admin");
  return c ? `${c.name}=${c.value}` : "";
};

/** Calls the admin API from inside the page, so the browser's own cookie is used. */
async function papi(page, method, path, body) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const me = await (await fetch("/api/admin/me")).json();
      const headers = {};
      if (method !== "GET") {
        headers["X-CSRF-Token"] = me.csrf;
        if (body !== undefined) headers["Content-Type"] = "application/json";
      }
      const res = await fetch(`/api/admin${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      let data = null;
      try {
        data = await res.json();
      } catch {
        /* empty body */
      }
      return { status: res.status, data };
    },
    { method, path, body },
  );
}

const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth);
const dialog = (page) => page.locator("dialog[open]").last();
const closed = (page) => page.locator("dialog[open]").waitFor({ state: "detached", timeout: 5000 }).catch(() => {});

let shotNo = 0;
let lastPage = null; // screenshot on failure
let shooting = false;
async function shot(page, name, full = true) {
  shotNo += 1;
  await page.waitForTimeout(450);
  // Playwright's WebKit adds a <style> to the page while it takes a screenshot; the dashboard CSP refuses it.
  shooting = true;
  await page.screenshot({ path: join(SHOTS, `${current}-${String(shotNo).padStart(2, "0")}-${name}.png`), fullPage: full });
  await page.waitForTimeout(100);
  shooting = false;
}

async function checkLayout(page, label) {
  ok(`${label}: no sideways scroll`, await noSideScroll(page));
}

const cancelled = new Set();
// Headless WebKit for Windows also reports some same-origin requests to this site that a page change or the
// test cuts short as "<url> due to access control checks" without a matching "cancelled" event. They do not
// show in isolation (fetches, idle connections and cancelled loads were tried) and the screens work, so in
// WebKit they are counted, not failed. A message naming another host is still a failure.
const accessNoise = [];
const realProblems = (list) =>
  list.filter((p) => {
    const m = /^page error: \/(\S+) due to access control checks\.$/.exec(p);
    if (!m) return true;
    if (cancelled.has(m[1])) return false;
    if ((process.env.ENGINE ?? "chromium") === "webkit" && m[1].startsWith(new URL(BASE).host + "/")) {
      if (!accessNoise.includes(m[1])) accessNoise.push(m[1]);
      return false;
    }
    return true;
  });
function watch(page, problems) {
  // WebKit reports a request that a page change cuts short ("Load request cancelled") also as a page
  // error "<url> due to access control checks". realProblems() drops exactly those.
  page.on("requestfailed", (r) => /cancel/i.test(r.failure()?.errorText ?? "") && cancelled.add(new URL(r.url()).host + new URL(r.url()).pathname + new URL(r.url()).search));
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // Refused requests are checked on purpose; the browser logs them as errors too.
    if (/Failed to load resource: the server responded with a status of (400|401|403|409|422|429|502|503)/.test(m.text())) return;
    if (shooting && /^Refused to apply a stylesheet/.test(m.text())) return;
    problems.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500 && !/\/publish$/.test(r.url())) problems.push(`HTTP ${r.status()} ${r.url()}`);
    if (r.status() === 404) problems.push(`HTTP 404 ${r.url()}`);
  });
}

async function signIn(page, password = PASSWORD) {
  await page.goto(`${BASE}/admin/login`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function signOutUi(page, phone) {
  if (phone) {
    await page.getByRole("button", { name: "More" }).click();
    await dialog(page).getByRole("button", { name: "Sign out" }).click();
  } else {
    await page.locator(".a-side").getByRole("button", { name: "Sign out" }).click();
  }
}

// =============================================================== the flow
async function runViewport(browser, name, viewport, ip, phone) {
  current = name;
  shotNo = 0;
  const tag = `${name === "phone" ? "P" : "D"}${Date.now().toString(36).slice(-4)}`;
  const A = `Check ${tag} Alpha`;
  const B = `Check ${tag} Beta`;
  const T = `Check ${tag} Type`;
  const DESIGN = `Check ${tag} Design`;
  const WHO = `Check ${tag} Visitor`;
  const problems = [];

  resetAuth();
  const ctx = await browser.newContext({ viewport, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1, extraHTTPHeaders: { "CF-Connecting-IP": ip } });
  const page = await ctx.newPage();
  lastPage = page;
  if (process.env.DEBUG) { page.on("console", (m) => console.log("console:", m.type(), m.text())); page.on("response", async (r) => { if (r.request().resourceType() === "document") console.log("doc:", r.status(), r.url(), r.fromServiceWorker(), ((await r.allHeaders())["content-security-policy"] ?? "").match(/sha256-/g)?.length ?? 0, JSON.stringify(r.request().headers())); }); page.on("requestfailed", (r) => console.log("failed:", r.url(), r.failure()?.errorText)); page.on("pageerror", (e) => console.log("pageerror:", e.message)); }
  watch(page, problems);

  // ---- signed out: the dashboard asks for setup, the API refuses
  await page.goto(`${BASE}/admin`);
  await page.waitForURL(/\/admin\/setup/, { timeout: 10000 }).catch(() => {});
  ok("signed-out /admin leads to first-run setup", /\/admin\/setup/.test(page.url()), page.url());
  await page.getByLabel("Setup code").waitFor();
  await shot(page, "setup");
  await checkLayout(page, "setup");

  let r = await http("GET", "/api/admin/me");
  ok("unauthenticated /me is 401", r.status === 401);
  r = await http("GET", "/api/admin/catalogue");
  ok("unauthenticated catalogue is 401", r.status === 401);
  r = await http("POST", "/api/admin/categories", { headers: {}, body: { name: "x" } });
  ok("unauthenticated change is refused (401/403)", r.status === 401 || r.status === 403, String(r.status));
  r = await http("GET", "/api/content/export");
  ok("content export without token is refused", r.status === 401 || r.status === 403, String(r.status));
  r = await http("GET", "/api/content/export", { headers: { Authorization: "Bearer wrong" } });
  ok("content export with a wrong token is refused", r.status === 401 || r.status === 403, String(r.status));

  // ---- first-run setup in the browser
  await page.getByLabel("Setup code").fill("not-the-code");
  await page.getByLabel("Your name").fill("Owner");
  await page.getByLabel("Email").fill(EMAIL);
  await page.locator('input[autocomplete="new-password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.locator(".a-form__error, .a-field__note--error").first().waitFor({ timeout: 8000 });
  ok("a wrong setup code shows an error and stays on setup", /\/admin\/setup/.test(page.url()));
  await shot(page, "setup-wrong-code", false);
  await page.getByLabel("Setup code").fill(vars.SETUP_CODE);
  const setupResponse = page.waitForResponse((res) => res.request().method() === "POST" && /\/api\/admin\/auth\/setup/.test(res.url()));
  await page.getByRole("button", { name: "Create account" }).click();
  const setCookie = (await (await setupResponse).headerValue("set-cookie")) ?? "";
  await page.waitForURL(/\/admin\/?$/, { timeout: 15000 });
  await page.getByRole("heading", { level: 1 }).waitFor();
  ok("setup creates the owner and opens the overview", /\/admin\/?$/.test(page.url()));
  const held = (await ctx.cookies()).find((x) => x.name === "__Host-delta_admin");
  // SameSite is read from the header the Worker sent: the WebKit build for Windows reports every cookie as SameSite=None.
  ok("session cookie is Secure, HttpOnly, SameSite=Strict, Path=/", held && held.secure && held.httpOnly && held.path === "/" && /;\s*SameSite=Strict/i.test(setCookie), JSON.stringify({ ...held, value: undefined, header: setCookie.replace(/=[^;]+/, "=�") }));
  await shot(page, "overview");
  await checkLayout(page, "overview");
  ok("dashboard pages are noindex", (await page.locator('meta[name="robots"]').getAttribute("content"))?.includes("noindex") ?? false);
  ok("the public header and footer are not shown on admin pages", await page.evaluate(() =>
    ![...document.querySelectorAll('a[href="/collection"], a[href="/about"], footer')].some((el) => !el.closest(".adm") && el.getClientRects().length > 0),
  ));

  // ---- CSRF and session guards, with the real cookie
  const cookie = await sessionCookie(ctx);
  const me = await papi(page, "GET", "/me");
  const csrf = me.data.csrf;
  r = await http("POST", "/api/admin/categories", { cookie, body: { name: "Nope" }, ip });
  ok("change without the CSRF token is refused", r.status === 403, String(r.status));
  r = await http("POST", "/api/admin/categories", { cookie, csrf: "wrong", body: { name: "Nope" }, ip });
  ok("change with a wrong CSRF token is refused", r.status === 403, String(r.status));
  r = await http("POST", "/api/admin/categories", { cookie, csrf, body: { name: "Nope" }, headers: { "Sec-Fetch-Site": "cross-site" }, ip });
  ok("change marked cross-site is refused", r.status === 403, String(r.status));
  r = await http("POST", "/api/admin/categories", { cookie, csrf, body: { name: "Nope" }, headers: { Origin: "https://evil.example" }, ip });
  ok("change from another Origin is refused", r.status === 403, String(r.status));
  r = await http("POST", "/api/admin/categories", { cookie, csrf, body: "name=Nope", headers: { "Content-Type": "text/plain" }, ip });
  ok("change with a text/plain body is refused", r.status === 415, String(r.status));

  // ---- uploads that must be refused
  r = await http("POST", "/api/admin/media", { cookie, csrf, ip, body: uploadForm([[480, Buffer.from("<svg onload=alert(1)>".padEnd(80, " ")), "image/svg+xml"], [800, fakeWebp(800, 500)]]) });
  ok("a file that is not WebP is refused", r.status === 400 && r.data?.error?.code === "NOT_WEBP", JSON.stringify(r.data));
  r = await http("POST", "/api/admin/media", { cookie, csrf, ip, body: uploadForm([[480, Buffer.from("\x89PNG\r\n\x1a\n".padEnd(80, "0")), "image/webp"], [800, fakeWebp(800, 500)]]) });
  ok("a PNG sent as image/webp is refused", r.status === 400 && r.data?.error?.code === "NOT_WEBP", JSON.stringify(r.data));
  r = await http("POST", "/api/admin/media", { cookie, csrf, ip, body: uploadForm([[480, fakeWebp(480, 300, 1_600_000)], [800, fakeWebp(800, 500)]]) });
  ok("a file over 1.5 MB is refused", r.status === 413 || r.status === 400, String(r.status));
  r = await http("POST", "/api/admin/media", { cookie, csrf, ip, body: uploadForm([[480, fakeWebp(5000, 100)], [800, fakeWebp(800, 500)]]) });
  ok("a photo over 4096 px is refused", r.status === 400, String(r.status));
  const big = new FormData();
  big.set("meta", JSON.stringify({ label: "x", width: 800, height: 500 }));
  big.set("w480", new Blob([new Uint8Array(7_500_000)]));
  r = await http("POST", "/api/admin/media", { cookie, csrf, ip, body: big });
  ok("an upload over 6 MB is refused", r.status === 413, String(r.status));
  r = await http("POST", "/api/admin/media", { ip, body: uploadForm([[480, fakeWebp(480, 300)], [800, fakeWebp(800, 500)]]) });
  ok("an upload without signing in is refused", r.status === 401 || r.status === 403, String(r.status));

  // ---- collections: add a collection and a type, reorder, hide
  await page.goto(`${BASE}/admin/collections`);
  await page.getByRole("button", { name: "Add collection" }).first().waitFor();
  await shot(page, "collections-start");
  for (const n of [A, B]) {
    await page.getByRole("button", { name: "Add collection" }).first().click();
    const d = dialog(page);
    await d.locator('input[maxlength="80"]').first().fill(n);
    await d.getByRole("button", { name: "Add", exact: true }).click();
    await page.locator(".a-toast", { hasText: `Added “${n}”` }).waitFor({ timeout: 8000 });
    await d.getByRole("button", { name: "Close" }).click();
    await closed(page);
  }
  ok("two collections added in the browser", (await page.getByRole("button", { name: new RegExp(`Move ${A} up`) }).count()) === 1);

  await page.locator(".a-row__main", { hasText: A }).first().click();
  await dialog(page).getByRole("button", { name: "Add type inside" }).click();
  await dialog(page).locator('input[maxlength="80"]').first().fill(T);
  await dialog(page).getByRole("button", { name: "Add", exact: true }).click();
  await page.locator(".a-toast", { hasText: `Added “${T}”` }).waitFor({ timeout: 8000 });
  await dialog(page).getByRole("button", { name: "Close" }).click();
  await closed(page);
  await page.getByText(T).first().waitFor();
  ok("a type is added inside the collection", (await page.getByText(T).count()) >= 1);
  await shot(page, "collections-added");
  await checkLayout(page, "collections");

  const order = async () => (await papi(page, "GET", "/catalogue")).data.categories.map((c) => c.name);
  const before = (await order()).filter((n) => n === A || n === B);
  ok("new collections start in the order they were added", before.join() === [A, B].join(), before.join());
  await page.getByRole("button", { name: `Move ${B} up` }).click();
  await page.waitForTimeout(700);
  const after = (await order()).filter((n) => n === A || n === B);
  ok("reorder with the arrow moves the collection up", after.join() === [B, A].join(), after.join());
  await shot(page, "collections-reordered");

  await page.getByRole("button", { name: `Hide ${B}`, exact: true }).click();
  await page.waitForTimeout(500);
  let cat = (await papi(page, "GET", "/catalogue")).data.categories.find((c) => c.name === B);
  ok("hide switches the collection off at once", cat?.visible === false);
  ok("the hidden collection shows a Hidden badge", (await page.locator(".a-row.is-hidden", { hasText: B }).count()) === 1);
  await shot(page, "collections-hidden");
  await page.getByRole("button", { name: `Show ${B}`, exact: true }).click();
  await page.waitForTimeout(500);
  cat = (await papi(page, "GET", "/catalogue")).data.categories.find((c) => c.name === B);
  ok("show switches it back on", cat?.visible === true);

  // ---- delete with typed confirmation
  await page.locator(".a-row__main", { hasText: B }).first().click();
  await dialog(page).getByRole("button", { name: "Delete collection" }).click();
  await page.locator("dialog[open]", { hasText: "to confirm" }).waitFor();
  const confirm = dialog(page);
  const deleteBtn = confirm.getByRole("button", { name: "Delete", exact: true });
  ok("Delete stays off until the name is typed", await deleteBtn.isDisabled());
  await confirm.getByLabel(/Type .* to confirm/).fill("something else");
  ok("a wrong name keeps Delete off", await deleteBtn.isDisabled());
  await shot(page, "delete-confirm", false);
  await confirm.getByLabel(/Type .* to confirm/).fill(B);
  ok("the right name turns Delete on", await deleteBtn.isEnabled());
  await deleteBtn.click();
  await page.locator(".a-toast", { hasText: `Deleted “${B}”` }).waitFor({ timeout: 8000 });
  await closed(page);
  ok("the deleted collection is gone", !(await order()).includes(B));

  // ---- a design with an uploaded photo
  await page.goto(`${BASE}/admin/designs`);
  await page.getByRole("button", { name: "Add design" }).first().click();
  const sheet = dialog(page);
  await sheet.getByRole("button", { name: "Add photos" }).click();
  const picker = dialog(page);
  await picker.locator('input[type="file"]').setInputFiles(PHOTO_A);
  await picker.getByRole("button", { name: "Use photo" }).waitFor({ state: "visible", timeout: 20000 });
  await shot(page, "photo-picker", false);
  await picker.getByRole("button", { name: "Use photo" }).click();
  await page.locator(".a-gallery__frame img").first().waitFor({ timeout: 10000 });
  await page.waitForFunction(() => {
    const img = document.querySelector(".a-gallery__frame img");
    return img && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 10000 });
  const photoSrc = await page.locator(".a-gallery__frame img").first().getAttribute("src");
  ok("the uploaded photo shows in the design", /\/m\/[0-9a-f]{16}-\d+\.webp/.test(photoSrc ?? ""), photoSrc ?? "");
  await dialog(page).locator('input[maxlength="80"]').first().fill(DESIGN);
  const placeValue = await dialog(page).locator("select option").evaluateAll((os, t) => os.find((o) => o.textContent.includes(t))?.value ?? "", T);
  await dialog(page).locator("select").selectOption(placeValue);
  await shot(page, "design-editor", false);
  await dialog(page).getByRole("button", { name: "Add", exact: true }).click();
  await page.locator(".a-toast", { hasText: `Added “${DESIGN}”` }).waitFor({ timeout: 8000 });
  await closed(page);
  let product = (await papi(page, "GET", `/products?q=${encodeURIComponent(DESIGN)}`)).data.items.find((p) => p.name === DESIGN);
  ok("the design is saved with its photo", product && product.images.length === 1 && /^m\//.test(product.images[0].mediaKey), JSON.stringify(product?.images));
  const imgRes = await fetch(`${BASE}${photoSrc}`);
  ok("the uploaded photo is served from /m/ as image/webp", imgRes.status === 200 && imgRes.headers.get("content-type") === "image/webp" && /immutable/.test(imgRes.headers.get("cache-control") ?? ""), `${imgRes.status} ${imgRes.headers.get("content-type")}`);
  await shot(page, "designs");
  await checkLayout(page, "designs");

  // ---- Photos library
  await page.goto(`${BASE}/admin/photos`);
  await page.locator(".a-media").first().waitFor();
  await shot(page, "photos");
  await checkLayout(page, "photos");
  const mediaKey = product?.images[0]?.mediaKey;
  const inUse = await papi(page, "GET", `/media?limit=48`);
  const asset = inUse.data.items.find((m) => m.key === mediaKey);
  r = await papi(page, "DELETE", `/media/${asset?.id}`);
  ok("a photo in use cannot be deleted (409)", r.status === 409 && r.data?.error?.code === "MEDIA_IN_USE", String(r.status));

  // ---- replace a site photo (uploads at the sizes that place needs)
  // Start from the defaults, so a photo left by an earlier run cannot match the new upload.
  for (const s of (await papi(page, "GET", "/site/images")).data.slots) if (s.mediaKey) await papi(page, "PUT", `/site/images/${s.slot}`, { mediaKey: null });
  await page.goto(`${BASE}/admin/site`);
  await page.getByRole("button", { name: "Replace" }).first().waitFor();
  await shot(page, "site");
  await checkLayout(page, "site");
  const slotsBefore = (await papi(page, "GET", "/site/images")).data.slots;
  await page.getByRole("button", { name: "Replace" }).first().click();
  await dialog(page).locator('input[type="file"]').setInputFiles(PHOTO_B);
  await closed(page);
  await page.locator(".a-savebar.is-visible").waitFor({ timeout: 25000 });
  await shot(page, "site-unsaved", false);
  ok('"Not saved yet" bar shows after choosing a site photo', (await page.locator(".a-savebar.is-visible").innerText()).includes("Not saved yet"));
  await page.locator(".a-savebar").getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".a-toast", { hasText: "Saved" }).waitFor({ timeout: 8000 });
  const slotsAfter = (await papi(page, "GET", "/site/images")).data.slots;
  const changed = slotsAfter.find((s, i) => s.mediaKey && s.mediaKey !== slotsBefore[i].mediaKey);
  ok("the site photo is replaced", Boolean(changed), changed?.slot);
  const siteMedia = changed?.mediaKey;

  // ---- an enquiry arrives from the public form and is marked read
  const visitor = await browser.newContext({ viewport, isMobile: phone, hasTouch: phone, extraHTTPHeaders: { "CF-Connecting-IP": `${ip}1` } });
  const vp = await visitor.newPage();
  await vp.goto(`${BASE}/contact`, { waitUntil: "networkidle" });
  await vp.selectOption("#eq-type", "B2C");
  await vp.fill("#eq-name", WHO);
  await vp.fill("#eq-phone", "9876543210");
  await vp.getByRole("button", { name: "Send enquiry" }).click();
  await vp.getByText("Thank you, your enquiry has been sent.").waitFor({ timeout: 10000 });
  await visitor.close();
  await page.goto(`${BASE}/admin/enquiries`);
  const card = page.locator(".a-enquiry", { hasText: WHO });
  await card.waitFor({ timeout: 8000 });
  ok("the enquiry appears, unread", (await card.getAttribute("class")).includes("is-unread"));
  await shot(page, "enquiries-unread");
  await checkLayout(page, "enquiries");
  await card.getByRole("button", { name: "Mark read" }).click();
  await page.waitForTimeout(600);
  let enquiry = (await papi(page, "GET", "/enquiries?limit=50")).data.items.find((e) => e.name === WHO);
  ok("Mark read saves", enquiry?.isRead === true);
  await shot(page, "enquiries-read");

  // ---- publish status
  await page.goto(`${BASE}/admin`);
  await page.locator(".a-publish").waitFor();
  await page.waitForFunction(() => !document.querySelector(".a-publish__title")?.textContent?.includes("Checking"));
  const title = await page.locator(".a-publish__title").innerText();
  ok("publish status shows the waiting changes", /change.* waiting/.test(title), title);
  const publishBtn = page.locator(".a-publish").getByRole("button", { name: "Publish" });
  const status = (await papi(page, "GET", "/publish")).data;
  if (status.configured === false) {
    ok("Publish is switched off while no deploy hook is set", await publishBtn.isDisabled());
    r = await papi(page, "POST", "/publish");
    ok("publishing answers 503 PUBLISH_NOT_CONFIGURED", r.status === 503 && r.data?.error?.code === "PUBLISH_NOT_CONFIGURED", JSON.stringify(r.data));
  } else {
    ok("(this Worker has a deploy hook; run without --hook for the unconfigured check)", true);
  }
  await shot(page, "overview-changes");
  await checkLayout(page, "overview");

  await page.goto(`${BASE}/admin/security`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForTimeout(800);
  await shot(page, "security");
  await checkLayout(page, "security");

  // ---- clean up what this run made, through the browser where it matters
  await page.goto(`${BASE}/admin/enquiries`);
  await page.locator(".a-enquiry", { hasText: WHO }).getByRole("button", { name: new RegExp(`Delete enquiry from ${WHO}`) }).click();
  await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator(".a-toast", { hasText: "Enquiry deleted" }).waitFor({ timeout: 8000 });
  await closed(page);

  await page.goto(`${BASE}/admin/designs`);
  await page.locator(".a-row", { hasText: DESIGN }).locator(".a-row__main").click();
  await dialog(page).getByRole("button", { name: "Delete design" }).click();
  await page.locator("dialog[open]", { hasText: "removed from the site" }).waitFor();
  await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator(".a-toast", { hasText: `Deleted “${DESIGN}”` }).waitFor({ timeout: 8000 });
  await closed(page);

  await page.goto(`${BASE}/admin/site`);
  await page.getByRole("button", { name: /^Remove your photo from / }).first().click();
  await page.locator(".a-savebar").getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".a-toast", { hasText: "Saved" }).waitFor({ timeout: 8000 });
  const slotsEnd = (await papi(page, "GET", "/site/images")).data.slots;
  ok("Remove puts the default site photo back", slotsEnd.every((s, i) => s.mediaKey === slotsBefore[i].mediaKey));
  const siteGone = !(await papi(page, "GET", "/media?limit=48")).data.items.some((m) => m.key === siteMedia);
  ok("Remove deletes the replaced upload from the library", siteGone, siteMedia);

  await page.goto(`${BASE}/admin/collections`);
  await page.locator(".a-row__main", { hasText: A }).first().click();
  await dialog(page).getByRole("button", { name: "Delete collection" }).click();
  await page.locator("dialog[open]", { hasText: "to confirm" }).waitFor();
  await dialog(page).getByLabel(/Type .* to confirm/).fill(A);
  await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator(".a-toast", { hasText: `Deleted “${A}”` }).waitFor({ timeout: 8000 });
  await closed(page);
  const left = (await order()).filter((n) => n.includes(tag));
  ok("test collections and their type are gone", left.length === 0, left.join());

  const mediaNow = (await papi(page, "GET", "/media?limit=48")).data.items;
  for (const key of new Set([mediaKey, siteMedia])) {
    const m = mediaNow.find((x) => x.key === key);
    if (m && m.usedBy.length === 0) await papi(page, "DELETE", `/media/${m.id}`);
  }

  // ---- sign out, wrong password, lock-out
  await page.goto(`${BASE}/admin`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await signOutUi(page, phone);
  await page.waitForURL(/\/admin\/(login|setup)/, { timeout: 10000 });
  ok("sign out leads back to the sign-in page", /\/admin\/login/.test(page.url()), page.url());
  r = await http("GET", "/api/admin/me", { cookie, ip });
  ok("the old session cookie no longer works", r.status === 401, String(r.status));
  await page.goto(`${BASE}/admin/collections`);
  await page.waitForURL(/\/admin\/login/, { timeout: 10000 }).catch(() => {});
  ok("a dashboard page needs signing in again", /\/admin\/login/.test(page.url()), page.url());
  await shot(page, "login");
  await checkLayout(page, "login");

  await signIn(page, "this is the wrong password");
  await page.locator(".a-form__error, .a-field__note--error").first().waitFor({ timeout: 8000 });
  const wrongText = await page.locator(".a-form__error, .a-field__note--error").first().innerText();
  ok("a wrong password shows a plain error", /incorrect|wrong|not right|try again|invalid/i.test(wrongText), wrongText);
  await shot(page, "login-wrong", false);

  let last = 0;
  // The lock is per email AND address, so a stranger cannot lock the owner out from elsewhere.
  // Sent from the page itself, so the failures count against the browser's own address.
  for (let i = 0; i < 5; i++) {
    last = await page.evaluate(
      async (body) => (await fetch("/api/admin/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).status,
      { email: EMAIL, password: "wrong password here" },
    );
  }
  ok("repeated failures lock that address for the email (429)", last === 429, String(last));
  r = await http("POST", "/api/admin/auth/login", { ip: "10.77.7.7", body: { email: EMAIL, password: PASSWORD } });
  ok("the owner can still sign in from another address", r.status === 200, String(r.status));
  await signIn(page);
  await page.locator(".a-form__error, .a-field__note--error").first().waitFor({ timeout: 8000 });
  const lockText = await page.locator(".a-form__error, .a-field__note--error").first().innerText();
  ok("the sign-in page says to wait", /too many|wait/i.test(lockText), lockText);
  await shot(page, "login-locked", false);
  d1("AUTH_DB", "DELETE FROM login_attempts;");
  await page.waitForTimeout(61_000); // the Worker also allows only 6 sign-in tries a minute per address

  // after the lock is cleared, signing in works again
  await signIn(page);
  await page.waitForURL(/\/admin\/?$/, { timeout: 15000 });
  ok("the right password signs in again", /\/admin\/?$/.test(page.url()));
  await signOutUi(page, phone);
  await page.waitForURL(/\/admin\/login/, { timeout: 10000 });

  ok("no console errors, page errors or server errors", realProblems(problems).length === 0, realProblems(problems).slice(0, 5).join(" | "));
  await ctx.close();
}

// =============================================== publish happy path (--hook)
async function runHook(browser) {
  current = "hook";
  shotNo = 0;
  const hits = [];
  let answer = 500;
  const server = createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    req.resume();
    res.writeHead(answer, { "Content-Type": "application/json" }).end("{}");
  });
  await new Promise((res) => server.listen(HOOK_PORT, "127.0.0.1", res));
  try {
    resetAuth();
    let r = await http("POST", "/api/admin/auth/setup", { ip: "10.55.1.1", body: { setupCode: vars.SETUP_CODE, email: EMAIL, name: "Owner", password: PASSWORD } });
    ok("owner created for the publish check", r.status === 200, String(r.status));
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "CF-Connecting-IP": "10.55.2.2" } });
    const page = await ctx.newPage();
    lastPage = page;
  if (process.env.DEBUG) { page.on("console", (m) => console.log("console:", m.type(), m.text())); page.on("response", async (r) => { if (r.request().resourceType() === "document") console.log("doc:", r.status(), r.url(), r.fromServiceWorker(), ((await r.allHeaders())["content-security-policy"] ?? "").match(/sha256-/g)?.length ?? 0, JSON.stringify(r.request().headers())); }); page.on("requestfailed", (r) => console.log("failed:", r.url(), r.failure()?.errorText)); page.on("pageerror", (e) => console.log("pageerror:", e.message)); }
    const problems = [];
    watch(page, problems);
    await signIn(page);
    await page.waitForURL(/\/admin\/?$/, { timeout: 15000 });

    // make one change so there is something to publish
    const made = await papi(page, "POST", "/categories", { name: "Publish check" });
    await papi(page, "DELETE", `/categories/${made.data.id}?confirm=${encodeURIComponent("Publish check")}`);
    await page.goto(`${BASE}/admin`);
    await page.waitForFunction(() => /waiting/.test(document.querySelector(".a-publish__title")?.textContent ?? ""), null, { timeout: 8000 });
    const btn = page.locator(".a-publish").getByRole("button", { name: "Publish" });
    ok("Publish is on when a deploy hook is set and changes wait", await btn.isEnabled());
    await shot(page, "publish-ready");

    answer = 500;
    r = await papi(page, "POST", "/publish");
    ok("a failing hook answers 502 and keeps Publish available", r.status === 502 && r.data?.error?.code === "PUBLISH_FAILED", JSON.stringify(r.data));
    answer = 200;
    await btn.click();
    await page.getByText("Publishing…").first().waitFor({ timeout: 8000 });
    ok("pressing Publish calls the hook once and shows Publishing…", hits.filter(() => true).length === 2 && hits.every((h) => h === "POST /hook"), hits.join(", "));
    const st = (await papi(page, "GET", "/publish")).data;
    ok("status becomes building", st.state === "building", st.state);
    await shot(page, "publish-building");
    r = await papi(page, "POST", "/publish");
    ok("a second press within a minute is refused (429)", r.status === 429, String(r.status));
    ok("the hook was not called again", hits.length === 2, hits.join(", "));
    ok("no console or server errors", realProblems(problems).length === 0, realProblems(problems).join(" | "));
    await ctx.close();
  } finally {
    server.close();
  }
}

// =================================================================== main
const browser = await pw[process.env.ENGINE ?? "chromium"].launch();
// A local https Worker (LOCAL_HTTPS=1 node worker/dev/start.mjs) has a self-signed certificate.
for (const m of ["newContext", "newPage"]) {
  const orig = browser[m].bind(browser);
  browser[m] = (o = {}) => orig({ ignoreHTTPSErrors: true, ...o });
}
try {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) throw new Error(`The Worker is not running on ${BASE}. Start it: node worker/dev/start.mjs`);
  if (HOOK_MODE) await runHook(browser);
  else {
    await runViewport(browser, "desktop", { width: 1440, height: 900 }, "10.31.1.1", false);
    await runViewport(browser, "phone", { width: 390, height: 844 }, "10.32.1.1", true);
  }
} catch (error) {
  await lastPage?.screenshot({ path: join(SHOTS, `${current}-failed.png`), fullPage: true }).catch(() => {});
  ok("the check ran to the end", false, String(error.stack ?? error).split("\n").slice(0, 6).join(" / "));
} finally {
  await browser.close();
}

const failed = results.filter((x) => !x.pass);
if (accessNoise.length) console.log(`INFO  WebKit "access control checks" messages for this site, not counted: ${accessNoise.length}`);
console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots: ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
