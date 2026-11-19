-- Migration number: 0001 	 2026-11-20
-- Who changed what, database AUDIT_DB. Written by the dashboard API for every
-- sign-in, failed sign-in, upload, edit, delete and publish. Rows are never
-- edited; the API trims the table to the newest 5,000 rows.

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  user_id     INTEGER,
  user_email  TEXT,
  action      TEXT NOT NULL,                  -- 'login', 'login_failed', 'product.update', ...
  entity      TEXT,                           -- 'product', 'category', 'media', ...
  entity_id   TEXT,
  detail      TEXT,                           -- short JSON: what changed
  ip_hash     TEXT
);
CREATE INDEX idx_audit_at ON audit_log(at DESC);
CREATE INDEX idx_audit_action ON audit_log(action, at DESC);
