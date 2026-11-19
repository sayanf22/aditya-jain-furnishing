// Enquiries inbox (ENQ_DB). The public form writes them (lib/enquiry.ts);
// the dashboard reads, marks read and deletes.
import type { Enquiry, Ok, Page } from "../admin-api";
import { audit } from "./audit";
import type { Ctx } from "./context";
import { bool, decodeCursor, encodeCursor, fail, idParam, iso, pageLimit, parse, readJson } from "./http";

type Row = {
  id: number; created_at: string; customer_type: "B2C" | "B2B"; name: string; company: string | null; phone: string;
  message: string | null; product_name: string | null; category_name: string | null; source: string | null; is_read: number;
};
const COLS = "id, created_at, customer_type, name, company, phone, message, product_name, category_name, source, is_read";

const toEnquiry = (r: Row): Enquiry => ({
  id: r.id, createdAt: iso(r.created_at), customerType: r.customer_type, name: r.name, company: r.company, phone: r.phone,
  message: r.message, productName: r.product_name, categoryName: r.category_name, source: r.source, isRead: r.is_read === 1,
});

export async function listEnquiries(c: Ctx): Promise<Page<Enquiry> & { unread: number }> {
  const limit = pageLimit(c.url);
  const filter = c.url.searchParams.get("filter") ?? "all";
  if (filter !== "all" && filter !== "unread") throw fail(400, "INVALID", "That filter is not valid.", "filter");
  const cursor = decodeCursor(c.url.searchParams.get("cursor"), 1);
  const [list, unread] = await c.env.ENQ_DB.batch([
    c.env.ENQ_DB
      .prepare(`SELECT ${COLS} FROM enquiries WHERE id < ?1 ${filter === "unread" ? "AND is_read = 0" : ""} ORDER BY id DESC LIMIT ?2`)
      .bind(cursor ? cursor[0] : Number.MAX_SAFE_INTEGER, limit + 1),
    c.env.ENQ_DB.prepare("SELECT COUNT(*) AS n FROM enquiries WHERE is_read = 0"),
  ]);
  const rows = (list.results as Row[]).slice(0, limit);
  return {
    items: rows.map(toEnquiry),
    nextCursor: list.results.length > limit ? encodeCursor([rows[rows.length - 1].id]) : null,
    unread: (unread.results[0] as { n: number }).n,
  };
}

export async function updateEnquiry(c: Ctx): Promise<Enquiry> {
  const id = idParam(c.params[0]);
  const body = parse(await readJson(c.request), { isRead: bool }, ["isRead"]);
  const res = await c.env.ENQ_DB.prepare("UPDATE enquiries SET is_read = ?2 WHERE id = ?1").bind(id, body.isRead ? 1 : 0).run();
  if (!res.meta.changes) throw fail(404, "NOT_FOUND", "That enquiry was not found.");
  audit(c, "enquiry.update", "enquiry", id, { isRead: body.isRead! });
  return toEnquiry((await c.env.ENQ_DB.prepare(`SELECT ${COLS} FROM enquiries WHERE id = ?1`).bind(id).first<Row>())!);
}

export async function deleteEnquiry(c: Ctx): Promise<Ok> {
  const id = idParam(c.params[0]);
  const res = await c.env.ENQ_DB.prepare("DELETE FROM enquiries WHERE id = ?1").bind(id).run();
  if (!res.meta.changes) throw fail(404, "NOT_FOUND", "That enquiry was not found.");
  audit(c, "enquiry.delete", "enquiry", id);
  return { ok: true };
}
