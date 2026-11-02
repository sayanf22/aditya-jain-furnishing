-- Watch & Buy uses photos instead of video: a "look" is a room photo with
-- tappable dots (hotspots) on the products in it. The video table goes.
DROP TABLE IF EXISTS watch_items;

CREATE TABLE looks (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  image_key  TEXT NOT NULL,
  width      INTEGER NOT NULL,
  height     INTEGER NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  visible    INTEGER NOT NULL DEFAULT 1
);

-- x and y are percentages of the photo's width and height (0–100).
CREATE TABLE look_hotspots (
  id           INTEGER PRIMARY KEY,
  look_id      INTEGER NOT NULL REFERENCES looks(id) ON DELETE CASCADE,
  x            REAL NOT NULL CHECK (x >= 0 AND x <= 100),
  y            REAL NOT NULL CHECK (y >= 0 AND y <= 100),
  name         TEXT NOT NULL,
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  position     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_look_hotspots_look ON look_hotspots(look_id, position);

-- Enquiry form (agreement §06): firm name for business / interior designer
-- enquiries, and where on the site the enquiry was sent from.
ALTER TABLE enquiries ADD COLUMN company TEXT;
ALTER TABLE enquiries ADD COLUMN source TEXT;
