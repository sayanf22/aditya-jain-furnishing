-- Initial schema for the Aditya Jain home furnishing website.
-- Ordering columns use "position" (lower shows first).

CREATE TABLE categories (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  tagline     TEXT,
  image_key   TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A subcategory belongs to a category. parent_id lets a subcategory sit
-- inside a group (for example "Velvet" inside "Curtains").
CREATE TABLE subcategories (
  id           INTEGER PRIMARY KEY,
  category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  parent_id    INTEGER REFERENCES subcategories(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  image_key    TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  visible      INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (category_id, slug)
);
CREATE INDEX idx_subcategories_category ON subcategories(category_id, position);

-- A product sits in a subcategory, or directly in a category that has a
-- single collection (Cushions, Wallpaper).
CREATE TABLE products (
  id              INTEGER PRIMARY KEY,
  category_id     INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  subcategory_id  INTEGER REFERENCES subcategories(id) ON DELETE SET NULL,
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  position        INTEGER NOT NULL DEFAULT 0,
  visible         INTEGER NOT NULL DEFAULT 1,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (category_id, slug)
);
CREATE INDEX idx_products_category ON products(category_id, position);
CREATE INDEX idx_products_subcategory ON products(subcategory_id, position);

CREATE TABLE product_images (
  id          INTEGER PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_key   TEXT NOT NULL,
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  alt         TEXT,
  position    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_product_images_product ON product_images(product_id, position);

-- Interactive décor: a scene (for example, a sofa) with texture options.
-- Each option has a swatch and a ready image uploaded by the admin.
CREATE TABLE decor_scenes (
  id                 INTEGER PRIMARY KEY,
  name               TEXT NOT NULL,
  default_image_key  TEXT,
  position           INTEGER NOT NULL DEFAULT 0,
  visible            INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE decor_options (
  id                INTEGER PRIMARY KEY,
  scene_id          INTEGER NOT NULL REFERENCES decor_scenes(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('curtain', 'fabric', 'texture')),
  name              TEXT NOT NULL,
  swatch_image_key  TEXT NOT NULL,
  result_image_key  TEXT NOT NULL,
  width             INTEGER NOT NULL,
  height            INTEGER NOT NULL,
  product_id        INTEGER REFERENCES products(id) ON DELETE SET NULL,
  position          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_decor_options_scene ON decor_options(scene_id, position);

CREATE TABLE watch_items (
  id                INTEGER PRIMARY KEY,
  title             TEXT NOT NULL,
  video_key         TEXT NOT NULL,
  poster_image_key  TEXT NOT NULL,
  product_id        INTEGER REFERENCES products(id) ON DELETE SET NULL,
  position          INTEGER NOT NULL DEFAULT 0,
  visible           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE testimonials (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  text      TEXT NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0,
  visible   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE enquiries (
  id             INTEGER PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  customer_type  TEXT NOT NULL CHECK (customer_type IN ('B2C', 'B2B')),
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  message        TEXT,
  product_id     INTEGER REFERENCES products(id) ON DELETE SET NULL,
  category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  is_read        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_enquiries_created ON enquiries(created_at DESC);

-- Key/value settings: WhatsApp number, Instagram handle, phone, address,
-- hero images. Values are filled in from the admin dashboard.
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
