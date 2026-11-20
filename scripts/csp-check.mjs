// Loads the public pages and records any Content-Security-Policy violation (all three engines).
//   node scripts/csp-check.mjs [base]   default https://localhost:8787 (LOCAL_HTTPS=1 Worker)
import * as pw from "@playwright/test";
const BASE = process.argv[2] ?? "https://localhost:8787";
const PAGES = ["/", "/collection", "/collection/curtains-blinds/curtains", "/collection/wallpaper", "/about", "/contact"];
let bad = 0;
for (const engine of ["chromium", "firefox", "webkit"]) {
  const browser = await pw[engine].launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: /^https:\/\/localhost[:/]/.test(BASE) });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || "inline"}`));
  });
  const page = await ctx.newPage();
  for (const path of PAGES) {
    // Twice: the second load is answered from the browser cache (304), which must keep the page's own policy.
    for (const round of [1, 2]) {
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      const seen = await page.evaluate(() => window.__csp);
      const hydrated = await page.evaluate(() => document.documentElement.classList.contains("js"));
      const ok = seen.length === 0 && hydrated;
      if (!ok) bad++;
      console.log(`${ok ? "PASS" : "FAIL"}  [${engine}] ${path} (load ${round})${ok ? "" : ` ${JSON.stringify(seen)} js=${hydrated}`}`);
    }
  }
  await browser.close();
}
console.log(bad ? `${bad} failed` : "all passed");
process.exit(bad ? 1 : 0);