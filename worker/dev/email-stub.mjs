// Local stand-in for the email provider, development only.
//   node worker/dev/email-stub.mjs      listens on 127.0.0.1:8799
// The Worker posts here instead of api.resend.com when NEXTJS_ENV=development and
// DEV_EMAIL_STUB=http://127.0.0.1:8799 (worker/dev/start.mjs sets both). Mail is kept in memory:
//   GET /last?to=<address>   -> the newest mail to that address, or 404
//   DELETE /emails           -> forget everything
import { createServer } from "node:http";

export const STUB_PORT = 8799;
const mails = [];

export function startStub(port = STUB_PORT) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const reply = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "POST" && url.pathname === "/emails") {
      let raw = "";
      req.on("data", (d) => (raw += d));
      req.on("end", () => {
        try {
          const m = JSON.parse(raw);
          mails.push({ ...m, at: Date.now(), key: req.headers["idempotency-key"] ?? null });
          reply(200, { id: `stub-${mails.length}` });
        } catch {
          reply(400, { message: "bad json" });
        }
      });
    } else if (req.method === "GET" && url.pathname === "/last") {
      const to = url.searchParams.get("to");
      const found = [...mails].reverse().find((m) => !to || (m.to ?? []).includes(to));
      if (found) reply(200, found);
      else reply(404, { message: "none" });
    } else if (req.method === "GET" && url.pathname === "/count") {
      reply(200, { n: mails.length });
    } else if (req.method === "DELETE" && url.pathname === "/emails") {
      mails.length = 0;
      reply(200, { ok: true });
    } else reply(404, { message: "not found" });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("email-stub.mjs")) {
  await startStub();
  console.log(`email stub on http://127.0.0.1:${STUB_PORT}`);
}
