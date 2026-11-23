// End-to-end check of the dashboard API against the LOCAL Worker.
//   node worker/dev/start.mjs        (starts the Worker if it is not running)
//   node worker/dev/api-check.mjs
// It clears the local sign-in tables first (--local only) and leaves a few
// test rows in the local content database. Never touches the live account.
import { execFileSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { startStub } from "./email-stub.mjs";

const BASE = process.env.BASE ?? "http://localhost:8787";
const vars = Object.fromEntries(
  readFileSync(".dev.vars", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const EMAIL = "owner@example.com";
const PASS1 = "correct horse battery 1";
const PASS2 = "another long passphrase 2";

const RUN = Math.floor(Math.random() * 200) + 20;
const ip = (n) => `10.${RUN}.${n >> 8}.${n & 255}`;
const results = [];
const ok = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail && !pass ? `  -> ${detail}` : ""}`);
};

function d1(db, sql) {
  execFileSync("npx", ["wrangler", "d1", "execute", db, "--local", "--command", `"${sql}"`], { stdio: ["ignore", "ignore", "inherit"], shell: true });
}

// --------------------------------------------------------------- client
class Client {
  cookie = "";
  csrf = "";
  ip;
  constructor(ip) {
    this.ip = ip;
  }
  async call(method, path, body, { headers = {}, raw = false, noCsrf = false, noOrigin = false } = {}) {
    const h = { "CF-Connecting-IP": this.ip, ...headers };
    if (this.cookie) h.Cookie = this.cookie;
    if (method !== "GET" && !noOrigin) {
      h.Origin ??= BASE;
      h["Sec-Fetch-Site"] ??= "same-origin";
    }
    if (this.csrf && method !== "GET" && !noCsrf) h["X-CSRF-Token"] = this.csrf;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      h["Content-Type"] ??= "application/json";
      payload = raw ? body : JSON.stringify(body);
    }
    const res = await fetch(`${BASE}${path}`, { method, headers: h, body: payload, redirect: "manual" });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const s of set) {
      const [pair] = s.split(";");
      if (pair.endsWith("=")) this.cookie = "";
      else this.cookie = pair;
    }
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, data, headers: res.headers, text, set };
  }
  api = (method, path, body, opts) => this.call(method, `/api/admin${path}`, body, opts);
  async refreshCsrf() {
    const r = await this.api("GET", "/me");
    this.csrf = r.data?.csrf ?? "";
    return r;
  }
}

// --------------------------------------------------------------- totp
function base32Decode(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, v = 0;
  const out = [];
  for (const ch of s) {
    v = (v << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((v >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function totp(secret, stepOffset = 0) {
  const step = Math.floor(Date.now() / 30000) + stepOffset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = mac[mac.length - 1] & 15;
  const bin = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

// --------------------------------------------------------------- webp
/** A file with a valid WebP (lossless) header of the given size. Not decodable, which the API does not need. */
function fakeWebp(w, h, salt = randomBytes(40)) {
  const data = Buffer.concat([Buffer.from([0x2f, 0, 0, 0, 0]), salt]);
  const bits = (w - 1) | ((h - 1) << 14);
  data.writeUInt32LE(bits, 1);
  const pad = data.length % 2;
  const chunk = Buffer.concat([Buffer.from("VP8L"), Buffer.alloc(4), data, Buffer.alloc(pad)]);
  chunk.writeUInt32LE(data.length, 4);
  const riff = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), chunk]);
  riff.writeUInt32LE(riff.length - 8, 4);
  return riff;
}
function uploadForm(sizes, meta) {
  const f = new FormData();
  f.set("meta", JSON.stringify(meta));
  for (const [w, buf] of sizes) f.set(`w${w}`, new Blob([buf], { type: "image/webp" }), `x${w}.webp`);
  return f;
}

// NO_EMAIL=1: run against a Worker started without the email stub (WRANGLER_EXTRA="--var DEV_EMAIL_STUB:").
// Email codes are then off, say so plainly, and password sign-in still works.
if (process.env.NO_EMAIL) {
  d1("AUTH_DB", "DELETE FROM sessions; DELETE FROM login_attempts; DELETE FROM email_code_requests; DELETE FROM email_codes; DELETE FROM admin_users;");
  const c0 = new Client(ip(29900));
  let q = await c0.api("GET", "/auth/status");
  ok("no email key: status says email codes are off", q.status === 200 && q.data.emailCodes === false, JSON.stringify(q.data));
  q = await c0.api("POST", "/auth/setup", { setupCode: vars.SETUP_CODE, email: EMAIL, password: PASS1 });
  ok("no email key: setup works", q.status === 200);
  q = await new Client(ip(29901)).api("POST", "/auth/code/request", { email: EMAIL });
  ok("no email key: a code request says so plainly (503)", q.status === 503 && q.data.error.code === "EMAIL_NOT_CONFIGURED" && /not set up/i.test(q.data.error.message), JSON.stringify(q.data));
  q = await new Client(ip(29902)).api("POST", "/auth/login", { email: EMAIL, password: PASS1 });
  ok("no email key: password sign-in is unaffected", q.status === 200 && q.data.ok === true, JSON.stringify(q.data));
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.includes(false) ? 1 : 0);
}

// =================================================================== run
d1("AUTH_DB", "DELETE FROM sessions; DELETE FROM login_attempts; DELETE FROM admin_users;");
d1("AUDIT_DB", "DELETE FROM audit_log;");

const anon = new Client(ip(28933));
let r = await anon.call("GET", "/api/health");
ok("health", r.status === 200);

// ---- first-run setup
r = await anon.api("GET", "/auth/status");
ok("status: setup required on a fresh database", r.status === 200 && r.data.setupRequired === true, JSON.stringify(r.data));
r = await anon.api("GET", "/me");
ok("signed-out /me is 401", r.status === 401);
r = await anon.api("GET", "/catalogue");
ok("signed-out catalogue is 401", r.status === 401);
r = await anon.api("POST", "/auth/setup", { setupCode: "wrong-code-123", email: EMAIL, password: PASS1 });
ok("setup with a wrong code is refused", r.status === 403 && r.data.error.code === "BAD_SETUP_CODE", JSON.stringify(r.data));
r = await anon.api("POST", "/auth/setup", { setupCode: vars.SETUP_CODE, email: EMAIL, password: PASS1 }, { headers: { "Sec-Fetch-Site": "cross-site" } });
ok("setup from another site is refused (CSRF)", r.status === 403 && r.data.error.code === "CSRF", JSON.stringify(r.data));
r = await anon.api("POST", "/auth/setup", { setupCode: vars.SETUP_CODE, email: EMAIL, password: "short" });
ok("setup with a short password is refused", r.status === 400 && r.data.error.code === "WEAK_PASSWORD", JSON.stringify(r.data));
r = await anon.api("POST", "/auth/setup", { setupCode: vars.SETUP_CODE, email: EMAIL, password: PASS1, extra: 1 });
ok("unknown JSON fields are refused", r.status === 400 && r.data.error.code === "UNKNOWN_FIELD", JSON.stringify(r.data));

const owner = new Client(ip(28938));
r = await owner.api("POST", "/auth/setup", { setupCode: vars.SETUP_CODE, email: EMAIL, name: "Owner", password: PASS1 });
ok("setup creates the owner and signs in", r.status === 200 && r.data.user?.email === EMAIL && r.data.csrf, JSON.stringify(r.data));
const cookieHeader = r.set[0] ?? "";
ok("cookie is __Host-, Secure, HttpOnly, SameSite=Strict, Path=/, no Domain", /^__Host-delta_admin=[\w-]{40,}/.test(cookieHeader) && /Secure/.test(cookieHeader) && /HttpOnly/.test(cookieHeader) && /SameSite=Strict/.test(cookieHeader) && /Path=\//.test(cookieHeader) && !/Domain/i.test(cookieHeader), cookieHeader);
ok("API replies are no-store, nosniff, no-referrer", r.headers.get("cache-control") === "no-store" && r.headers.get("x-content-type-options") === "nosniff" && r.headers.get("referrer-policy") === "no-referrer");
owner.csrf = r.data.csrf;
r = await anon.api("GET", "/auth/status");
ok("status: setup closed after the first owner", r.data.setupRequired === false);
r = await new Client(ip(28939)).api("POST", "/auth/setup", { setupCode: vars.SETUP_CODE, email: "second@example.com", password: PASS1 });
ok("setup cannot run twice", r.status === 403 && r.data.error.code === "SETUP_CLOSED", JSON.stringify(r.data));

// ---- CSRF
r = await owner.api("POST", "/categories", { name: "Nope" }, { noCsrf: true });
ok("change without CSRF token is refused", r.status === 403 && r.data.error.code === "CSRF");
r = await owner.api("POST", "/categories", { name: "Nope" }, { headers: { "X-CSRF-Token": "wrong" }, noCsrf: true });
ok("change with a wrong CSRF token is refused", r.status === 403);
r = await owner.api("POST", "/categories", { name: "Nope" }, { headers: { "Sec-Fetch-Site": "cross-site" } });
ok("change marked cross-site is refused", r.status === 403);
r = await owner.api("POST", "/categories", { name: "Nope" }, { noOrigin: true });
ok("change with no Origin and no Fetch Metadata is refused", r.status === 403);
r = await owner.api("POST", "/categories", { name: "Nope" }, { headers: { Origin: "https://evil.example" } });
ok("change from a different Origin is refused", r.status === 403);
r = await owner.api("POST", "/categories", "name=Nope", { raw: true, headers: { "Content-Type": "text/plain" } });
ok("change with text/plain body is refused", r.status === 415, String(r.status));
r = await owner.api("GET", "/me");
ok("me works with the cookie", r.status === 200 && r.data.user.email === EMAIL && r.data.csrf === owner.csrf);

// ---- sign in / out / throttling
const dev2 = new Client(ip(28948));
r = await dev2.api("POST", "/auth/login", { email: EMAIL, password: "wrong password here" });
const wrongPw = r;
ok("wrong password: 401", r.status === 401 && r.data.error.code === "BAD_LOGIN");
r = await dev2.api("POST", "/auth/login", { email: "nobody@example.com", password: "wrong password here" });
ok("unknown email gives the same answer as a wrong password", r.status === 401 && r.data.error.message === wrongPw.data.error.message);
let last;
const stranger = new Client(ip(300));
for (let i = 0; i < 6; i++) last = await stranger.api("POST", "/auth/login", { email: EMAIL, password: "wrong password here" });
ok("6th failure for one email from one address is throttled (429 + Retry-After)", last.status === 429 && Number(last.headers.get("retry-after")) > 0, `${last.status}`);
last = await stranger.api("POST", "/auth/login", { email: EMAIL, password: PASS1 });
ok("that address stays refused even with the right password", last.status === 429);
const other = new Client(ip(25699));
last = await other.api("POST", "/auth/login", { email: EMAIL, password: PASS1 });
ok("the owner can still sign in from another address (no lock-out by strangers)", last.status === 200 && last.data.ok === true, `${last.status}`);
await other.refreshCsrf();
await other.api("POST", "/auth/logout");
const burst = new Client(ip(29005));
let statuses = [];
for (let i = 0; i < 8; i++) statuses.push((await burst.api("POST", "/auth/login", { email: `n${i}@example.com`, password: "wrong password here" })).status);
ok("per-address sign-in rate limit kicks in (429)", statuses.includes(429), statuses.join(","));
r = await dev2.api("POST", "/auth/login", { email: EMAIL, password: PASS1 });
ok("correct password signs in", r.status === 200 && r.data.ok === true && dev2.cookie.startsWith("__Host-delta_admin="), JSON.stringify(r.data));
ok("new session cookie differs from the first (no fixation)", dev2.cookie !== owner.cookie);
await dev2.refreshCsrf();
r = await dev2.api("GET", "/sessions");
ok("sessions list shows two devices, one current", r.status === 200 && r.data.items.length === 2 && r.data.items.filter((s) => s.current).length === 1, JSON.stringify(r.data));
r = await dev2.api("POST", "/auth/logout");
ok("logout works", r.status === 200 && r.set.some((s) => /Max-Age=0/.test(s)));
r = await dev2.api("GET", "/me");
ok("old cookie is dead after logout", r.status === 401);

// ---- authenticator app
r = await owner.api("POST", "/auth/2fa/start");
ok("2fa start returns secret + otpauth URI", r.status === 200 && /^[A-Z2-7]{32}$/.test(r.data.secret) && r.data.otpauthUri.startsWith("otpauth://totp/"), JSON.stringify(r.data));
const secret = r.data.secret;
r = await owner.api("POST", "/auth/2fa/enable", { code: "000000" });
ok("2fa enable with a wrong code is refused", r.status === 400);
r = await owner.api("POST", "/auth/2fa/enable", { code: totp(secret) });
ok("2fa enable with the right code", r.status === 200, JSON.stringify(r.data));
ok("2fa enable gives this device a new session cookie", r.set.some((s) => s.startsWith("__Host-delta_admin=") && !/Max-Age/.test(s)));
await owner.refreshCsrf();
const dev3 = new Client(ip(28958));
r = await dev3.api("POST", "/auth/login", { email: EMAIL, password: PASS1 });
ok("sign-in now asks for a code", r.status === 200 && r.data.needsCode === true && !dev3.cookie, JSON.stringify(r.data));
r = await dev3.api("POST", "/auth/login", { email: EMAIL, password: PASS1, code: "123456" });
ok("wrong code is refused", r.status === 401 && r.data.error.code === "BAD_CODE", JSON.stringify(r.data));
const goodCode = totp(secret, 1); // next step: not used yet
r = await dev3.api("POST", "/auth/login", { email: EMAIL, password: PASS1, code: goodCode });
ok("right code signs in", r.status === 200 && r.data.ok === true, JSON.stringify(r.data));
r = await new Client(ip(28959)).api("POST", "/auth/login", { email: EMAIL, password: PASS1, code: goodCode });
ok("the same code cannot be used twice (replay)", r.status === 401 && r.data.error.code === "BAD_CODE", JSON.stringify(r.data));
await dev3.refreshCsrf();
r = await dev3.api("POST", "/auth/2fa/disable", { password: PASS1, code: totp(secret, 1) });
ok("2fa disable refuses an already used code", r.status === 400, JSON.stringify(r.data));
// wait out replay: use the previous step is not allowed either (lower than last), so use +1 was consumed; use the step after
r = await owner.api("POST", "/auth/2fa/disable", { password: "not my password", code: totp(secret) });
ok("2fa disable needs the password", r.status === 403);

// ---- password change
d1("AUTH_DB", "DELETE FROM login_attempts;");
r = await owner.api("POST", "/auth/password", { current: "nope nope nope nope", next: PASS2 });
ok("password change: wrong current is refused", r.status === 403 && r.data.error.code === "BAD_PASSWORD");
r = await owner.api("POST", "/auth/password", { current: PASS1, next: EMAIL });
ok("password change: weak new password is refused", r.status === 400);
r = await owner.api("POST", "/auth/password", { current: PASS1, next: PASS2 });
ok("password change works and renews this device's session", r.status === 200 && r.set.some((s) => s.startsWith("__Host-delta_admin=")), JSON.stringify(r.data));
await owner.refreshCsrf();
r = await dev3.api("GET", "/me");
ok("other devices are signed out after a password change", r.status === 401);
r = await owner.api("GET", "/me");
ok("this device stays signed in", r.status === 200);

// ---- content: collections
r = await owner.api("GET", "/catalogue");
const cat0 = r.data;
ok("catalogue lists the five seeded collections with counts", r.status === 200 && cat0.categories.length >= 5 && cat0.categories[0].children.length > 0 && typeof cat0.totalProducts === "number", JSON.stringify(cat0).slice(0, 200));
const v0 = (await owner.api("GET", "/publish")).data.version;
r = await owner.api("POST", "/categories", { name: "Test Lounge & Decor", description: "Test collection" });
const newCat = r.data;
ok("create collection (slug from name)", r.status === 200 && newCat.slug === "test-lounge-and-decor" && newCat.visible === true && newCat.children.length === 0, JSON.stringify(r.data));
r = await owner.api("POST", "/categories", { name: "Test Lounge & Decor" });
ok("same name gets a free slug", r.status === 200 && r.data.slug === "test-lounge-and-decor-2");
const dupCat = r.data;
r = await owner.api("POST", "/categories", { name: "X", slug: "test-lounge-and-decor" });
ok("explicit slug that is taken: 409", r.status === 409 && r.data.error.field === "slug");
r = await owner.api("POST", "/categories", { name: "" });
ok("empty name: 400 with field", r.status === 400 && r.data.error.field === "name");
r = await owner.api("POST", "/categories", { name: "A".repeat(81) });
ok("name over 80 characters: 400", r.status === 400);
r = await owner.api("PATCH", `/categories/${newCat.id}`, { name: "Test Lounge", visible: false });
ok("rename and hide a collection", r.status === 200 && r.data.name === "Test Lounge" && r.data.visible === false);
r = await owner.api("PATCH", `/categories/${newCat.id}`, { imageKey: "m/0123456789abcdef" });
ok("photo key that is not in the library: 400", r.status === 400 && r.data.error.code === "MEDIA_NOT_FOUND");
r = await owner.api("PATCH", `/categories/${newCat.id}`, { name: "x'; DROP TABLE categories;--" });
ok("SQL text is stored as plain text", r.status === 200 && r.data.name.includes("DROP TABLE"));
await owner.api("PATCH", `/categories/${newCat.id}`, { name: "Test Lounge" });
const ids = (await owner.api("GET", "/catalogue")).data.categories.map((c) => c.id);
r = await owner.api("POST", "/categories/reorder", { ids: [...ids].reverse() });
ok("reorder collections", r.status === 200);
r = await owner.api("POST", "/categories/reorder", { ids: ids.slice(1) });
ok("reorder with a missing id: 409", r.status === 409);
await owner.api("POST", "/categories/reorder", { ids });

r = await owner.api("POST", "/subcategories", { categoryId: newCat.id, name: "Sofas" });
const sub = r.data;
ok("create type", r.status === 200 && sub.categoryId === newCat.id && sub.parentId === null && sub.slug === "sofas", JSON.stringify(r.data));
r = await owner.api("POST", "/subcategories", { categoryId: newCat.id, parentId: sub.id, name: "Velvet" });
const leaf = r.data;
ok("create type inside a type", r.status === 200 && leaf.parentId === sub.id);
r = await owner.api("POST", "/subcategories", { categoryId: cat0.categories[0].id, parentId: leaf.id, name: "Wrong" });
ok("parent from another collection: 400", r.status === 400);
r = await owner.api("POST", "/products", { categoryId: newCat.id, subcategoryId: sub.id, name: "Direct in a type with types" });
ok("design in a type that has types: 409", r.status === 409 && r.data.error.code === "HAS_TYPES");
r = await owner.api("POST", "/products", { categoryId: newCat.id, name: "Direct in collection with types" });
ok("design in a collection that has types: 409", r.status === 409 && r.data.error.code === "HAS_TYPES");

// ---- designs
r = await owner.api("POST", "/products", { categoryId: newCat.id, subcategoryId: leaf.id, name: "Royal Velvet 01", description: "Deep blue" });
const p1 = r.data;
ok("create design", r.status === 200 && p1.slug === "royal-velvet-01" && p1.images.length === 0 && p1.visible === true, JSON.stringify(r.data));
r = await owner.api("POST", "/subcategories", { categoryId: newCat.id, parentId: leaf.id, name: "Too late" });
ok("type inside a type that holds designs: 409", r.status === 409 && r.data.error.code === "HOLDS_DESIGNS");
r = await owner.api("POST", "/products", { categoryId: newCat.id, subcategoryId: leaf.id, name: "Royal Velvet 02" });
const p2 = r.data;
r = await owner.api("POST", "/products/reorder", { categoryId: newCat.id, subcategoryId: leaf.id, ids: [p2.id, p1.id] });
ok("reorder designs", r.status === 200);
r = await owner.api("GET", `/products?subcategoryId=${sub.id}`);
ok("list designs below a type, in order", r.status === 200 && r.data.items.map((p) => p.id).join() === `${p2.id},${p1.id}`, JSON.stringify(r.data.items.map((p) => p.id)));
r = await owner.api("GET", `/products?categoryId=${newCat.id}&q=02&limit=1`);
ok("search designs", r.status === 200 && r.data.items.length === 1 && r.data.items[0].id === p2.id);
r = await owner.api("GET", `/products?categoryId=${newCat.id}&limit=1`);
ok("pagination: nextCursor", r.data.nextCursor !== null);
r = await owner.api("GET", `/products?categoryId=${newCat.id}&limit=1&cursor=${encodeURIComponent(r.data.nextCursor)}`);
ok("pagination: second page", r.status === 200 && r.data.items.length === 1 && r.data.items[0].id === p1.id && r.data.nextCursor === null);
r = await owner.api("GET", "/products?categoryId=abc");
ok("bad filter: 400", r.status === 400);
r = await owner.api("PATCH", `/products/${p1.id}`, { visible: false, description: null });
ok("hide design and clear description", r.status === 200 && r.data.visible === false && r.data.description === null);
r = await owner.api("PATCH", `/products/${p1.id}`, { categoryId: cat0.categories[0].id });
ok("move design to a collection that has types: 409", r.status === 409);
const single = cat0.categories.find((c) => c.children.length === 0);
if (single) {
  r = await owner.api("PATCH", `/products/${p1.id}`, { categoryId: single.id });
  ok("move design to a collection that holds designs directly", r.status === 200 && r.data.categoryId === single.id && r.data.subcategoryId === null, JSON.stringify(r.data));
  await owner.api("PATCH", `/products/${p1.id}`, { categoryId: newCat.id, subcategoryId: leaf.id });
}

// ---- photos
const meta = { label: "Test sofa", alt: "A test sofa", width: 1600, height: 1000 };
const sizesA = [[480, fakeWebp(480, 300)], [800, fakeWebp(800, 500)], [1200, fakeWebp(1200, 750)]];
r = await owner.api("POST", "/media", uploadForm(sizesA, meta));
const mediaA = r.data;
ok("upload photo (three sizes)", r.status === 201 && /^m\/[0-9a-f]{16}$/.test(mediaA.key) && mediaA.widths.join() === "480,800,1200" && mediaA.width === 1200 && mediaA.label === "Test sofa", JSON.stringify(r.data));
r = await owner.api("POST", "/media", uploadForm(sizesA, meta));
ok("same photo again returns the same item (200)", r.status === 200 && r.data.id === mediaA.id, r.text);
const hash = mediaA.key.slice(2);
r = await fetch(`${BASE}/m/${hash}-800.webp`);
const body = Buffer.from(await r.arrayBuffer());
ok("/m/ photos carry CSP, CORP and HSTS", /sandbox/.test(r.headers.get("content-security-policy") ?? "") && r.headers.get("cross-origin-resource-policy") === "same-origin" && !!r.headers.get("strict-transport-security"));
ok("/m/ serves the stored file", r.status === 200 && r.headers.get("content-type") === "image/webp" && /immutable/.test(r.headers.get("cache-control")) && r.headers.get("x-content-type-options") === "nosniff" && body.equals(sizesA[1][1]), `${r.status} ${r.headers.get("content-type")}`);
const etag = r.headers.get("etag");
r = await fetch(`${BASE}/m/${hash}-800.webp`, { headers: { "If-None-Match": etag } });
ok("/m/ answers 304 for a matching ETag", r.status === 304);
r = await fetch(`${BASE}/m/${hash}-999.webp`);
ok("/m/ refuses sizes that are not allowed (404)", r.status === 404);
r = await fetch(`${BASE}/m/..%2F${hash}-800.webp`);
ok("/m/ path tricks are 404", r.status === 404);
r = await fetch(`${BASE}/m/${hash}-800.webp`, { method: "POST" });
ok("/m/ POST is 405", r.status === 405);
r = await owner.api("POST", "/media", uploadForm([[480, Buffer.from("<svg onload=alert(1)>".padEnd(60, " "))], [800, fakeWebp(800, 500)]], meta));
ok("a file that is not WebP is refused", r.status === 400 && r.data.error.code === "NOT_WEBP", JSON.stringify(r.data));
r = await owner.api("POST", "/media", uploadForm([[480, fakeWebp(480, 300)], [800, fakeWebp(790, 500)]], meta));
ok("file width must match its name", r.status === 400 && r.data.error.code === "BAD_SIZE", JSON.stringify(r.data));
r = await owner.api("POST", "/media", uploadForm([[480, fakeWebp(480, 300)], [800, fakeWebp(800, 300)]], meta));
ok("sizes must have the same shape", r.status === 400 && r.data.error.code === "BAD_SIZE", JSON.stringify(r.data));
r = await owner.api("POST", "/media", uploadForm([[480, fakeWebp(480, 300)]], meta));
ok("one size only is refused for a large original", r.status === 400);
r = await owner.api("POST", "/media", uploadForm([[480, Buffer.concat([fakeWebp(480, 300), Buffer.alloc(1_600_000)])], [800, fakeWebp(800, 500)]], meta));
ok("a file over 1.5 MB is refused", r.status === 413 || r.status === 400, String(r.status));
r = await owner.api("POST", "/media", uploadForm([[480, fakeWebp(480, 300)], [800, fakeWebp(800, 500)]], { ...meta, extra: 1 }));
ok("unknown meta field is refused", r.status === 400);
const bad = uploadForm([[480, fakeWebp(480, 300)], [800, fakeWebp(800, 500)]], meta);
bad.set("evil.php", new Blob(["x"]), "evil.php");
r = await owner.api("POST", "/media", bad);
ok("unexpected form part is refused", r.status === 400, JSON.stringify(r.data));
r = await owner.api("POST", "/media", uploadForm([[480, fakeWebp(5000, 100)], [800, fakeWebp(800, 500)]], meta));
ok("oversize pixels / wrong width refused", r.status === 400);
const huge = new Uint8Array(7_500_000);
r = await owner.api("POST", "/media", (() => { const f = new FormData(); f.set("meta", JSON.stringify(meta)); f.set("w480", new Blob([huge])); return f; })());
ok("an upload over 6 MB is refused (413)", r.status === 413, String(r.status));
const anonUpload = await new Client(ip(28968)).api("POST", "/media", uploadForm(sizesA, meta));
ok("upload needs sign-in", anonUpload.status === 401);

r = await owner.api("GET", "/media?q=test");
ok("library list and search", r.status === 200 && r.data.items.some((m) => m.id === mediaA.id), r.text);
r = await owner.api("PATCH", `/media/${mediaA.id}`, { label: "Blue sofa", alt: null });
ok("edit label and alt", r.status === 200 && r.data.label === "Blue sofa" && r.data.alt === null, r.text);
r = await owner.api("PUT", `/products/${p1.id}/images`, { images: [{ mediaKey: mediaA.key, alt: "Front" }] });
ok("set design photos", r.status === 200 && r.data.images.length === 1 && r.data.images[0].width === 1200 && r.data.images[0].alt === "Front", JSON.stringify(r.data));
r = await owner.api("PUT", `/products/${p1.id}/images`, { images: [{ mediaKey: mediaA.key }, { mediaKey: mediaA.key }] });
ok("same photo twice is refused", r.status === 400);
r = await owner.api("PUT", `/products/${p1.id}/images`, { images: [{ mediaKey: "m/ffffffffffffffff" }] });
ok("photo not in the library is refused", r.status === 400 && r.data.error.code === "MEDIA_NOT_FOUND");
r = await owner.api("PATCH", `/categories/${newCat.id}`, { imageKey: mediaA.key });
ok("set the collection card photo", r.status === 200 && r.data.imageKey === mediaA.key);
r = await owner.api("PATCH", `/categories/${newCat.id}`, { heroImageKey: mediaA.key });
ok("a collection header photo cannot be changed", r.status === 400 && r.data.error.code === "NOT_REPLACEABLE", JSON.stringify(r.data));
r = await owner.api("DELETE", `/media/${mediaA.id}`);
ok("delete a photo in use: 409 with usedBy", r.status === 409 && r.data.error.code === "MEDIA_IN_USE" && r.data.error.usedBy.length === 2, JSON.stringify(r.data));
const tiny = await owner.api("POST", "/media", uploadForm([[480, fakeWebp(480, 300)]], { label: "Tiny", width: 480, height: 300 }));
ok("small original may have one size", tiny.status === 201, JSON.stringify(tiny.data));
r = await owner.api("PUT", "/site/images/about.band", { mediaKey: tiny.data.key });
ok("photo too small for a wide place: 400", r.status === 400 && r.data.error.code === "TOO_SMALL", JSON.stringify(r.data));
const wideSizes = [[800, fakeWebp(800, 400)], [1200, fakeWebp(1200, 600)]];
r = await owner.api("POST", "/media", uploadForm(wideSizes, { label: "Wide", width: 1200, height: 600 }));
const mediaW = r.data;
r = await owner.api("PUT", "/site/images/about.band", { mediaKey: mediaW.key, alt: "Living room" });
ok("set a site photo", r.status === 200 && r.data.mediaKey === mediaW.key && r.data.media?.id === mediaW.id && r.data.slot === "about.band" && r.data.defaultKey === "demo/about-band", JSON.stringify(r.data).slice(0, 200));
r = await owner.api("PUT", "/site/images/nope.slot", { mediaKey: null });
ok("unknown site place: 404", r.status === 404);
r = await owner.api("GET", "/site/images");
ok("site photo list has the four replaceable places", r.status === 200 && r.data.slots.length === 4 && r.data.slots.find((s) => s.slot === "about.band").mediaKey === mediaW.key && r.data.slots.every((s) => s.defaultKey.startsWith("demo/")));
r = await owner.api("PUT", "/site/images/about.band", { mediaKey: null });
ok("reset: the default is back and the upload is deleted (D1 + R2)", r.status === 200 && r.data.mediaKey === null && r.data.media === null && r.data.defaultKey === "demo/about-band");
r = await fetch(`${BASE}/m/${mediaW.key.slice(2)}-800.webp`);
ok("reset removed the upload files from R2", r.status === 404);
r = await owner.api("DELETE", `/media/${mediaW.id}`);
ok("reset removed the upload row from D1", r.status === 404);
r = await owner.api("DELETE", `/media/${tiny.data.id}`);
ok("delete an unused photo", r.status === 200);

// ---- settings and testimonials
r = await owner.api("GET", "/site/settings");
ok("settings: read", r.status === 200 && r.data.phone === "919212456021" && r.data.businessName, JSON.stringify(r.data));
const oldSettings = r.data;
r = await owner.api("PATCH", "/site/settings", { phone: "98765 43210", phoneDisplay: "+91 98765 43210", instagramHandle: "@delta_test", gstin: "07AAECD7008E1ZZ" });
ok("settings: update number (one number for calls and messages)", r.status === 200 && r.data.phone === "919876543210" && r.data.instagramHandle === "delta_test", JSON.stringify(r.data));
r = await owner.api("PATCH", "/site/settings", { phone: "12" });
ok("settings: bad phone refused", r.status === 400 && r.data.error.field === "phone");
r = await owner.api("PATCH", "/site/settings", { gstin: "not-a-gstin" });
ok("settings: bad GSTIN refused", r.status === 400);
r = await owner.api("PATCH", "/site/settings", { businessName: "<script>" , secret: "x" });
ok("settings: unknown field refused", r.status === 400 && r.data.error.code === "UNKNOWN_FIELD");
await owner.api("PATCH", "/site/settings", { phone: oldSettings.phone, phoneDisplay: oldSettings.phoneDisplay, instagramHandle: oldSettings.instagramHandle, gstin: oldSettings.gstin });
r = await owner.api("POST", "/testimonials", { name: "Test Client", text: "Lovely work." });
const t1 = r.data;
ok("testimonial: create", r.status === 200 && t1.visible === true);
r = await owner.api("PATCH", `/testimonials/${t1.id}`, { visible: false, text: "Updated." });
ok("testimonial: update", r.status === 200 && r.data.visible === false && r.data.text === "Updated.");
const tl = (await owner.api("GET", "/testimonials")).data.items;
r = await owner.api("POST", "/testimonials/reorder", { ids: tl.map((t) => t.id).reverse() });
ok("testimonial: reorder", r.status === 200);
r = await owner.api("DELETE", `/testimonials/${t1.id}`);
ok("testimonial: delete", r.status === 200);
r = await owner.api("DELETE", `/testimonials/${t1.id}`);
ok("testimonial: delete again is 404", r.status === 404);

// ---- enquiries
r = await anon.call("POST", "/api/enquiry", { customerType: "B2C", name: "Check Visitor", phone: "98765 43210", interest: cat0.categories[0].slug, message: "Hello", source: "api-check" }, { headers: { Origin: BASE } });
ok("public enquiry form saves (201)", r.status === 201, JSON.stringify(r.data));
r = await owner.api("GET", "/enquiries?filter=unread");
const enq = r.data?.items?.find((e) => e.source === "api-check");
ok("enquiry shows in the inbox with the collection name", r.status === 200 && enq && enq.categoryName === cat0.categories[0].name && r.data.unread >= 1 && enq.isRead === false, JSON.stringify(r.data).slice(0, 300));
r = await owner.api("PATCH", `/enquiries/${enq.id}`, { isRead: true });
ok("mark enquiry read", r.status === 200 && r.data.isRead === true);
r = await owner.api("DELETE", `/enquiries/${enq.id}`);
ok("delete enquiry", r.status === 200);
r = await owner.api("DELETE", `/enquiries/${enq.id}`);
ok("delete enquiry again: 404", r.status === 404);
r = await anon.call("POST", "/api/enquiry", { customerType: "B2C", name: "X", phone: "1" }, { headers: { Origin: "https://evil.example" } });
ok("enquiry from another origin refused", r.status === 403);

// ---- publish
r = await owner.api("GET", "/publish");
ok("publish status: changes waiting, not configured", r.status === 200 && r.data.state === "changes" && r.data.changesWaiting > 0 && r.data.version > v0 && typeof r.data.configured === "boolean", JSON.stringify(r.data));
if (r.data.configured === false) {
  r = await owner.api("POST", "/publish");
  ok("publish without a hook: clear 'not configured' (503)", r.status === 503 && r.data.error.code === "PUBLISH_NOT_CONFIGURED", JSON.stringify(r.data));
}

// ---- export
r = await anon.call("GET", "/api/content/export");
ok("export without token: 401", r.status === 401);
r = await anon.call("GET", "/api/content/export", undefined, { headers: { Authorization: "Bearer nope" } });
ok("export with wrong token: 401", r.status === 401);
r = await anon.call("GET", "/api/content/export", undefined, { headers: { Authorization: `Bearer ${vars.EXPORT_TOKEN}` } });
const exp = r.data;
const hasKeys = exp && ["version", "categories", "subcategories", "products", "product_images", "media", "site_images", "settings", "testimonials"].every((k) => k in exp);
ok("export with the token returns the build data", r.status === 200 && hasKeys, r.text.slice(0, 200));
ok("export leaves out hidden collections and designs", !exp.categories.some((c) => c.id === newCat.id) && !exp.products.some((p) => p.id === p1.id));
ok("export has no private tables", !/admin_users|pw_hash|sessions|enquir|audit/i.test(r.text.replace(/enquiry/gi, "")));
await owner.api("PATCH", `/categories/${newCat.id}`, { visible: true });
await owner.api("PATCH", `/products/${p1.id}`, { visible: true });
r = await anon.call("GET", "/api/content/export", undefined, { headers: { Authorization: `Bearer ${vars.EXPORT_TOKEN}` } });
ok("visible collection with photo appears in the export", r.data.categories.some((c) => c.id === newCat.id && c.image_key === mediaA.key) && r.data.products.some((p) => p.id === p1.id) && r.data.media.some((m) => m.key === mediaA.key), "");

// ---- sample removal, deletes
r = await owner.api("DELETE", "/products/sample");
ok("remove sample designs", r.status === 200 && typeof r.data.removed === "number", JSON.stringify(r.data));
r = await owner.api("DELETE", `/subcategories/${sub.id}?confirm=wrong`);
ok("delete type needs the typed name", r.status === 400 && r.data.error.code === "CONFIRM_MISMATCH");
r = await owner.api("DELETE", `/subcategories/${sub.id}?confirm=Sofas`);
ok("delete type removes its types and designs", r.status === 200);
r = await owner.api("GET", `/products/${p1.id}`);
ok("designs under the deleted type are gone", r.status === 404);
r = await owner.api("DELETE", `/categories/${newCat.id}?confirm=nope`);
ok("delete collection needs the typed name", r.status === 400);
r = await owner.api("DELETE", `/categories/${newCat.id}?confirm=${encodeURIComponent("Test Lounge")}`);
ok("delete collection", r.status === 200);
await owner.api("DELETE", `/categories/${dupCat.id}?confirm=${encodeURIComponent(dupCat.name)}`);
r = await owner.api("DELETE", `/media/${mediaA.id}`);
ok("the collection delete already removed its photo (D1 + R2)", r.status === 404 && (await fetch(`${BASE}/m/${hash}-800.webp`)).status === 404, JSON.stringify(r.data));

// ---- media lifecycle
const lifeCat = (await owner.api("POST", "/categories", { name: "Lifecycle Test" })).data;
const lifeCat2 = (await owner.api("POST", "/categories", { name: "Lifecycle Two" })).data;
const lifeSub = (await owner.api("POST", "/subcategories", { categoryId: lifeCat2.id, name: "Lifecycle Type" })).data;
const upload = async (label, w = 1200, h = 600) => {
  const res = await owner.api("POST", "/media", uploadForm([[800, fakeWebp(800, Math.round((800 * h) / w))], [1200, fakeWebp(1200, Math.round((1200 * h) / w))]], { label, width: w, height: h }));
  return res.data;
};
const gone = async (m) => (await fetch(`${BASE}/m/${m.key.slice(2)}-800.webp`)).status === 404 && (await fetch(`${BASE}/m/${m.key.slice(2)}-1200.webp`)).status === 404 && (await owner.api("DELETE", `/media/${m.id}`)).status === 404;
const there = async (m) => (await fetch(`${BASE}/m/${m.key.slice(2)}-800.webp`)).status === 200 && (await owner.api("GET", `/media?q=${encodeURIComponent(m.label)}`)).data.items.some((i) => i.id === m.id);

const A2 = await upload("Life A2");
const B2 = await upload("Life B2");
ok("upload stores the files in R2 and the row in D1", A2.key && (await there(A2)));
const design = (await owner.api("POST", "/products", { categoryId: lifeCat.id, name: "Life Design" })).data;
await owner.api("PUT", `/products/${design.id}/images`, { images: [{ mediaKey: A2.key }] });
await owner.api("PATCH", `/categories/${lifeCat.id}`, { imageKey: B2.key });
r = await owner.api("DELETE", `/products/${design.id}`);
ok("deleting a design removes its photo from D1 and R2", r.status === 200 && (await gone(A2)));
ok("a photo still used elsewhere stays when the design goes", await there(B2));
r = await owner.api("DELETE", `/categories/${lifeCat.id}?confirm=${encodeURIComponent("Lifecycle Test")}`);
ok("deleting a collection removes its card photo from D1 and R2", r.status === 200 && (await gone(B2)));

const E2 = await upload("Life E2");
const F2 = await upload("Life F2");
const G2 = await upload("Life G2");
await owner.api("PATCH", `/subcategories/${lifeSub.id}`, { imageKey: E2.key });
const design2 = (await owner.api("POST", "/products", { categoryId: lifeCat2.id, subcategoryId: lifeSub.id, name: "Life Design 2" })).data;
await owner.api("PUT", `/products/${design2.id}/images`, { images: [{ mediaKey: F2.key }, { mediaKey: G2.key }] });
await owner.api("PUT", "/site/images/about.story", { mediaKey: G2.key });
r = await owner.api("DELETE", `/categories/${lifeCat2.id}?confirm=${encodeURIComponent("Lifecycle Two")}`);
ok("deleting a collection removes its type and design photos", r.status === 200 && (await gone(E2)) && (await gone(F2)));
ok("a photo another place still uses survives the collection delete", await there(G2));
r = await owner.api("PUT", "/site/images/about.story", { mediaKey: null });
ok("reset deletes the photo once no place uses it", r.status === 200 && (await gone(G2)));

const C2 = await upload("Life C2");
await owner.api("PUT", "/site/images/about.band", { mediaKey: C2.key });
await owner.api("PUT", "/site/images/contact.showroom", { mediaKey: C2.key });
await owner.api("PUT", "/site/images/about.band", { mediaKey: null });
ok("reset keeps a photo another place still uses", await there(C2));
await owner.api("PUT", "/site/images/contact.showroom", { mediaKey: null });
ok("the last reset deletes it", await gone(C2));

r = await owner.api("PUT", "/site/images/about.band", { mediaKey: "demo/about-band" });
ok("a default file cannot be stored as an upload", r.status === 400, JSON.stringify(r.data));
d1("DB", "INSERT INTO media (key, widths, width, height, bytes, label) VALUES ('demo/about-band', '800', 800, 500, 1, 'Default test');");
r = await owner.api("GET", "/media?q=Default%20test");
const demoRow = r.data.items.find((m) => m.key === "demo/about-band");
r = demoRow ? await owner.api("DELETE", `/media/${demoRow.id}`) : { status: 0 };
ok("a default photo can never be deleted", r.status === 403 && r.data.error.code === "PROTECTED_DEFAULT", r.text);
d1("DB", "DELETE FROM media WHERE key = 'demo/about-band';");
r = await fetch(`${BASE}/m/demo/about-band-800.webp`);
ok("defaults are never served from R2", r.status === 404);
r = await owner.api("PATCH", `/media/${tiny.data.id}`, { label: "x" });
ok("deleted photo cannot be edited", r.status === 404);

for (const slot of ["home.hero.1", "home.hero.2", "home.hero.3", "collection.hero", "about.hero", "contact.hero"]) {
  r = await owner.api("PUT", `/site/images/${slot}`, { mediaKey: null });
  ok(`hero place ${slot} is refused`, r.status === 400 && r.data.error.code === "NOT_REPLACEABLE", JSON.stringify(r.data));
}
r = await owner.api("GET", "/site/images");
ok("hero places are not listed", !r.data.slots.some((s) => /hero/.test(s.slot)));

const U1 = await upload("Life U1");
const U2 = await upload("Life U2");
d1("DB", `UPDATE media SET created_at = datetime('now', '-3 hours') WHERE key = '${U1.key}';`);
r = await owner.api("POST", "/media/sweep");
ok("sweep removes an unused photo older than an hour", r.status === 200 && r.data.photos >= 1 && (await gone(U1)), r.text);
ok("sweep leaves a fresh unused photo (it may still be attached)", await there(U2));
r = await owner.api("POST", "/media/sweep?minutes=-1");
ok("sweep refuses a bad age", r.status === 400);
const strayName = `m/${randomBytes(8).toString("hex")}-800.webp`;
writeFileSync(".wrangler/stray.webp", fakeWebp(800, 400));
execFileSync("npx", ["wrangler", "r2", "object", "put", `delta-furnishings-media/${strayName}`, "--file", ".wrangler/stray.webp", "--local", "--content-type", "image/webp"], { stdio: ["ignore", "ignore", "inherit"], shell: true });
ok("a stray file (failed upload) is served until swept", (await fetch(`${BASE}/${strayName}`)).status === 200);
r = await owner.api("POST", "/media/sweep");
ok("a fresh stray file is left for now", (await fetch(`${BASE}/${strayName}`)).status === 200);
r = await owner.api("POST", "/media/sweep?minutes=0");
ok("sweep removes the stray R2 file and the unused photo", r.status === 200 && r.data.files >= 1 && r.data.photos >= 1 && (await fetch(`${BASE}/${strayName}`)).status === 404 && (await gone(U2)), r.text);
r = await anon.api("POST", "/media/sweep");
ok("sweep needs sign-in", r.status === 401);
// ---- sessions, audit, headers
r = await owner.api("DELETE", "/sessions/others");
ok("sign out other devices", r.status === 200);
r = await owner.api("GET", "/audit?limit=5");
await new Promise((res) => setTimeout(res, 300));
r = await owner.api("GET", "/audit?limit=5");
ok("audit log has entries with paging", r.status === 200 && r.data.items.length === 5 && r.data.nextCursor, JSON.stringify(r.data).slice(0, 200));
r = await owner.api("GET", "/audit?limit=200");
const actions = new Set(r.data.items.map((a) => a.action));
ok("audit covers sign-in, failures, changes", ["login", "login_failed", "category.create", "media.upload", "password_change"].every((a) => actions.has(a)), [...actions].join());
ok("audit never holds passwords or tokens", !r.text.includes(PASS1) && !r.text.includes(PASS2) && !r.text.includes(vars.SESSION_PEPPER) && !/__Host-delta/.test(r.text));
r = await owner.api("GET", "/nothing-here");
ok("unknown route: 404 JSON", r.status === 404 && r.data.error.code === "NOT_FOUND");
r = await owner.api("PUT", "/catalogue", {});
ok("wrong method: 405 with Allow", r.status === 405 && /GET/.test(r.headers.get("allow") ?? ""));
r = await fetch(`${BASE}/`);
await r.arrayBuffer();
ok("site pages carry the security headers", r.headers.get("x-content-type-options") === "nosniff" && !!r.headers.get("strict-transport-security") && !!r.headers.get("permissions-policy") && !!r.headers.get("content-security-policy"), [...r.headers.keys()].join());
const pageCsp = r.headers.get("content-security-policy") ?? "";
ok("site pages: CSP closes plugins, foreign frames, base and forms; HSTS, referrer and COOP set", /default-src 'self'/.test(pageCsp) && /frame-ancestors 'self'/.test(pageCsp) && /object-src 'none'/.test(pageCsp) && /base-uri 'self'/.test(pageCsp) && /form-action 'self'/.test(pageCsp) && /max-age=\d{7,}/.test(r.headers.get("strict-transport-security") ?? "") && r.headers.get("referrer-policy") === "strict-origin-when-cross-origin" && r.headers.get("cross-origin-opener-policy") === "same-origin", pageCsp);
r = await fetch(`${BASE}/api/health`);
await r.arrayBuffer();
ok("API replies: no-store, nosniff, CSP none, CORP same-origin, HSTS", r.headers.get("cache-control") === "no-store" && /default-src 'none'/.test(r.headers.get("content-security-policy") ?? "") && r.headers.get("cross-origin-resource-policy") === "same-origin" && !!r.headers.get("strict-transport-security"));
r = await anon.call("POST", "/api/enquiry", { customerType: "B2C", name: "X", phone: "x" }, { headers: { Origin: BASE } });
ok("enquiry replies carry the API headers, validation errors are 422", r.status === 422 && r.headers.get("x-content-type-options") === "nosniff" && r.headers.get("cache-control") === "no-store");
r = await fetch(`${BASE}/api/enquiry`, { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" } });
await r.arrayBuffer();
ok("enquiry: no CORS headers are ever sent", !r.headers.get("access-control-allow-origin"));
r = await fetch(`${BASE}/admin`);
await r.arrayBuffer();
ok("/admin carries DENY, noindex and CSP", r.headers.get("x-frame-options") === "DENY" && /noindex/.test(r.headers.get("x-robots-tag") ?? "") && /frame-ancestors 'none'/.test(r.headers.get("content-security-policy") ?? ""), `${r.status} ${[...r.headers.keys()].join()}`);

r = await owner.api("POST", "/auth/logout");
// ---- sign in by emailed code (against the local email stub)
try {
  await startStub();
} catch {
  /* the stub is already running */
}
const STUB = "http://127.0.0.1:8799";
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const lastMail = async (to) => {
  const res = await fetch(`${STUB}/last?to=${encodeURIComponent(to)}`);
  return res.status === 200 ? res.json() : null;
};
const waitMail = async (to, since, tries = 25) => {
  for (let i = 0; i < tries; i++) {
    const m = await lastMail(to);
    if (m && m.at >= since) return m;
    await wait(120);
  }
  return null;
};
const codeOf = (m) => /\b(\d{6})\b/.exec(m.text)?.[1];
let nextIp = 31000;
const fresh = () => new Client(ip(nextIp++));
const PASS3 = "yet another long passphrase 3";
const clean = () => d1("AUTH_DB", "DELETE FROM login_attempts; DELETE FROM email_code_requests; DELETE FROM email_codes;");
const requestCode = async (to = EMAIL) => {
  const since = Date.now();
  const res = await fresh().api("POST", "/auth/code/request", { email: to });
  const mail = res.status === 200 ? await waitMail(to, since) : null;
  return { res, mail, code: mail ? codeOf(mail) : null };
};
const wrongOf = (c) => (c === "111111" ? "222222" : "111111");

d1("AUTH_DB", "UPDATE admin_users SET totp_enabled = 0, totp_last_step = NULL;");
clean();
r = await anon.api("GET", "/auth/status");
ok("status: email codes are available", r.status === 200 && r.data.emailCodes === true && r.data.setupRequired === false, JSON.stringify(r.data));

const since0 = Date.now();
const ghost = await fresh().api("POST", "/auth/code/request", { email: "nobody@example.com" });
const first = await requestCode();
ok("request: the answer is the same for an unknown email and the owner (no enumeration)", ghost.status === 200 && first.res.status === 200 && ghost.text === first.res.text && ghost.text === JSON.stringify({ ok: true }), `${ghost.text} | ${first.res.text}`);
ok("request: no mail is sent to an unknown address", (await waitMail("nobody@example.com", since0, 10)) === null);
ok("request: the owner gets a 6-digit code, in text only, no link", !!first.code && /^\d{6}$/.test(first.code) && first.mail.to[0] === EMAIL && !/https?:|href=|<a /i.test(first.mail.text + first.mail.html), JSON.stringify(first.mail)?.slice(0, 200));
ok("request: the code is never written to the Worker log", !readFileSync(".wrangler/dev.log", "utf8").includes(first.code ?? "no-code"));
r = await fresh().api("POST", "/auth/code/request", { email: "not an email" });
ok("request: a malformed email is refused", r.status === 400);
r = await fresh().api("POST", "/auth/code/request", { email: EMAIL }, { headers: { "Sec-Fetch-Site": "cross-site" } });
ok("request: from another site is refused (CSRF)", r.status === 403);

// wrong code, then the right one
const bad1 = await fresh().api("POST", "/auth/code/verify", { email: EMAIL, code: wrongOf(first.code) });
const badGhost = await fresh().api("POST", "/auth/code/verify", { email: "nobody@example.com", code: first.code });
ok("verify: a wrong code is refused", bad1.status === 401 && bad1.data.error.code === "BAD_CODE", bad1.text);
ok("verify: the same refusal for an unknown email (no enumeration)", badGhost.status === 401 && badGhost.text === bad1.text, badGhost.text);
const rc = fresh();
r = await rc.api("POST", "/auth/code/verify", { email: EMAIL, code: first.code });
ok("verify: the right code signs in with a password-reset session", r.status === 200 && r.data.mustSetPassword === true && !!r.data.csrf && r.set.some((s) => s.startsWith("__Host-delta_admin=") && /HttpOnly/.test(s)), r.text);
rc.csrf = r.data?.csrf ?? "";
r = await rc.api("GET", "/catalogue");
ok("reset session: dashboard routes are closed until the password is set", r.status === 403 && r.data.error.code === "PASSWORD_RESET_REQUIRED", r.text);
r = await rc.api("GET", "/me");
ok("reset session: /me says the password must be set", r.status === 200 && r.data.mustSetPassword === true);
r = await fresh().api("POST", "/auth/code/verify", { email: EMAIL, code: first.code });
ok("verify: a code works once only", r.status === 401 && r.data.error.code === "BAD_CODE", r.text);
r = await rc.api("POST", "/auth/password/reset", { next: "short" });
ok("set password: a weak one is refused", r.status === 400 && r.data.error.code === "WEAK_PASSWORD", r.text);
r = await anon.api("POST", "/auth/password/reset", { next: PASS3 });
ok("set password: needs a session", r.status === 401);
r = await rc.api("POST", "/auth/password/reset", { next: PASS3 });
ok("set password: the new password is accepted and the session becomes normal", r.status === 200 && r.data.mustSetPassword === undefined && !!r.data.csrf, r.text);
rc.csrf = r.data?.csrf ?? "";
r = await rc.api("GET", "/catalogue");
ok("after the new password the dashboard opens", r.status === 200);
r = await rc.api("POST", "/auth/password/reset", { next: PASS2 });
ok("set password: a normal session cannot use the reset route", r.status === 403 && r.data.error.code === "NOT_RECOVERY", r.text);
r = await fresh().api("POST", "/auth/login", { email: EMAIL, password: PASS2 });
ok("the old password no longer works", r.status === 401);
r = await fresh().api("POST", "/auth/login", { email: EMAIL, password: PASS3 });
ok("the new password works", r.status === 200 && r.data.ok === true, r.text);

// expiry
clean();
const expired = await requestCode();
d1("AUTH_DB", "UPDATE email_codes SET expires_at = expires_at - 700;");
r = await fresh().api("POST", "/auth/code/verify", { email: EMAIL, code: expired.code });
ok("verify: a code older than 10 minutes is refused", r.status === 401 && r.data.error.code === "BAD_CODE", r.text);

// five wrong tries kill the code
clean();
const lim = await requestCode();
for (let i = 0; i < 5; i++) await fresh().api("POST", "/auth/code/verify", { email: EMAIL, code: wrongOf(lim.code) });
r = await fresh().api("POST", "/auth/code/verify", { email: EMAIL, code: lim.code });
ok("verify: after 5 wrong tries even the right code is dead", r.status === 401 && r.data.error.code === "BAD_CODE", r.text);
const lim2 = await requestCode();
ok("a fresh code can be asked for after that", !!lim2.code && lim2.code !== undefined);
r = await fresh().api("POST", "/auth/code/verify", { email: EMAIL, code: lim2.code });
ok("the new code works (the old one is replaced)", r.status === 200 && r.data.mustSetPassword === true, r.text);

// the authenticator app is still required
clean();
d1("AUTH_DB", "UPDATE admin_users SET totp_enabled = 1, totp_last_step = NULL;");
const two = await requestCode();
const tc = fresh();
r = await tc.api("POST", "/auth/code/verify", { email: EMAIL, code: two.code });
ok("2FA: the emailed code alone asks for the authenticator code and signs nobody in", r.status === 200 && r.data.needsCode === true && !tc.cookie && r.set.length === 0, r.text);
r = await tc.api("POST", "/auth/code/verify", { email: EMAIL, code: two.code, totp: "000000" });
ok("2FA: a wrong authenticator code is refused", r.status === 401 && r.data.error.field === "totp" && !tc.cookie, r.text);
r = await tc.api("POST", "/auth/code/verify", { email: EMAIL, code: two.code, totp: totp(secret) });
ok("2FA: emailed code plus authenticator code signs in to the reset session", r.status === 200 && r.data.mustSetPassword === true && !!tc.cookie, r.text);
tc.csrf = r.data?.csrf ?? "";
r = await tc.api("POST", "/auth/password/reset", { next: PASS2 });
ok("2FA: set the new password", r.status === 200 && r.data.user.totpEnabled === true, r.text);
r = await fresh().api("POST", "/auth/login", { email: EMAIL, password: PASS2 });
ok("2FA: password sign-in still asks for the authenticator code", r.status === 200 && r.data.needsCode === true);
d1("AUTH_DB", "UPDATE admin_users SET totp_enabled = 0, totp_last_step = NULL;");

// throttles
clean();
const asks = [];
for (let i = 0; i < 4; i++) asks.push((await fresh().api("POST", "/auth/code/request", { email: "ghost@example.com" })).status);
ok("throttle per email: the 4th request in 15 minutes is refused, for an unknown email too", asks.slice(0, 3).every((s) => s === 200) && asks[3] === 429, asks.join());
clean();
const owners = [];
for (let i = 0; i < 4; i++) owners.push((await fresh().api("POST", "/auth/code/request", { email: EMAIL })).status);
ok("throttle per email: the same for the owner", owners.slice(0, 3).every((s) => s === 200) && owners[3] === 429, owners.join());
clean();
const sameAddress = new Client(ip(nextIp++));
const perIp = [];
for (let i = 0; i < 8; i++) perIp.push((await sameAddress.api("POST", "/auth/code/request", { email: `person${i}@example.com` })).status);
ok("throttle per address: one address cannot ask without limit", perIp.slice(0, 4).every((s) => s === 200) && perIp.includes(429), perIp.join());
clean();
d1("AUTH_DB", "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 21) INSERT INTO email_code_requests (key_hash, at) SELECT 'global', CAST(strftime('%s', 'now') AS INTEGER) FROM n;");
r = await fresh().api("POST", "/auth/code/request", { email: "someone@example.com" });
ok("throttle global: too many requests across all addresses stops them", r.status === 429, r.text);
clean();
const tries = new Client(ip(nextIp++));
const verifyStatuses = [];
for (let i = 0; i < 6; i++) verifyStatuses.push((await tries.api("POST", "/auth/code/verify", { email: "ghost@example.com", code: "123456" })).status);
ok("throttle on verify: repeated wrong codes from one address are stopped (429)", verifyStatuses.slice(0, 5).every((s) => s === 401) && verifyStatuses[5] === 429, verifyStatuses.join());
r = await anon.api("POST", "/auth/code/verify", { email: EMAIL, code: "12345" });
ok("verify: a code that is not 6 digits is refused (400)", r.status === 400);
clean();
d1("AUTH_DB", "UPDATE admin_users SET totp_enabled = 0;");
r = await fresh().api("POST", "/auth/login", { email: EMAIL, password: PASS2 });
ok("password sign-in is unaffected by all of this", r.status === 200 && r.data.ok === true, r.text);
{
  const o2 = fresh();
  await o2.api("POST", "/auth/login", { email: EMAIL, password: PASS2 });
  await o2.refreshCsrf();
  await wait(500);
  const a = await o2.api("GET", "/audit?limit=200");
  const seen = new Set((a.data?.items ?? []).map((x) => x.action));
  ok("audit: code requests, code sign-ins and password resets are recorded, never the code", ["code_request", "login_code", "password_reset"].every((x) => seen.has(x)) && !a.text.includes(lim2.code ?? "no-code"), [...seen].join());
  await o2.api("POST", "/auth/logout");
}// ---- people who can sign in, and the enquiry email
{
  clean();
  const boss = fresh();
  r = await boss.api("POST", "/auth/login", { email: EMAIL, password: PASS2 });
  await boss.refreshCsrf();
  const NEWBIE = "new.person@example.com";
  r = await boss.api("GET", "/users");
  ok("people: the list shows the owner, marked as you", r.status === 200 && r.data.items.some((u) => u.email === EMAIL && u.you === true) && !/pw_hash|pw_salt|totp/.test(r.text), r.text);
  const sinceAdd = Date.now();
  r = await boss.api("POST", "/users", { email: NEWBIE, name: "New Person" });
  const newId = r.data?.member?.id;
  ok("people: adding an email works and says they are waiting", r.status === 201 && r.data.member.email === NEWBIE && r.data.member.waiting === true && r.data.invited === true, r.text);
  const invite = await waitMail(NEWBIE, sinceAdd);
  ok("people: the new person is emailed how to start (no password, no code)", !!invite && /Forgot password or first time/.test(invite.text) && !/\b\d{6}\b/.test(invite.text), invite?.text);
  r = await boss.api("POST", "/users", { email: NEWBIE.toUpperCase() });
  ok("people: the same email again is refused", r.status === 409, r.text);
  r = await boss.api("POST", "/users", { email: "not-an-email" });
  ok("people: a bad email is refused", r.status === 400, r.text);
  r = await anon.api("GET", "/users");
  ok("people: a visitor cannot list them", r.status === 401);
  r = await anon.api("POST", "/users", { email: "x@example.com" }, { headers: { "X-CSRF-Token": "x" } });
  ok("people: a visitor cannot add one", r.status === 401);
  r = await boss.api("POST", "/users", { email: "no.csrf@example.com" }, { noCsrf: true });
  ok("people: adding without the CSRF token is refused", r.status === 403, r.text);

  // The new person cannot sign in with any password, and sets their own with an emailed code.
  r = await fresh().api("POST", "/auth/login", { email: NEWBIE, password: "any password at all 1" });
  ok("people: nobody can sign in as them before they choose a password", r.status === 401, r.text);
  clean();
  const first = await requestCode(NEWBIE);
  ok("people: they ask for a code and one is emailed", first.res.status === 200 && !!first.code, first.res.text);
  const chosen = fresh();
  r = await chosen.api("POST", "/auth/code/verify", { email: NEWBIE, code: first.code });
  await chosen.refreshCsrf();
  r = await chosen.api("POST", "/auth/password/reset", { next: PASS3 });
  ok("people: they choose their own password", r.status === 200, r.text);
  r = await fresh().api("POST", "/auth/login", { email: NEWBIE, password: PASS3 });
  ok("people: they can then sign in with it", r.status === 200 && r.data.ok === true, r.text);

  // Enquiry emails go to every person, never reveal the others, and carry no raw HTML from the visitor.
  const sinceEnq = Date.now();
  r = await anon.call("POST", "/api/enquiry", { customerType: "B2B", name: "Pat <b>Smith</b>", company: "Firm & Co", phone: "98765 43210", message: "Need <script>alert(1)</script> curtains\nfor 3 rooms", interest: "curtains-blinds" }, { headers: { Origin: BASE } });
  ok("enquiry: the form still saves", r.status === 201, r.text);
  const toOwner = await waitMail(EMAIL, sinceEnq);
  const toNew = await waitMail(NEWBIE, sinceEnq);
  ok("enquiry email: every person gets one", !!toOwner && !!toNew, `${!!toOwner} ${!!toNew}`);
  ok("enquiry email: has the details, a link to the dashboard, and each mail has one recipient", /Pat/.test(toOwner?.text ?? "") && /9876543210/.test((toOwner?.text ?? "").replace(/\D/g, "")) && /\/admin\/enquiries/.test(toOwner?.text ?? "") && toOwner.to.length === 1 && toNew.to.length === 1, JSON.stringify(toOwner?.to));
  ok("enquiry email: what the visitor typed is escaped in the HTML part", !/<script>|<b>Smith/.test(toOwner?.html ?? "") && /&lt;script&gt;/.test(toOwner?.html ?? ""), toOwner?.html);
  ok("enquiry email: the subject is one plain line", /^New enquiry from /.test(toOwner?.subject ?? "") && !/[\r\n]/.test(toOwner?.subject ?? ""), toOwner?.subject);
  d1("ENQ_DB", "DELETE FROM enquiries WHERE name LIKE 'Pat %';");

  // Removing a person signs them out and stops their mail.
  const theirs = fresh();
  await theirs.api("POST", "/auth/login", { email: NEWBIE, password: PASS3 });
  r = await theirs.api("GET", "/me");
  ok("people: before removal their session works", r.status === 200);
  r = await boss.api("DELETE", `/users/${newId}`);
  ok("people: removing them works", r.status === 200, r.text);
  r = await theirs.api("GET", "/me");
  ok("people: their open session ends at once", r.status === 401, `${r.status}`);
  r = await fresh().api("POST", "/auth/login", { email: NEWBIE, password: PASS3 });
  ok("people: they can no longer sign in", r.status === 401);
  const meId = (await boss.api("GET", "/users")).data.items.find((u) => u.you).id;
  r = await boss.api("DELETE", `/users/${meId}`);
  ok("people: you cannot remove yourself", r.status === 400, r.text);
  const sinceAfter = Date.now();
  await anon.call("POST", "/api/enquiry", { customerType: "B2C", name: "After Removal", phone: "98765 43210" }, { headers: { Origin: BASE } });
  await wait(900);
  const stray = await lastMail(NEWBIE);
  ok("enquiry email: a removed person gets no more", !stray || stray.at < sinceAfter, "");
  d1("ENQ_DB", "DELETE FROM enquiries WHERE name = 'After Removal';");
  await boss.api("POST", "/auth/logout");
}
r = await fresh().api("GET", "/auth/status");
ok("status still public and small", r.status === 200 && Object.keys(r.data).sort().join() === "emailCodes,setupRequired");
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
