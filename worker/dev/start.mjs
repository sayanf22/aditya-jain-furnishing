// Starts the local Worker (wrangler dev) in the background and returns.
//   node worker/dev/start.mjs        start, or reuse the one already running
//   node worker/dev/start.mjs stop   stop it
// Output goes to .wrangler/dev.log. Local only: never uses --remote.
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, openSync, writeFileSync, readFileSync, existsSync } from "node:fs";

const PORT = 8787;
const INSPECTOR = 9230;
const PID_FILE = ".wrangler/dev.pid";

async function up() {
  try {
    return (await fetch(`http://localhost:${PORT}/api/health`)).ok;
  } catch {
    return false;
  }
}

if (process.argv[2] === "stop") {
  if (existsSync(PID_FILE)) {
    const pid = readFileSync(PID_FILE, "utf8").trim();
    try {
      execFileSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore" });
    } catch {
      /* already gone */
    }
  }
  console.log("stopped");
  process.exit(0);
}

if (await up()) {
  console.log(`already running on http://localhost:${PORT}`);
  process.exit(0);
}

mkdirSync(".wrangler", { recursive: true });
const log = openSync(".wrangler/dev.log", "w");
// WRANGLER_EXTRA adds local-only options, e.g. "--var DEPLOY_HOOK_URL:http://127.0.0.1:9911/hook".
const extra = (process.env.WRANGLER_EXTRA ?? "").split(/\s+/).filter(Boolean);
// Email codes go to the local stub (worker/dev/email-stub.mjs), never to Resend; the Worker honours this only in development.
if (!extra.some((x) => x.startsWith("DEV_EMAIL_STUB"))) extra.push("--var", "NEXTJS_ENV:development", "--var", "DEV_EMAIL_STUB:http://127.0.0.1:8799");
const child = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--local", "--inspector-port", String(INSPECTOR), ...extra], {
  detached: true,
  stdio: ["ignore", log, log],
  shell: true,
  windowsHide: true,
});
writeFileSync(PID_FILE, String(child.pid));
child.unref();

for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (await up()) {
    console.log(`running on http://localhost:${PORT} (log: .wrangler/dev.log)`);
    process.exit(0);
  }
}
console.log("not up after 60 s; see .wrangler/dev.log");
process.exit(1);
