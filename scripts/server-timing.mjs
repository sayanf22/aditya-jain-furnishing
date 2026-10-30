// Measures how long the local Worker (OpenNext on workerd, the same runtime
// Cloudflare uses) takes to answer each route. Runs after `npm run preview`
// is serving on port 8787.
//
// Local times include a few milliseconds of Wrangler's dev proxy, so compare
// each route against a file from /_next/static/ (served without running the
// Worker at all). A route that matches that baseline costs the Worker almost
// no work. The "cold" column shows one-time module loading in a fresh Worker.
// The real CPU figure comes from Workers Observability once the site runs on
// the client's Cloudflare account.
//
// Usage: node scripts/server-timing.mjs [base] [route ...]

const base = process.argv[2] ?? "http://localhost:8787";
const routes = process.argv.slice(3);
if (routes.length === 0) routes.push("/");

const RUNS = 40;

for (const route of routes) {
  const url = new URL(route, base).toString();
  // Warm up: the first request starts the Worker (cold start).
  const cold = performance.now();
  await (await fetch(url)).arrayBuffer();
  const coldMs = performance.now() - cold;

  const times = [];
  let status = 0;
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    const res = await fetch(url);
    await res.arrayBuffer();
    times.push(performance.now() - t);
    status = res.status;
  }
  times.sort((a, b) => a - b);
  const pick = (p) => times[Math.min(times.length - 1, Math.floor(p * times.length))].toFixed(1);
  console.log(
    `${route.padEnd(28)} status ${status}  cold ${coldMs.toFixed(0)} ms  median ${pick(0.5)} ms  p90 ${pick(0.9)} ms  max ${pick(1)} ms`,
  );
}
