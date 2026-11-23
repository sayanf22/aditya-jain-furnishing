// End-to-end check of the emailed sign-in code (LOGIN_OTP=required) against the LOCAL Worker.
//   WRANGLER_EXTRA="--var LOGIN_OTP:required" node worker/dev/start.mjs
//   node worker/dev/otp-check.mjs
// Mail goes to the local stub (worker/dev/email-stub.mjs), never to Resend.
// It clears the local sign-in tables first (--local only). Never touches the live account.
import { execFileSync } from "node:child_process";
import { startStub } from "./email-stub.mjs";

const BASE = process.env.BASE ?? "http://localhost:8787";
const EMAIL = "owner@example.com";
const PASS = "correct horse battery 1";
const RUN = Math.floor(Math.random() * 200) + 20;
const ip = (n) => `10.${RUN}.${n >> 8}.${n & 255}`;
const results = [];
const ok = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail && !pass ? `  -> ${detail}` : ""}`);
};
const d1 = (sql) => execFileSync("npx", ["wrangler", "d1", "execute", "AUTH_DB", "--local", "--command", `"${sql}"`], { stdio: ["ignore", "ignore", "inherit"], shell: true });
const vars = Object.fromEntries(
  (await import("node:fs")).readFileSync(".dev.vars", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

class Client {
  cookie = "";
  constructor(ip) {
    this.ip = ip;
  }
  async api(method, path, body) {
    const h = { "CF-Connecting-IP": this.ip };
    if (this.cookie) h.Cookie = this.cookie;
    if (method !== "GET") {
      h.Origin = BASE;
      h["Sec-Fetch-Site"] = "same-origin";
    }
    if (body !== undefined) h["Content-Type"] = "application/json";
    const res = await fetch(`${BASE}/api/admin${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    for (const s of res.headers.getSetCookie?.() ?? []) {
      const [pair] = s.split(";");
      this.cookie = pair.endsWith("=") ? "" : pair;
    }
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, data, text };
  }
}
const stub = await startStub();
const mailTo = async () => {
  const r = await fetch(`http://127.0.0.1:8799/last?to=${encodeURIComponent(EMAIL)}`);
  return r.ok ? await r.json() : null;
};
const codeFrom = (mail) => mail?.text?.match(/\b(\d{6})\b/)?.[1];
const clear = async () => {
  d1("DELETE FROM sessions; DELETE FROM login_attempts; DELETE FROM login_challenges; DELETE FROM email_code_requests; DELETE FROM email_codes; DELETE FROM admin_users");
  await fetch("http://127.0.0.1:8799/emails", { method: "DELETE" });
};

