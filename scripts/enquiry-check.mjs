// Checks the enquiry API against the local Worker (port 8787).
// Each case uses its own fake visitor IP so the rate limit is tested apart.
import { execFileSync } from "node:child_process";
const base = process.argv[2] ?? "http://localhost:8787";
const d1 = (sql) => execFileSync("npx", ["wrangler", "d1", "execute", "ENQ_DB", "--local", "--json", "--command", `"${sql}"`], { encoding: "utf8", shell: true });
const count = (where = "1=1") => JSON.parse(d1(`SELECT COUNT(*) AS n FROM enquiries WHERE ${where}`))[0].results[0].n;
d1("DELETE FROM enquiries"); // a clean slate: the site-wide limits count every row
const results = [];
const ok = (name, pass, detail = "") => results.push(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);

async function post(body, { ip = "203.0.113.1", origin = base, contentType = "application/json" } = {}) {
  const res = await fetch(`${base}/api/enquiry`, {
    method: "POST",
    headers: { "Content-Type": contentType, Origin: origin, "CF-Connecting-IP": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const valid = { customerType: "B2C", name: "Test Customer", phone: "98765 43210", interest: "cushions", message: "Test enquiry from the local check script.", source: "check", elapsed: 6000 };

let r = await post(valid, { ip: "203.0.113.10" });
ok("valid B2C enquiry is saved", r.status === 201, `status ${r.status}`);

r = await post({ ...valid, customerType: "B2B", name: "Test Designer", phone: "+91 91234 56789", company: "Test Studio" }, { ip: "203.0.113.11" });
ok("valid B2B enquiry with firm is saved", r.status === 201, `status ${r.status}`);

r = await post({ ...valid, phone: "12345" }, { ip: "203.0.113.12" });
ok("bad phone is rejected", r.status === 422 && Boolean(r.body.fields?.phone), `status ${r.status}`);

r = await post({ ...valid, customerType: "X" }, { ip: "203.0.113.13" });
ok("bad customer type is rejected", r.status === 422 && Boolean(r.body.fields?.customerType), `status ${r.status}`);

r = await post({ ...valid, website: "http://spam.example" }, { ip: "203.0.113.14" });
ok("honeypot is accepted silently", r.status === 200, `status ${r.status}`);

r = await post(valid, { ip: "203.0.113.15", origin: "https://evil.example" });
ok("other-site post is refused", r.status === 403, `status ${r.status}`);

r = await post("name=x", { ip: "203.0.113.16", contentType: "application/x-www-form-urlencoded" });
ok("non-JSON body is refused", r.status === 415, `status ${r.status}`);

r = await post({ ...valid, message: "x".repeat(9000) }, { ip: "203.0.113.17" });
ok("oversized body is refused", r.status === 413, `status ${r.status}`);

// ---- abuse limits
const before = count();
r = await post({ ...valid, elapsed: 300 }, { ip: "203.0.113.20", });
ok("a send faster than a person can type is thanked but not stored", r.status === 200 && count() === before);
const { elapsed, ...noTiming } = valid;
r = await post(noTiming, { ip: "203.0.113.21" });
ok("a send with no timing is thanked but not stored", r.status === 200 && count() === before);
r = await post({ ...valid, elapsed: "5000" }, { ip: "203.0.113.22" });
ok("a timing that is not a number is refused", r.status === 400);
r = await post({ ...valid, extra: "x" }, { ip: "203.0.113.23" });
ok("an unknown field is refused", r.status === 400);

const dupe = { ...valid, phone: "98000 11111", message: "Please call about sofa fabric" };
r = await post(dupe, { ip: "203.0.113.30" });
const saved1 = count();
const again = await post(dupe, { ip: "203.0.113.31" });
ok("the same enquiry twice is stored once (second is thanked)", r.status === 201 && again.status === 200 && count() === saved1);

const hog = "203.0.113.40";
const hogStatuses = [];
for (let i = 0; i < 7; i++) {
  if (i === 5) await new Promise((resolve) => setTimeout(resolve, 62000)); // a new minute, so the hourly limit is what answers
  hogStatuses.push((await post({ ...valid, phone: `9800000${100 + i}`, message: `Enquiry number ${i}` }, { ip: hog })).status);
}
ok("one visitor can store 5 an hour, then gets 429", hogStatuses.slice(0, 5).every((s) => s === 201) && hogStatuses[5] === 429 && hogStatuses[6] === 429, hogStatuses.join(","));
r = await post({ ...valid, phone: "9800000999", message: "different visitor" }, { ip: "203.0.113.41" });
ok("another visitor is not affected", r.status === 201);

d1("UPDATE enquiries SET created_at = datetime('now', '-30 minutes') WHERE ip_hash IS NOT NULL");
const fill = 60 - count("created_at > datetime('now', '-1 hour')");
d1(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${Math.max(fill, 0)}) INSERT INTO enquiries (customer_type, name, phone, message) SELECT 'B2C', 'Filler', '+919800000000', 'filler' FROM n`);
r = await post({ ...valid, phone: "9811111111", message: "site is full" }, { ip: "203.0.113.50" });
ok("the whole site stops at 60 an hour (429 + Retry-After later)", r.status === 429, `status ${r.status}`);
d1("DELETE FROM enquiries");

const statuses = [];
for (let i = 0; i < 7; i++) statuses.push((await post({ ...valid, phone: "1" }, { ip: "203.0.113.99" })).status);
ok("burst rate limit kicks in after 5 a minute", statuses.includes(429), statuses.join(","));

r = await fetch(`${base}/api/enquiry`);
ok("GET is not allowed", r.status === 405, `status ${r.status}`);

console.log(results.join("\n"));
process.exit(results.some((x) => x.startsWith("FAIL")) ? 1 : 0);
