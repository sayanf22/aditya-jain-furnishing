// Audit log (AUDIT_DB). Every sign-in try and every change is recorded:
// who, what, which item, and a short note. Never pass passwords, tokens,
// cookies or secrets in `detail`.
import type { AuditEntry, Page } from "../admin-api";
import type { Ctx } from "./context";
import { pseudonym } from "./crypto";
import { decodeCursor, encodeCursor, iso, pageLimit } from "./http";

// Failed sign-ins come from strangers, so they have their own small budget and can't push real history out.
const KEEP_ROWS = 20000;
const KEEP_FAILED_ROWS = 1000;
const FAILED = ["login_failed", "setup_failed", "password_failed"];

type Who = { userId: number | null; email: string | null };

export function audit(c: Ctx, action: string, entity?: string, entityId?: string | number, detail?: Record<string, unknown> | string, who?: Who): void {
  const user: Who = who ?? { userId: c.session?.userId ?? null, email: c.session?.email ?? null };
  const note = detail === undefined ? null : (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300);
  c.exec.waitUntil(
    (async () => {
      const ipHash = await pseudonym(c.pepper, "ip", c.ip);
      const failed = FAILED.includes(action);
      await c.env.AUDIT_DB.batch([
        c.env.AUDIT_DB
          .prepare("INSERT INTO audit_log (user_id, user_email, action, entity, entity_id, detail, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
          .bind(user.userId, user.email, action, entity ?? null, entityId === undefined ? null : String(entityId), note, ipHash),
        // Keep the newest rows only (primary-key range delete, cheap); failed sign-ins are trimmed on their own.
        failed
          ? c.env.AUDIT_DB.prepare("DELETE FROM audit_log WHERE action IN ('login_failed', 'setup_failed', 'password_failed') AND id NOT IN (SELECT id FROM audit_log WHERE action IN ('login_failed', 'setup_failed', 'password_failed') ORDER BY id DESC LIMIT ?1)").bind(KEEP_FAILED_ROWS)
          : c.env.AUDIT_DB.prepare("DELETE FROM audit_log WHERE id < (SELECT MAX(id) FROM audit_log) - ?1").bind(KEEP_ROWS),
      ]);
    })().catch((e) => console.error("audit write failed", e instanceof Error ? e.message : "unknown")),
  );
}

type Row = { id: number; at: string; user_email: string | null; action: string; entity: string | null; entity_id: string | null; detail: string | null };

export async function listAudit(c: Ctx): Promise<Page<AuditEntry>> {
  const limit = pageLimit(c.url);
  const cursor = decodeCursor(c.url.searchParams.get("cursor"), 1);
  const { results } = await c.env.AUDIT_DB
    .prepare("SELECT id, at, user_email, action, entity, entity_id, detail FROM audit_log WHERE id < ?1 ORDER BY id DESC LIMIT ?2")
    .bind(cursor ? cursor[0] : Number.MAX_SAFE_INTEGER, limit + 1)
    .all<Row>();
  const rows = results.slice(0, limit);
  return {
    items: rows.map((r) => ({ id: r.id, at: iso(r.at), userEmail: r.user_email, action: r.action, entity: r.entity, entityId: r.entity_id, detail: r.detail })),
    nextCursor: results.length > limit ? encodeCursor([rows[rows.length - 1].id]) : null,
  };
}