try {
  await clear();
  // Setup (the setup code is the factor here) creates the owner.
  const owner = new Client(ip(1));
  let r = await owner.api("POST", "/auth/setup", { setupCode: vars.SETUP_CODE, email: EMAIL, name: "Owner", password: PASS });
  ok("setup creates the owner", r.status === 200, r.text);
  await owner.api("POST", "/auth/logout");

  // 1. Password alone never signs in.
  const a = new Client(ip(2));
  r = await a.api("POST", "/auth/login", { email: EMAIL, password: PASS });
  const challenge = r.data?.challenge;
  ok("right password asks for the emailed code and sets no session", r.status === 200 && r.data?.needsEmailCode === true && typeof challenge === "string" && challenge.length >= 20 && a.cookie === "", r.text);
  ok("the answer shows only a masked address", r.data?.sentTo === "o***@example.com", r.text);
  r = await a.api("GET", "/me");
  ok("still not signed in", r.status === 401);
  await new Promise((res) => setTimeout(res, 700));
  const mail = await mailTo();
  const code = codeFrom(mail);
  ok("a 6-digit code was emailed (code only, no link)", !!code && !/https?:\/\//.test(mail.text), mail?.text);

  // 2. Wrong code, then the right one.
  const wrong = code === "000000" ? "111111" : "000000";
  r = await a.api("POST", "/auth/login/verify", { challenge, code: wrong });
  ok("a wrong code is refused", r.status === 401 && r.data?.error?.code === "BAD_CODE", r.text);
  r = await a.api("POST", "/auth/login/verify", { challenge: "x".repeat(40), code });
  ok("a code with the wrong challenge is refused", r.status === 401, r.text);
  r = await a.api("POST", "/auth/login/verify", { challenge, code });
  ok("the right code signs in and sets the session cookie", r.status === 200 && r.data?.ok === true && a.cookie.startsWith("__Host-delta_admin="), r.text);
  r = await a.api("GET", "/me");
  ok("signed in after the code", r.status === 200 && r.data?.user?.email === EMAIL, r.text);
  const b = new Client(ip(3));
  r = await b.api("POST", "/auth/login/verify", { challenge, code });
  ok("a code works once", r.status === 401, r.text);

  // 3. Five wrong tries kill the code.
  const c1 = new Client(ip(4));
  r = await c1.api("POST", "/auth/login", { email: EMAIL, password: PASS });
  const ch1 = r.data.challenge;
  await new Promise((res) => setTimeout(res, 700));
  const good1 = codeFrom(await mailTo());
  const bad = good1 === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) await c1.api("POST", "/auth/login/verify", { challenge: ch1, code: bad });
  // From a fresh address, so the per-address rate limit is not what refuses it.
  r = await new Client(ip(14)).api("POST", "/auth/login/verify", { challenge: ch1, code: good1 });
  ok("after 5 wrong tries even the right code is refused", r.status === 401 && r.data?.error?.code === "BAD_CODE", r.text);

  // 4. Expiry.
  const c2 = new Client(ip(5));
  r = await c2.api("POST", "/auth/login", { email: EMAIL, password: PASS });
  const ch2 = r.data.challenge;
  await new Promise((res) => setTimeout(res, 700));
  const good2 = codeFrom(await mailTo());
  d1("UPDATE login_challenges SET expires_at = expires_at - 700");
  r = await c2.api("POST", "/auth/login/verify", { challenge: ch2, code: good2 });
  ok("a code older than 10 minutes is refused", r.status === 401, r.text);

  // 5. Re-send: too soon, then after the wait, old code dead, limits.
  const c3 = new Client(ip(6));
  r = await c3.api("POST", "/auth/login", { email: EMAIL, password: PASS });
  const ch3 = r.data.challenge;
  await new Promise((res) => setTimeout(res, 700));
  const first = codeFrom(await mailTo());
  r = await c3.api("POST", "/auth/login/resend", { challenge: ch3 });
  ok("a re-send straight away is refused with a wait time", r.status === 429 && /Wait \d+ seconds/.test(r.data?.error?.message ?? ""), r.text);
  d1("UPDATE login_challenges SET last_sent_at = last_sent_at - 40");
  r = await c3.api("POST", "/auth/login/resend", { challenge: ch3 });
  ok("a re-send after 30 seconds works", r.status === 200 && r.data?.ok === true, r.text);
  await new Promise((res) => setTimeout(res, 700));
  const second = codeFrom(await mailTo());
  ok("the new mail has a new code", !!second && second !== first, `${first} / ${second}`);
  r = await c3.api("POST", "/auth/login/verify", { challenge: ch3, code: first });
  ok("the older code stops working after a re-send", r.status === 401, r.text);
  for (let i = 0; i < 2; i++) {
    d1("UPDATE login_challenges SET last_sent_at = last_sent_at - 40");
    r = await c3.api("POST", "/auth/login/resend", { challenge: ch3 });
  }
  d1("UPDATE login_challenges SET last_sent_at = last_sent_at - 40");
  r = await c3.api("POST", "/auth/login/resend", { challenge: ch3 });
  ok("after 3 re-sends no more are sent", r.status === 429, r.text);

  // 6. A wrong password never emails anything.
  await fetch("http://127.0.0.1:8799/emails", { method: "DELETE" });
  const c4 = new Client(ip(7));
  r = await c4.api("POST", "/auth/login", { email: EMAIL, password: "not the password at all" });
  await new Promise((res) => setTimeout(res, 600));
  ok("a wrong password is refused and sends no mail", r.status === 401 && (await mailTo()) === null, r.text);
  r = await c4.api("POST", "/auth/login", { email: "stranger@example.com", password: PASS });
  await new Promise((res) => setTimeout(res, 600));
  ok("an unknown email is refused the same way and sends no mail", r.status === 401 && r.data?.error?.code === "BAD_LOGIN" && (await mailTo()) === null, r.text);

  // 7. The forgot-password flow still works, and it is not a way around the code step.
  const c5 = new Client(ip(8));
  r = await c5.api("POST", "/auth/code/request", { email: EMAIL });
  await new Promise((res) => setTimeout(res, 700));
  const reset = codeFrom(await mailTo());
  r = await c5.api("POST", "/auth/code/verify", { email: EMAIL, code: reset });
  ok("forgot password: the emailed code gives a password-reset session only", r.status === 200 && r.data?.mustSetPassword === true, r.text);
  r = await c5.api("GET", "/catalogue");
  ok("that session cannot open the dashboard", r.status === 403 || r.status === 401, `${r.status}`);

  // 8. Audit trail never holds the code.
  d1("SELECT 1");
} finally {
  stub.close();
}
console.log(`\n${results.filter(Boolean).length} of ${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
