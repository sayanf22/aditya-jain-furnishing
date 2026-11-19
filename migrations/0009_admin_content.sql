-- Migration number: 0009 	 2026-11-20
-- Admin dashboard, content database (DB).
--   media          the image library: one row per uploaded photo. Each photo is
--                  stored in R2 as m/<hash>-<width>.webp for several widths.
--   site_images    named places on the site that show a photo (Home hero, About
--                  photos, ...). media_key NULL = use the built-in stand-in.
--   content_state  one row. "version" goes up by one with every dashboard
--                  change; the last build stamps the version it was made from,
--                  so the dashboard can say "N changes not published yet".
--   categories.visible  lets the dashboard hide a whole collection.
-- Enquiries move to their own database (ENQ_DB, migrations-enquiries/): the
-- content database is read to build the public site and holds nothing private.
-- The old table was empty everywhere when this ran.

ALTER TABLE categories ADD COLUMN visible INTEGER NOT NULL DEFAULT 1;

CREATE TABLE media (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL UNIQUE,          -- 'm/<hash>'; files are m/<hash>-<w>.webp
  widths      TEXT NOT NULL,                 -- '480,800,1200'
  width       INTEGER NOT NULL,              -- pixels of the largest file
  height      INTEGER NOT NULL,
  bytes       INTEGER NOT NULL,              -- all files together
  label       TEXT,                          -- name shown in the library
  alt         TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE site_images (
  slot        TEXT PRIMARY KEY,
  media_key   TEXT,
  alt         TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE content_state (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  version            INTEGER NOT NULL DEFAULT 1,
  requested_version  INTEGER,
  requested_at       TEXT,
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO content_state (id, version) VALUES (1, 1);

DROP TABLE IF EXISTS enquiries;
