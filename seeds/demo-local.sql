-- LOCAL DESIGN PREVIEW ONLY. Never run this against the client's database.
--
-- Fills the empty sections of the Home page with stand-in stock images
-- (public/demo/, see docs/stock-images.md) and clearly marked sample text,
-- so the layout can be reviewed before the client sends real content.
-- Everything here is replaced from the admin dashboard.
--
-- Apply with: npm run db:seed:demo

-- The phone and WhatsApp number (+91 92124 56021, confirmed 13 Nov 2026)
-- are set by migrations/0006_contact_number.sql, not here.

-- Hero slides (JSON array). Copy describes only the confirmed categories.
INSERT INTO settings (key, value) VALUES ('hero_slides', '[
  {"image": "demo/hero-upholstery", "alt": "Tan leather sofa in a sunlit room", "title": "Upholstery fabric in velvet, linen and leather.", "cta": "Explore upholstery fabric", "href": "/collection/upholstery-fabric"},
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

-- Testimonials: SAMPLE placeholders only, to show the layout. Real reviews
-- come from the client.
DELETE FROM testimonials;
INSERT INTO testimonials (name, text, position) VALUES
  ('Sample customer', 'Sample review. A real customer review from the client goes here.', 1),
  ('Sample interior designer', 'Sample review. A real review from an interior designer goes here.', 2),
  ('Sample customer', 'Sample review. A third real review goes here.', 3);
