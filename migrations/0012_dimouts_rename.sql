-- Migration number: 0012 	 2026-11-23
-- The client renamed "80% Blackout" (under Curtains > Blackouts and Dimouts)
-- to "Dimouts". The address changes with it (…/blackouts/dimouts).
-- The content version goes up by one so the change shows as waiting to publish.

UPDATE subcategories SET slug = 'dimouts', name = 'Dimouts' WHERE id = 122;
UPDATE subcategories SET description = 'Curtains that keep a room dark or dim: 100% blackout or dimouts.' WHERE id = 120;

UPDATE content_state SET version = version + 1, updated_at = datetime('now') WHERE id = 1;
