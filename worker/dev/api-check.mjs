// End-to-end check of the dashboard API against the LOCAL Worker.
//   node worker/dev/start.mjs        (starts the Worker if it is not running)
//   node worker/dev/api-check.mjs
// It clears the local sign-in tables first (--local only) and leaves a few
// test rows in the local content database. Never touches the live account.
import { execFileSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

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
for (let i = 0; i < 7; i++) last = await new Client(ip(300 + i)).api("POST", "/auth/login", { email: "victim@example.com", password: "wrong password here" });
ok("6th failure for one email is throttled (429 + Retry-After)", last.status === 429 && Number(last.headers.get("retry-after")) > 0, `${last.status}`);
last = await new Client(ip(25699)).api("POST", "/auth/login", { email: "victim@example.com", password: PASS1 });
ok("throttled email stays refused from another address", last.status === 429);
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
ok("password change works", r.status === 200, JSON.stringify(r.data));
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
r = await owner.api("PATCH", `/categories/${newCat.id}`, { imageKey: mediaA.key, heroImageKey: mediaA.key });
ok("set collection photos", r.status === 200 && r.data.imageKey === mediaA.key);
r = await owner.api("DELETE", `/media/${mediaA.id}`);
ok("delete a photo in use: 409 with usedBy", r.status === 409 && r.data.error.code === "MEDIA_IN_USE" && r.data.error.usedBy.length === 2, JSON.stringify(r.data));
const tiny = await owner.api("POST", "/media", uploadForm([[480, fakeWebp(480, 300)]], { label: "Tiny", width: 480, height: 300 }));
ok("small original may have one size", tiny.status === 201, JSON.stringify(tiny.data));
r = await owner.api("PUT", "/site/images/home.hero.1", { mediaKey: tiny.data.key });
ok("photo too small for a wide place: 400", r.status === 400 && r.data.error.code === "TOO_SMALL", JSON.stringify(r.data));
const wideSizes = [[800, fakeWebp(800, 400)], [1200, fakeWebp(1200, 600)]];
r = await owner.api("POST", "/media", uploadForm(wideSizes, { label: "Wide", width: 1200, height: 600 }));
const mediaW = r.data;
r = await owner.api("PUT", "/site/images/home.hero.1", { mediaKey: mediaW.key, alt: "Living room" });
ok("set a site photo", r.status === 200 && r.data.mediaKey === mediaW.key && r.data.media?.id === mediaW.id && r.data.slot === "home.hero.1", JSON.stringify(r.data).slice(0, 200));
r = await owner.api("PUT", "/site/images/nope.slot", { mediaKey: null });
ok("unknown site place: 404", r.status === 404);
r = await owner.api("GET", "/site/images");
ok("site photo list has every place", r.status === 200 && r.data.slots.length === 10 && r.data.slots.find((s) => s.slot === "home.hero.1").mediaKey === mediaW.key);
r = await owner.api("PUT", "/site/images/home.hero.1", { mediaKey: null });
ok("site photo back to the stand-in", r.status === 200 && r.data.mediaKey === null && r.data.media === null);
await owner.api("DELETE", `/media/${tiny.data.id}`);
r = await owner.api("DELETE", `/media/${mediaW.id}`);
ok("delete an unused photo", r.status === 200);
r = await fetch(`${BASE}/m/${mediaW.key.slice(2)}-800.webp`);
ok("deleted photo is gone from R2", r.status === 404);

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
ok("photo can be deleted once nothing uses it", r.status === 200, JSON.stringify(r.data));

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
r = await fetch(`${BASE}/admin`);
await r.arrayBuffer();
ok("/admin carries DENY, noindex and CSP", r.headers.get("x-frame-options") === "DENY" && /noindex/.test(r.headers.get("x-robots-tag") ?? "") && /frame-ancestors 'none'/.test(r.headers.get("content-security-policy") ?? ""), `${r.status} ${[...r.headers.keys()].join()}`);

r = await owner.api("POST", "/auth/logout");
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
