-- Interactive room (13 Nov 2026, the client's request): one drawn room on
-- the Home page in which every element (wallpaper, curtains, blind, sofa,
-- armchair, cushions, rug) can be tapped and its fabric changed. It
-- replaces the photo-swap "Interactive home décor" and the "Our looks"
-- (Watch & Buy) carousel, which are merged into it.
--
-- The old tables only ever held stand-in content.
DROP TABLE IF EXISTS look_hotspots;
DROP TABLE IF EXISTS looks;
DROP TABLE IF EXISTS decor_options;
DROP TABLE IF EXISTS decor_scenes;

-- One row per element of the room. The shape of each element is drawn in
-- code (components/home/room/); `slug` picks it. An element with no
-- visible options is drawn in a plain colour and can't be tapped.
CREATE TABLE room_elements (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE
                 CHECK (slug IN ('wall', 'curtains', 'blind', 'sofa', 'armchair', 'cushions', 'rug')),
  name         TEXT NOT NULL,
  description  TEXT,
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  visible      INTEGER NOT NULL DEFAULT 1
);

-- A fabric (or wallpaper, or rug) the visitor can pick for an element.
-- texture_key: a square, seamless photo of the material, repeated across
-- the element; for the rug, a top-down photo of the whole rug.
-- tile: how wide one repeat of the texture is in the room (the room is
-- 1600 units wide, a curtain panel about 150). Ignored for the rug.
-- colour: shown while the texture loads.
CREATE TABLE room_options (
  id           INTEGER PRIMARY KEY,
  element_id   INTEGER NOT NULL REFERENCES room_elements(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  texture_key  TEXT NOT NULL,
  tile         INTEGER NOT NULL DEFAULT 120 CHECK (tile BETWEEN 20 AND 800),
  colour       TEXT NOT NULL DEFAULT '#d9cfc2',
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  visible      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_room_options_element ON room_options(element_id, position);

-- The seven elements, each linked to its collection. Descriptions only say
-- what the element is; the client can reword them in the dashboard.
INSERT INTO room_elements (id, slug, name, description, category_id, position) VALUES
  (1, 'curtains', 'Curtains',  'Floor-length curtains on both sides of the window. Pick a fabric to see how it hangs.', 2, 1),
  (2, 'blind',    'Blind',     'A fold-up blind inside the window frame.', 2, 2),
  (3, 'sofa',     'Sofa',      'The fabric on the sofa: back, seat and arms.', 1, 3),
  (4, 'armchair', 'Armchair',  'The fabric on the armchair by the window.', 1, 4),
  (5, 'cushions', 'Cushions',  'The cushions on the sofa.', 4, 5),
  (6, 'rug',      'Rug',       'The rug on the floor in front of the sofa.', 3, 6),
  (7, 'wall',     'Wallpaper', 'The wallpaper on the wall behind.', 5, 7);
