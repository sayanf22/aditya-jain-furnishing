// Estimates CPU time per dashboard API request on the LOCAL Worker, with the
// same method as scripts/cpu-profile.mjs (DevTools CPU profile over the
// inspector, idle and waiting time not counted).
//   node worker/dev/start.mjs
//   node worker/dev/cpu-admin.mjs
// The figures are an upper bound: they include wrangler's local wrapper and
// the profiler. /api/health is measured too, as the overhead every request
// carries here; "own work" is the difference.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:8787";
const INSPECTOR = process.env.INSPECTOR ?? "http://127.0.0.1:9230";
const RUNS = Number(process.env.RUNS ?? 20);
const vars = Object.fromEntries(
  readFileSync(".dev.vars", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const EMAIL = "owner@example.com";
const PASSWORDS = ["another long passphrase 2", "correct horse battery 1"];
let ipCounter = 0;
// A fresh address per call keeps the per-address rate limit out of the measurement.
const ipFor = () => `10.98.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}`;
const nextIp = () => `10.99.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}`;

// ----- session
let cookie = "";
let csrf = "";
async function raw(method, path, body, extra = {}) {
  const headers = { "CF-Connecting-IP": ipFor(path), ...extra };
  if (cookie) headers.Cookie = cookie;
  if (method !== "GET") {
    headers.Origin = BASE;
    headers["Sec-Fetch-Site"] = "same-origin";
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set[0].split(";")[0];
  await res.arrayBuffer();
  return res;
}
async function signIn() {
  // Start from a clean local owner (local database only).
  execFileSync("npx", ["wrangler", "d1", "execute", "AUTH_DB", "--local", "--command", "\"DELETE FROM sessions; DELETE FROM login_attempts; DELETE FROM admin_users;\""], { stdio: ["ignore", "ignore", "inherit"], shell: true });
  const status = await (await fetch(`${BASE}/api/admin/auth/status`)).json();
  if (status.setupRequired) {
    await raw("POST", "/api/admin/auth/setup", { setupCode: vars.SETUP_CODE, email: EMAIL, password: PASSWORDS[0] });
  } else {
    for (const password of PASSWORDS) {
      const res = await raw("POST", "/api/admin/auth/login", { email: EMAIL, password });
      if (res.ok && cookie) break;
    }
  }
  const meRes = await fetch(`${BASE}/api/admin/me`, { headers: { Cookie: cookie } });
  const me = await meRes.json();
  csrf = me.csrf;
  if (!csrf) console.log("sign-in failed:", status, meRes.status, JSON.stringify(me), cookie.slice(0, 20));
  if (!csrf) throw new Error("could not sign in (run worker/dev/api-check.mjs once to create the local owner)");
}

// ----- profiler
const targets = await (await fetch(`${INSPECTOR}/json`)).json();
const ws = new WebSocket(targets[0].webSocketDebuggerUrl, { headers: { Origin: "https://devtools.devprod.cloudflare.dev" } });
await new Promise((resolve, reject) => ((ws.onopen = resolve), (ws.onerror = reject)));
let nextId = 1;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
const send = (method, params = {}) => {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((r) => pending.set(id, r));
};
const IDLE = new Set(["(idle)", "(program)"]);
function busyMs(p) {
  const idle = new Set(p.nodes.filter((n) => IDLE.has(n.callFrame.functionName)).map((n) => n.id));
  let us = 0;
  p.samples.forEach((id, i) => {
    if (!idle.has(id)) us += p.timeDeltas[i] ?? 0;
  });
  return us / 1000;
}
// Time by where the busy samples sit: the Worker's own modules (what Cloudflare bills),
// versus wrangler's local wrapper and the local D1/R2 simulators (not billed in production).
function split(p) {
  const parent = new Map();
  for (const n of p.nodes) for (const ch of n.children ?? []) parent.set(ch, n.id);
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const idle = new Set(p.nodes.filter((n) => IDLE.has(n.callFrame.functionName)).map((n) => n.id));
  const out = { app: 0, local: 0 };
  p.samples.forEach((id, i) => {
    if (idle.has(id)) return;
    const us = p.timeDeltas[i] ?? 0;
    let at = id;
    let local = false;
    let app = false;
    while (at !== undefined) {
      const url = byId.get(at).callFrame.url;
      if (/cloudflare-internal|miniflare|node_modules[\\/](wrangler|miniflare)|wrangler-modules|__WRANGLER|d1|sql/i.test(url) && !/worker[\\/](admin|api|index)|lib[\\/]server/.test(url)) local = true;
      if (/lib[\\/]server|worker[\\/](admin|api|index)|lib[\\/]enquiry|lib[\\/]admin-api/.test(url)) app = true;
      at = parent.get(at);
    }
    if (app && !local) out.app += us;
    else out.local += us;
  });
  return { app: out.app / 1000, local: out.local / 1000 };
}
function frames(p, top = 14) {
  const self = new Map();
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  p.samples.forEach((id, i) => {
    const cf = byId.get(id).callFrame;
    if (IDLE.has(cf.functionName)) return;
    const key = `${cf.url.split(/[\\/]/).slice(-2).join("/") || "(native)"} ${cf.functionName || "(anonymous)"}`;
    self.set(key, (self.get(key) ?? 0) + (p.timeDeltas[i] ?? 0) / 1000);
  });
  return [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
}
async function measure(fn, runs) {
  await send("Profiler.start");
  let status = 0;
  for (let i = 0; i < runs; i++) status = (await fn(i)).status;
  const { result } = await send("Profiler.stop");
  if (process.env.FRAMES) console.log(frames(result.profile).map(([k, v]) => `      ${(v / runs).toFixed(2)} ms  ${k}`).join("\n"));
  const s = split(result.profile);
  return { perRequest: busyMs(result.profile) / runs, appPerRequest: s.app / runs, status };
}

await signIn();
await send("Profiler.enable");
await send("Profiler.setSamplingInterval", { interval: 200 });

const health = () => raw("GET", "/api/health");
await measure(health, 3);
const baseline = (await measure(health, RUNS)).perRequest;
console.log(`CPU per request, local upper bound (${RUNS} requests each)`);
console.log(`  baseline /api/health: ${baseline.toFixed(2)} ms\n`);

const cats = await (await fetch(`${BASE}/api/admin/catalogue`, { headers: { Cookie: cookie } })).json();
const catIds = cats.categories.map((c) => c.id);
const padded = (w, h, n) => {
  const data = Buffer.concat([Buffer.from([0x2f, 0, 0, 0, 0]), Buffer.alloc(n, 7)]);
  data.writeUInt32LE((w - 1) | ((h - 1) << 14), 1);
  const chunk = Buffer.concat([Buffer.from("VP8L"), Buffer.alloc(4), data, Buffer.alloc(data.length % 2)]);
  chunk.writeUInt32LE(data.length, 4);
  const riff = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), chunk]);
  riff.writeUInt32LE(riff.length - 8, 4);
  return riff;
};

const cases = [
  ["GET /me", () => raw("GET", "/api/admin/me")],
  ["GET /catalogue", () => raw("GET", "/api/admin/catalogue")],
  ["GET /products?limit=50", () => raw("GET", "/api/admin/products?limit=50")],
  ["GET /media", () => raw("GET", "/api/admin/media")],
  ["GET /site/images", () => raw("GET", "/api/admin/site/images")],
  ["GET /site/settings", () => raw("GET", "/api/admin/site/settings")],
  ["GET /enquiries", () => raw("GET", "/api/admin/enquiries")],
  ["GET /publish", () => raw("GET", "/api/admin/publish")],
  ["GET /audit", () => raw("GET", "/api/admin/audit")],
  ["GET /sessions", () => raw("GET", "/api/admin/sessions")],
  ["PATCH category (rename same)", () => raw("PATCH", `/api/admin/categories/${catIds[0]}`, { visible: true })],
  ["POST categories/reorder", () => raw("POST", "/api/admin/categories/reorder", { ids: catIds })],
  [
    "POST /media (3 files, 1 MB total)",
    (i) => {
      const f = new FormData();
      f.set("meta", JSON.stringify({ label: "cpu", width: 1200, height: 750 }));
      for (const [w, h] of [[480, 300], [800, 500], [1200, 750]]) f.set(`w${w}`, new Blob([padded(w, h, 330_000 + i)]));
      return raw("POST", "/api/admin/media", f);
    },
  ],
];
for (const [name, fn] of cases) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) continue;
  await fn(0); // warm-up (module load)
  const m = await measure(fn, RUNS);
  const own = Math.max(0, m.perRequest - baseline);
  console.log(`  ${name.padEnd(34)} status ${m.status}  measured ${m.perRequest.toFixed(2)} ms, own work ~ ${own.toFixed(2)} ms, Worker code only ${m.appPerRequest.toFixed(2)} ms`);
}

