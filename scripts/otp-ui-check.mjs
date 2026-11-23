// Browser check of the emailed sign-in code on the sign-in screen, desktop and phone.
//   WRANGLER_EXTRA="--var LOGIN_OTP:required" node worker/dev/start.mjs
//   node scripts/otp-ui-check.mjs [outDir]
// Needs the production build served by the local Worker. Mail goes to the local stub. Local only.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { startStub } from "../worker/dev/email-stub.mjs";

const { chromium } = createRequire(import.meta.url)("@playwright/test");
const BASE = process.env.BASE ?? "http://localhost:8787";
const out = process.argv[2] ?? ".";
const EMAIL = "owner@example.com";
const PASS = "correct horse battery 1";
const vars = Object.fromEntries(readFileSync(".dev.vars", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const results = [];
const ok = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail && !pass ? `  -> ${detail}` : ""}`);
};
const d1 = (sql) => execFileSync("npx", ["wrangler", "d1", "execute", "AUTH_DB", "--local", "--command", `"${sql}"`], { stdio: ["ignore", "ignore", "inherit"], shell: true });
const stub = await startStub();
const lastCode = async () => {
  const r = await fetch(`http://127.0.0.1:8799/last?to=${encodeURIComponent(EMAIL)}`);
  return r.ok ? (await r.json()).text.match(/\b(\d{6})\b/)?.[1] : undefined;
};
const resetAll = async () => {
  d1("DELETE FROM sessions; DELETE FROM login_attempts; DELETE FROM login_challenges; DELETE FROM email_code_requests; DELETE FROM email_codes; DELETE FROM admin_users");
  await fetch("http://127.0.0.1:8799/emails", { method: "DELETE" });
};

try {
  // Create the owner through the API (setup code is its own factor).
  await resetAll();
  const setup = await fetch(`${BASE}/api/admin/auth/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE, "Sec-Fetch-Site": "same-origin", "CF-Connecting-IP": "10.9.9.9" },
    body: JSON.stringify({ setupCode: vars.SETUP_CODE, email: EMAIL, name: "Owner", password: PASS }),
  });
  ok("owner created for the check", setup.ok, await setup.text());

  const browser = await chromium.launch();
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    d1("DELETE FROM sessions; DELETE FROM login_attempts; DELETE FROM login_challenges");
    const ctx = await browser.newContext({ viewport, ...(label === "phone" ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
    await ctx.setExtraHTTPHeaders({ "CF-Connecting-IP": `10.8.${label === "phone" ? 1 : 2}.1` });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[autocomplete="current-password"]', PASS);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByText("Check your email").first().waitFor({ timeout: 10000 });
    const hint = await page.locator(".a-form").innerText();
    ok(`${label}: the code step shows, with a masked address`, /o\*\*\*@example\.com/.test(hint) && !hint.includes(EMAIL), hint.replace(/\s+/g, " ").slice(0, 160));
    ok(`${label}: the password field is gone`, (await page.locator('input[autocomplete="current-password"]').count()) === 0);
    const fs = await page.locator('input[autocomplete="one-time-code"]').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    ok(`${label}: the code box is 16 px or larger and numeric`, fs >= 16 && (await page.locator('input[inputmode="numeric"]').count()) === 1, String(fs));
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(`${label}: no sideways scroll`, over <= 0, `${over}px`);
    const resend = page.getByRole("button", { name: /Send a new code in \d+s/ });
    ok(`${label}: re-send is waiting 30 seconds`, await resend.isDisabled());
    await page.screenshot({ path: `${out}/otp-${label}-1-code.png` });

    await page.fill('input[autocomplete="one-time-code"]', "000000");
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await page.getByText(/not right or has expired/).waitFor({ timeout: 8000 });
    ok(`${label}: a wrong code shows a plain error beside the field`, true);
    await page.screenshot({ path: `${out}/otp-${label}-2-wrong.png` });

    await page.fill('input[autocomplete="one-time-code"]', (await lastCode()) ?? "");
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await page.waitForURL(/\/admin\/?$/, { timeout: 12000 });
    await page.waitForTimeout(800);
    ok(`${label}: the right code opens the dashboard`, /\/admin\/?$/.test(page.url()), page.url());
    await page.screenshot({ path: `${out}/otp-${label}-3-in.png` });
    ok(`${label}: no script errors`, errs.length === 0, errs.join(" | "));

    // Back goes to the password step and forgets the challenge.
    await ctx.clearCookies();
    d1("DELETE FROM sessions; DELETE FROM login_attempts");
    await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[autocomplete="current-password"]', PASS);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByText("Check your email").first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Back" }).click();
    ok(`${label}: Back returns to the password step`, (await page.locator('input[autocomplete="current-password"]').count()) === 1);
    await ctx.close();
  }
  await browser.close();
} finally {
  stub.close();
}
console.log(`\n${results.filter(Boolean).length} of ${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
