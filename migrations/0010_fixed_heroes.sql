-- Migration number: 0010
-- Hero photos are fixed: the Home hero slides and every page-header photo can no
-- longer be replaced from the dashboard. Remove any replacement saved earlier;
-- the site shows its built-in hero photos. Photos left without a use are
-- removed from R2 by the dashboard's orphan sweep (POST /api/admin/media/sweep).
DELETE FROM site_images
 WHERE slot LIKE 'home.hero.%' OR slot IN ('collection.hero', 'about.hero', 'contact.hero');
UPDATE categories SET hero_image_key = NULL WHERE hero_image_key LIKE 'm/%';
