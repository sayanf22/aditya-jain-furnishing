// Checks the enquiry API against the local Worker (port 8787).
// Each case uses its own fake visitor IP so the rate limit is tested apart.
const base = process.argv[2] ?? "http://localhost:8787";
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

const valid = { customerType: "B2C", name: "Test Customer", phone: "98765 43210", interest: "cushions", message: "Test enquiry from the local check script.", source: "check" };

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

const statuses = [];
for (let i = 0; i < 7; i++) statuses.push((await post({ ...valid, phone: "1" }, { ip: "203.0.113.99" })).status);
ok("rate limit kicks in after 5 a minute", statuses.includes(429), statuses.join(","));

r = await fetch(`${base}/api/enquiry`);
ok("GET is not allowed", r.status === 405, `status ${r.status}`);

console.log(results.join("\n"));
process.exit(results.some((x) => x.startsWith("FAIL")) ? 1 : 0);
