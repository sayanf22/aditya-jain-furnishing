-- Migration number: 0001 	 2026-11-20
-- Enquiry form submissions, database ENQ_DB. Private: names and phone numbers.
-- The product and category names are copied in when the enquiry arrives, so
-- the list still reads well after a product is renamed or deleted.

CREATE TABLE enquiries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  customer_type  TEXT NOT NULL CHECK (customer_type IN ('B2C', 'B2B')),
  name           TEXT NOT NULL,
  company        TEXT,
  phone          TEXT NOT NULL,
  message        TEXT,
  product_id     INTEGER,
  product_name   TEXT,
  category_id    INTEGER,
  category_name  TEXT,
  source         TEXT,
  is_read        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_enquiries_created ON enquiries(created_at DESC);
CREATE INDEX idx_enquiries_unread ON enquiries(is_read, created_at DESC);
