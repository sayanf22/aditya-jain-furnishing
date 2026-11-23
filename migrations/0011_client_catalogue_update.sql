-- Migration number: 0011 	 2026-11-23
-- The client's catalogue changes (23 Nov 2026):
--   1. A new collection, "Borders & Laces" (a single collection like
--      Wallpapers and Cushions: its designs sit directly in it).
--   2. "Trims" removed from Curtains (with any designs in it).
--   3. The Fabrics list under Upholstery becomes: Suede, Velvet, Boucle,
--      Jacquard, Jute, Chenille, Linen, Tweed, Prints (Chenille and Linen
--      are new; Prints moves to the end).
-- Descriptions that listed "trims" are reworded. The content version goes up
-- by one, so the dashboard shows the change as waiting to be published.

-- 2. Trims out of Curtains.
DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE subcategory_id = 150);
DELETE FROM products WHERE subcategory_id = 150;
DELETE FROM subcategories WHERE id = 150;
UPDATE subcategories SET description = 'Curtain fabrics, by type: main fabrics, blackouts and dimouts, sheers and prints.' WHERE id = 100;
UPDATE categories SET tagline = 'Curtains and blinds for every window. Curtains come as main fabrics, blackouts and dimouts, sheers and prints; blinds as roller, Roman, zebra, wooden and printed.' WHERE id = 2;

-- 3. Fabrics under Upholstery.
INSERT INTO subcategories (id, category_id, parent_id, slug, name, description, position) VALUES
  (18, 1, 10, 'chenille', 'Chenille', 'A soft, tufted fabric with a velvety feel and a slightly textured surface.', 6),
  (19, 1, 10, 'linen',    'Linen',    'A natural fibre with a slightly uneven weave and a relaxed look.',            7);
UPDATE subcategories SET position = 8 WHERE id = 17; -- Tweed
UPDATE subcategories SET position = 9 WHERE id = 16; -- Prints
UPDATE subcategories SET description = 'Upholstery fabrics, by type: suede, velvet, boucle, jacquard, jute, chenille, linen, tweed and prints.' WHERE id = 10;

-- 1. Borders & Laces.
INSERT INTO categories (id, slug, name, tagline, position) VALUES
  (6, 'borders-laces', 'Borders & Laces', 'Decorative borders and laces for edging and finishing.', 6);

UPDATE content_state SET version = version + 1, updated_at = datetime('now') WHERE id = 1;
