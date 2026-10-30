-- Catalogue structure from the revised agreement (26 October 2026).
-- Only names confirmed in the agreement. Taglines, images and the
-- curtain/blind types are added later from the admin dashboard.

INSERT INTO categories (id, slug, name, position) VALUES
  (1, 'upholstery-fabric', 'Upholstery Fabric', 1),
  (2, 'curtains-blinds',   'Curtains & Blinds', 2),
  (3, 'carpets-mats',      'Carpets & Mats',    3),
  (4, 'cushions',          'Cushions',          4),
  (5, 'wallpaper',         'Wallpaper',         5);

-- 1 · Upholstery Fabric
INSERT INTO subcategories (category_id, slug, name, position) VALUES
  (1, 'fabric',  'Fabric',  1),
  (1, 'velvet',  'Velvet',  2),
  (1, 'linen',   'Linen',   3),
  (1, 'prints',  'Prints',  4),
  (1, 'leather', 'Leather', 5);

-- 2 · Curtains & Blinds: two groups. Curtain types (up to 10) and blind
-- types (4–5) go inside these groups once the client names them.
INSERT INTO subcategories (id, category_id, slug, name, position) VALUES
  (100, 2, 'curtains', 'Curtains', 1),
  (101, 2, 'blinds',   'Blinds',   2);
INSERT INTO subcategories (category_id, parent_id, slug, name, position) VALUES
  (2, 100, 'curtain-prints', 'Prints', 99);

-- 3 · Carpets & Mats ("Direct collections" is the all-products view)
INSERT INTO subcategories (category_id, slug, name, position) VALUES
  (3, 'carpets', 'Carpets', 1),
  (3, 'mats',    'Mats',    2);

-- 4 · Cushions and 5 · Wallpaper are single collections: no subcategories.
