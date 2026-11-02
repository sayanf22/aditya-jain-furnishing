-- LOCAL DESIGN PREVIEW ONLY. Never run this against the client's database.
--
-- Fills the empty sections of the Home page with stand-in stock images
-- (public/demo/, see docs/stock-images.md) and clearly marked sample text,
-- so the layout can be reviewed before the client sends real content.
-- Everything here is replaced from the admin dashboard.
--
-- Apply with: npm run db:seed:demo

-- WhatsApp: assumed to be the showroom mobile. NOT CONFIRMED by the client.
INSERT INTO settings (key, value) VALUES
  ('whatsapp_number', '919811268268')
ON CONFLICT (key) DO UPDATE SET value = excluded.value;

-- Hero slides (JSON array). Copy describes only the confirmed categories.
INSERT INTO settings (key, value) VALUES ('hero_slides', '[
  {"image": "demo/hero-upholstery", "alt": "Tan leather sofa in a sunlit room", "title": "Upholstery fabric in velvet, linen, prints and leather.", "cta": "Explore upholstery fabric", "href": "/collection/upholstery-fabric"},
  {"image": "demo/hero-curtains", "alt": "Curtain tied back beside a sunlit window", "title": "Curtains and blinds for every window.", "cta": "Explore curtains & blinds", "href": "/collection/curtains-blinds"},
  {"image": "demo/hero-carpets", "alt": "Living room with a large patterned carpet", "title": "Carpets and mats for every room.", "cta": "Explore carpets & mats", "href": "/collection/carpets-mats"}
]')
ON CONFLICT (key) DO UPDATE SET value = excluded.value;

-- Category tile images.
UPDATE categories SET image_key = 'demo/cat-upholstery' WHERE slug = 'upholstery-fabric';
UPDATE categories SET image_key = 'demo/cat-curtains'   WHERE slug = 'curtains-blinds';
UPDATE categories SET image_key = 'demo/cat-carpets'    WHERE slug = 'carpets-mats';
UPDATE categories SET image_key = 'demo/cat-cushions'   WHERE slug = 'cushions';
UPDATE categories SET image_key = 'demo/cat-wallpaper'  WHERE slug = 'wallpaper';

-- Interactive décor: one scene, four looks. Stand-in photos show different
-- sofas; the client will upload one sofa photographed in each fabric.
DELETE FROM decor_options;
DELETE FROM decor_scenes;
INSERT INTO decor_scenes (id, name, default_image_key, position) VALUES
  (1, 'Sofa', 'demo/decor-velvet', 1);
INSERT INTO decor_options (scene_id, kind, name, swatch_image_key, result_image_key, width, height, position) VALUES
  (1, 'fabric', 'Green velvet', 'demo/swatch-velvet',  'demo/decor-velvet',  1600, 1200, 1),
  (1, 'fabric', 'Tan leather',  'demo/swatch-leather', 'demo/decor-leather', 1600, 1200, 2),
  (1, 'fabric', 'Grey weave',   'demo/swatch-grey',    'demo/decor-grey',    1600, 1200, 3),
  (1, 'fabric', 'Ivory linen',  'demo/swatch-ivory',   'demo/decor-ivory',   1600, 1200, 4);

-- Shop the look (Watch & Buy, photo based): room photos with dots on the
-- products. Names describe what the stand-in photos show.
DELETE FROM look_hotspots;
DELETE FROM looks;
INSERT INTO looks (id, title, image_key, width, height, position) VALUES
  (1, 'Living room',  'demo/look-living',  1600, 1200, 1),
  (2, 'Velvet lounge', 'demo/decor-velvet', 1600, 1200, 2),
  (3, 'Bedroom',      'demo/look-bedroom', 1600, 1200, 3);
INSERT INTO look_hotspots (look_id, x, y, name, category_id, position) VALUES
  (1, 31, 58, 'Grey upholstery fabric', 1, 1),
  (1, 17, 64, 'Cushion',                4, 2),
  (1, 64, 85, 'Patterned carpet',       3, 3),
  (2, 26, 72, 'Green velvet',           1, 1),
  (2, 51, 66, 'Printed cushion',        4, 2),
  (3, 52, 51, 'Blush upholstery fabric', 1, 1),
  (3, 44, 64, 'Grey cushions',          4, 2),
  (3, 50, 90, 'Upholstered bench',      1, 3);

-- Testimonials: SAMPLE placeholders only, to show the layout. Real reviews
-- come from the client.
DELETE FROM testimonials;
INSERT INTO testimonials (name, text, position) VALUES
  ('Sample customer', 'Sample review. A real customer review from the client goes here.', 1),
  ('Sample interior designer', 'Sample review. A real review from an interior designer goes here.', 2),
  ('Sample customer', 'Sample review. A third real review goes here.', 3);