// Sign-in does the password hash: use a fresh address each time so the rate limit does not interfere.
const loginRuns = 4;
const loginFn = async () => raw("POST", "/api/admin/auth/login", { email: EMAIL, password: PASSWORDS.find(Boolean) }, { "CF-Connecting-IP": nextIp() });
const savedCookie = cookie;
const savedCsrf = csrf;
for (const password of PASSWORDS) {
  cookie = "";
  const probe = await raw("POST", "/api/admin/auth/login", { email: EMAIL, password }, { "CF-Connecting-IP": nextIp() });
  if (probe.ok) {
    const m = await measure(() => raw("POST", "/api/admin/auth/login", { email: EMAIL, password }, { "CF-Connecting-IP": nextIp() }), loginRuns);
    console.log(`  ${"POST /auth/login (1 password hash)".padEnd(34)} status ${m.status}  measured ${m.perRequest.toFixed(2)} ms, own work ~ ${Math.max(0, m.perRequest - baseline).toFixed(2)} ms, Worker code only ${m.appPerRequest.toFixed(2)} ms`);
    const wrong = await measure(() => raw("POST", "/api/admin/auth/login", { email: "nobody@example.com", password: "wrong password" }, { "CF-Connecting-IP": nextIp() }), loginRuns);
    console.log(`  ${"POST /auth/login (unknown email)".padEnd(34)} status ${wrong.status}  measured ${wrong.perRequest.toFixed(2)} ms, own work ~ ${Math.max(0, wrong.perRequest - baseline).toFixed(2)} ms, Worker code only ${wrong.appPerRequest.toFixed(2)} ms`);
    break;
  }
}
void loginFn;
cookie = savedCookie;
csrf = savedCsrf;
ws.close();
process.exit(0);
