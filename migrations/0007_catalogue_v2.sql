-- Catalogue structure v2, from the client's category list (13 Nov 2026).
-- It replaces the structure in 0002_seed_catalogue.sql:
--   Upholstery Fabric -> Upholstery: Fabrics (Suede, Velvet, Boucle,
--     Jacquard, Jute, Prints, Tweed) and Leatherite (was Leather)
--   Curtains & Blinds: Curtains -> Main (Linen, Jacquard, Boucle, Velvet,
--     Polyester), Blackouts and Dimouts (100% Blackout, 80% Blackout),
--     Sheer (Linen, Embroidery, Tissue, Organza), Prints, Trims;
--     Blinds -> Roller, Roman, Zebra, Wooden Blinds, Prints
--   Carpets & Mats: Carpets, Mats ("Direct collections" is the category page)
--   Wallpaper -> Wallpapers, and listed before Cushions
--
-- Subcategories now nest to any depth (parent_id), and a slug only has to
-- be unique among its siblings, since "Linen" and "Prints" appear more than
-- once inside Curtains & Blinds. The old UNIQUE (category_id, slug) can't
-- be dropped in place, so subcategories, products and product_images are
-- rebuilt. They were empty everywhere apart from the structure itself
-- (no products had been added), so nothing else is lost.
DROP TABLE IF EXISTS product_images;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS subcategories;

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
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_subcategories_slug ON subcategories(category_id, IFNULL(parent_id, 0), slug);
CREATE INDEX idx_subcategories_parent ON subcategories(category_id, parent_id, position);

-- A product sits in the deepest subcategory it belongs to, or directly in
-- a category that is a single collection (Wallpapers, Cushions).
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

-- A wide photo for the top of each category page. image_key stays the
-- tall photo used on the Home page category cards.
ALTER TABLE categories ADD COLUMN hero_image_key TEXT;

UPDATE categories SET name = 'Upholstery', position = 1 WHERE id = 1;
UPDATE categories SET position = 2 WHERE id = 2;
UPDATE categories SET position = 3 WHERE id = 3;
UPDATE categories SET name = 'Wallpapers', position = 4 WHERE id = 5;
UPDATE categories SET position = 5 WHERE id = 4;

-- 1 · Upholstery
INSERT INTO subcategories (id, category_id, parent_id, slug, name, position) VALUES
  (10, 1, NULL, 'fabrics',    'Fabrics',    1),
  (20, 1, NULL, 'leatherite', 'Leatherite', 2),
  (11, 1, 10, 'suede',    'Suede',    1),
  (12, 1, 10, 'velvet',   'Velvet',   2),
  (13, 1, 10, 'boucle',   'Boucle',   3),
  (14, 1, 10, 'jacquard', 'Jacquard', 4),
  (15, 1, 10, 'jute',     'Jute',     5),
  (16, 1, 10, 'prints',   'Prints',   6),
  (17, 1, 10, 'tweed',    'Tweed',    7);

-- 2 · Curtains & Blinds
INSERT INTO subcategories (id, category_id, parent_id, slug, name, position) VALUES
  (100, 2, NULL, 'curtains', 'Curtains', 1),
  (200, 2, NULL, 'blinds',   'Blinds',   2),
  (110, 2, 100, 'main',      'Main',                   1),
  (120, 2, 100, 'blackouts', 'Blackouts and Dimouts',  2),
  (130, 2, 100, 'sheer',     'Sheer',                  3),
  (140, 2, 100, 'prints',    'Prints',                 4),
  (150, 2, 100, 'trims',     'Trims',                  5),
  (111, 2, 110, 'linen',     'Linen',     1),
  (112, 2, 110, 'jacquard',  'Jacquard',  2),
  (113, 2, 110, 'boucle',    'Boucle',    3),
  (114, 2, 110, 'velvet',    'Velvet',    4),
  (115, 2, 110, 'polyester', 'Polyester', 5),
  (121, 2, 120, '100-blackout', '100% Blackout', 1),
  (122, 2, 120, '80-blackout',  '80% Blackout',  2),
  (131, 2, 130, 'linen',      'Linen',      1),
  (132, 2, 130, 'embroidery', 'Embroidery', 2),
  (133, 2, 130, 'tissue',     'Tissue',     3),
  (134, 2, 130, 'organza',    'Organza',    4),
  (201, 2, 200, 'roller',        'Roller',        1),
  (202, 2, 200, 'roman',         'Roman',         2),
  (203, 2, 200, 'zebra',         'Zebra',         3),
  (204, 2, 200, 'wooden-blinds', 'Wooden Blinds', 4),
  (205, 2, 200, 'prints',        'Prints',        5);

-- 3 · Carpets & Mats. 4 · Wallpapers and 5 · Cushions are single collections.
INSERT INTO subcategories (id, category_id, parent_id, slug, name, position) VALUES
  (300, 3, NULL, 'carpets', 'Carpets', 1),
  (301, 3, NULL, 'mats',    'Mats',    2);
