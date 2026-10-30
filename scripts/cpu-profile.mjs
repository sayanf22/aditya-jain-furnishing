// Estimates the Worker's CPU time per request for each route, locally.
//
// It uses the same CPU profiler as DevTools ("press D" in wrangler dev):
// connect to the local Worker's inspector, record a CPU profile while
// sending requests, then add up the time the CPU was actually busy running
// Worker code (idle time and time spent waiting on D1/R2/network are not
// counted, the same rule Cloudflare uses for the 10 ms limit).
//
// Start the Worker first, with an inspector port:
//   npx opennextjs-cloudflare build
//   npx opennextjs-cloudflare populateCache local
//   npx wrangler dev --port 8787 --local --inspector-port 9230
// Then:
//   node scripts/cpu-profile.mjs [route ...]
//
// The numbers are an upper bound, not Cloudflare's figure: they come from
// this computer's CPU, include Wrangler's local-dev wrapper code that runs
// in the same Worker, and include the profiler's own overhead. Compare each
// route with /api/health, which does almost nothing, to see the extra work a
// route adds. The exact figure per request is shown in Workers Logs (CPU
// time) once the site runs on Cloudflare.

const BASE = process.env.BASE ?? "http://localhost:8787";
const INSPECTOR = process.env.INSPECTOR ?? "http://127.0.0.1:9230";
const RUNS = Number(process.env.RUNS ?? 30);
const routes = process.argv.slice(2);
if (routes.length === 0) routes.push("/");

const targets = await (await fetch(`${INSPECTOR}/json`)).json();
// Wrangler's inspector only accepts connections from its DevTools origin.
const ws = new WebSocket(targets[0].webSocketDebuggerUrl, {
  headers: { Origin: "https://devtools.devprod.cloudflare.dev" },
});
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let nextId = 1;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

// Busy CPU time in a profile: every sample except idle ones, weighted by the
// time since the previous sample.
const IDLE = new Set(["(idle)", "(program)"]);
function busyMs(profile) {
  const idleIds = new Set(
    profile.nodes.filter((n) => IDLE.has(n.callFrame.functionName)).map((n) => n.id),
  );
  let busyUs = 0;
  profile.samples.forEach((nodeId, i) => {
    if (!idleIds.has(nodeId)) busyUs += profile.timeDeltas[i] ?? 0;
  });
  return busyUs / 1000;
}

async function measure(url, runs) {
  await send("Profiler.start");
  for (let i = 0; i < runs; i++) {
    const res = await fetch(url);
    await res.arrayBuffer();
  }
  const { result } = await send("Profiler.stop");
  return { total: busyMs(result.profile), status: (await fetch(url)).status };
}

await send("Profiler.enable");
// Sampling every 200 microseconds; finer sampling has crashed workerd on
// Windows.
await send("Profiler.setSamplingInterval", { interval: 200 });

// Baseline: /api/health does almost no work, so its figure is the local
// overhead (dev wrapper + profiler) that every request carries here.
const baselineUrl = new URL("/api/health", BASE).toString();
await measure(baselineUrl, 3);
const baseline = (await measure(baselineUrl, RUNS)).total / RUNS;

console.log(`CPU time per request, local estimate (${RUNS} requests per route)`);
console.log(`  baseline /api/health: ${baseline.toFixed(2)} ms (local overhead on every request)`);
for (const route of routes) {
  const url = new URL(route, BASE).toString();
  // First request on its own: includes any one-time module loading.
  const first = await measure(url, 1);
  const warm = await measure(url, RUNS);
  const perReq = warm.total / RUNS;
  const extra = Math.max(0, perReq - baseline);
  const firstExtra = Math.max(0, first.total - baseline);
  console.log(
    `  ${route.padEnd(24)} status ${warm.status}  ` +
      `measured ${perReq.toFixed(2)} ms each, route's own work ~ ${extra.toFixed(2)} ms  ` +
      `| first request ~ ${firstExtra.toFixed(2)} ms${firstExtra > 10 ? "  (OVER 10 ms)" : ""}`,
  );
}

ws.close();
process.exit(0);
