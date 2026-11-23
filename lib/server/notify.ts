// Emails the people ticked in the dashboard (Security -> Enquiry emails) when someone sends the
// enquiry form, so a new enquiry is not missed. The visitor is never emailed. Runs after the visitor has their answer (waitUntil): the form never waits for it.
// Everything typed by the visitor is escaped in the HTML part, and the plain-text part is text.
// At most 20 notifications an hour (Resend's free plan: 100 mails a day), counted from the
// enquiries themselves; enquiries are still saved and shown in the dashboard past that.
import { emailAvailable, sendEmail } from "./email";
import type { AdminEnv } from "./env";

type NotifyEnv = Pick<AdminEnv, "ENQ_DB" | "RESEND_API_KEY" | "RESEND_FROM" | "NEXTJS_ENV" | "DEV_EMAIL_STUB"> & { AUTH_DB?: D1Database };

type Saved = {
  id: number;
  customerType: "B2C" | "B2B";
  name: string;
  phone: string;
  company: string | null;
  message: string | null;
  categoryName: string | null;
  source: string | null;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
// A header-safe, single-line version for the subject.
const oneLine = (s: string, max = 60) => s.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);

export async function notifyEnquiry(env: NotifyEnv, siteOrigin: string, e: Saved): Promise<void> {
  try {
    if (!emailAvailable(env) || !env.AUTH_DB) return;
    const recent = await env.ENQ_DB.prepare("SELECT COUNT(*) AS n FROM enquiries WHERE created_at > datetime('now', '-1 hour')").first<{ n: number }>();
    if ((recent?.n ?? 0) > 20) return;
    const { results } = await env.AUTH_DB.prepare("SELECT email FROM admin_users WHERE disabled = 0 AND notify_enquiries = 1 ORDER BY id").all<{ email: string }>();
    if (results.length === 0) return;
    const who = e.customerType === "B2B" ? "Business" : "Customer";
    const lines: [string, string][] = [
      ["From", `${e.name} (${who})`],
      ...(e.company ? ([["Firm", e.company]] as [string, string][]) : []),
      ["Phone", e.phone],
      ...(e.categoryName ? ([["Interested in", e.categoryName]] as [string, string][]) : []),
      ...(e.message ? ([["Message", e.message]] as [string, string][]) : []),
    ];
    const text = `New enquiry on the Delta Furnishings website.\n\n${lines.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nOpen it in the dashboard: ${siteOrigin}/admin/enquiries`;
    const html =
      `<div style="font-family:Arial,sans-serif;color:#1c1c1c;max-width:480px"><p style="margin:0 0 14px;font-weight:600">New enquiry on the website</p>` +
      lines.map(([k, v]) => `<p style="margin:0 0 8px"><span style="color:#777">${esc(k)}:</span> ${esc(v).replace(/\n/g, "<br>")}</p>`).join("") +
      `<p style="margin:16px 0 0"><a href="${esc(siteOrigin)}/admin/enquiries" style="color:#c40000">Open it in the dashboard</a></p></div>`;
    // One mail per person, so nobody sees the other addresses. Failures (for example an address
    // Resend may not deliver to yet) are ignored: the enquiry is saved and shown in the dashboard.
    await Promise.all(
      results.map((r) =>
        sendEmail(env, { to: r.email, subject: `New enquiry from ${oneLine(e.name)}`, text, html, idempotencyKey: `enquiry-${e.id}-${r.email}` }),
      ),
    );
  } catch (err) {
    console.error("enquiry notice failed", err instanceof Error ? err.name : "unknown");
  }
}
