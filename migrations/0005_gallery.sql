-- Gallery (agreement §02: "products and décor, with zoom and search").
-- Each item is one photo, shown whole (never cropped), so its size is
-- stored. A photo can belong to a category (for the filter) and, later,
-- point at a product. Managed from the admin dashboard.
CREATE TABLE gallery_items (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  image_key    TEXT NOT NULL,
  width        INTEGER NOT NULL,
  height       INTEGER NOT NULL,
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  visible      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_gallery_items_position ON gallery_items(position, id);
