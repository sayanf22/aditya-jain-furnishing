// Designs (products) and their photos. Contract: lib/admin-api.ts.
import type { AdminProduct, AdminProductImage, Ok, Page } from "../admin-api";
import { holdsTypes } from "./catalogue";
import { audit } from "./audit";
import type { Ctx } from "./context";
import { bool, decodeCursor, encodeCursor, fail, idField, idList, idParam, iso, nullable, optText, pageLimit, parse, readJson, text } from "./http";
import { bit, applyOrder, bumpVersion, freeSlug, likeTerm, MEDIA_KEY, slugify } from "./shared";

type ProductRow = {
  id: number; category_id: number; subcategory_id: number | null; slug: string; name: string; description: string | null;
  visible: number; position: number; updated_at: string;
};
type ImageRow = { id: number; product_id: number; image_key: string; width: number; height: number; alt: string | null; position: number };

const COLS = "id, category_id, subcategory_id, slug, name, description, visible, position, updated_at";
const MAX_IMAGES = 12;

async function withImages(c: Ctx, rows: ProductRow[]): Promise<AdminProduct[]> {
  if (rows.length === 0) return [];
  const { results } = await c.env.DB
    .prepare("SELECT id, product_id, image_key, width, height, alt, position FROM product_images WHERE product_id IN (SELECT value FROM json_each(?1)) ORDER BY position, id")
    .bind(JSON.stringify(rows.map((r) => r.id)))
    .all<ImageRow>();
  const byProduct = new Map<number, AdminProductImage[]>();
  for (const i of results) {
    const list = byProduct.get(i.product_id) ?? [];
    list.push({ id: i.id, mediaKey: i.image_key, width: i.width, height: i.height, alt: i.alt, position: i.position });
    byProduct.set(i.product_id, list);
  }
  return rows.map((r) => {
    const images = byProduct.get(r.id) ?? [];
    return {
      id: r.id, categoryId: r.category_id, subcategoryId: r.subcategory_id, slug: r.slug, name: r.name, description: r.description,
      visible: r.visible === 1, position: r.position, images, isSample: images[0]?.mediaKey.startsWith("demo/") ?? false, updatedAt: iso(r.updated_at),
    };
  });
}

async function loadOne(c: Ctx, id: number): Promise<AdminProduct> {
  const row = await c.env.DB.prepare(`SELECT ${COLS} FROM products WHERE id = ?1`).bind(id).first<ProductRow>();
  if (!row) throw fail(404, "NOT_FOUND", "That design was not found.");
  return (await withImages(c, [row]))[0];
}

// ----------------------------------------------------------------- listing

export async function listProducts(c: Ctx): Promise<Page<AdminProduct>> {
  const q = c.url.searchParams;
  const limit = pageLimit(c.url);
  const cursor = decodeCursor(q.get("cursor"), 2);
  const where: string[] = [];
  const binds: unknown[] = [];
  const add = (sql: string, ...values: unknown[]) => {
    let n = binds.length;
    where.push(sql.replace(/\?/g, () => `?${++n}`));
    binds.push(...values);
  };
  const numberParam = (name: string) => {
    const raw = q.get(name);
    if (raw === null || raw === "") return null;
    if (!/^\d{1,10}$/.test(raw)) throw fail(400, "INVALID", "That filter is not valid.", name);
    return Number(raw);
  };
  const categoryId = numberParam("categoryId");
  const subcategoryId = numberParam("subcategoryId");
  if (categoryId !== null) add("category_id = ?", categoryId);
  if (subcategoryId !== null) {
    // The type and every type below it.
    add("subcategory_id IN (WITH RECURSIVE d(id) AS (SELECT ? UNION ALL SELECT s.id FROM subcategories s JOIN d ON s.parent_id = d.id) SELECT id FROM d)", subcategoryId);
  }
  const search = (q.get("q") ?? "").trim().slice(0, 80);
  if (search) add("(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')", likeTerm(search), likeTerm(search));
  if (q.get("sample") === "1") {
    add("(SELECT image_key FROM product_images i WHERE i.product_id = products.id ORDER BY position, id LIMIT 1) LIKE 'demo/%'");
  }
  if (cursor) add("(position > ? OR (position = ? AND id > ?))", cursor[0], cursor[0], cursor[1]);
  const sql = `SELECT ${COLS} FROM products ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY position, id LIMIT ?${binds.length + 1}`;
  const { results } = await c.env.DB.prepare(sql).bind(...binds, limit + 1).all<ProductRow>();
  const rows = results.slice(0, limit);
  return {
    items: await withImages(c, rows),
    nextCursor: results.length > limit ? encodeCursor([rows[rows.length - 1].position, rows[rows.length - 1].id]) : null,
  };
}

export const getProduct = (c: Ctx) => loadOne(c, idParam(c.params[0]));

// ----------------------------------------------------------- where it sits

/** Checks that a design may sit in this collection or type, and returns the collection id. */
async function checkContainer(c: Ctx, categoryId: number, subcategoryId: number | null): Promise<void> {
  const cat = await c.env.DB.prepare("SELECT id FROM categories WHERE id = ?1").bind(categoryId).first();
  if (!cat) throw fail(404, "NOT_FOUND", "That collection was not found.", "categoryId");
  if (subcategoryId !== null) {
    const sub = await c.env.DB.prepare("SELECT category_id FROM subcategories WHERE id = ?1").bind(subcategoryId).first<{ category_id: number }>();
    if (!sub || sub.category_id !== categoryId) throw fail(400, "INVALID", "That type is not in this collection.", "subcategoryId");
  }
  if (await holdsTypes(c, categoryId, subcategoryId)) {
    throw fail(409, "HAS_TYPES", "This has types inside it. Add the design to one of them.", subcategoryId === null ? "categoryId" : "subcategoryId");
  }
}

async function productSlug(c: Ctx, categoryId: number, name: string, exceptId = 0): Promise<string> {
  return freeSlug(slugify(name), async (s) => {
    const row = await c.env.DB.prepare("SELECT 1 AS x FROM products WHERE category_id = ?1 AND slug = ?2 AND id != ?3").bind(categoryId, s, exceptId).first();
    return row !== null;
  });
}

// ----------------------------------------------------------------- changes

export async function createProduct(c: Ctx): Promise<AdminProduct> {
  const body = parse(await readJson(c.request), { categoryId: idField, subcategoryId: nullable(idField), name: text(80, 1), description: text(500), visible: bool }, ["categoryId", "name"]);
  const subcategoryId = body.subcategoryId ?? null;
  await checkContainer(c, body.categoryId!, subcategoryId);
  const slugValue = await productSlug(c, body.categoryId!, body.name!);
  const [res] = await c.env.DB.batch([
    c.env.DB
      .prepare(
        `INSERT INTO products (category_id, subcategory_id, slug, name, description, visible, position)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, (SELECT COALESCE(MAX(position), 0) + 1 FROM products WHERE category_id = ?1 AND IFNULL(subcategory_id, 0) = ?7))`,
      )
      .bind(body.categoryId, subcategoryId, slugValue, body.name, body.description || null, bit(body.visible ?? true), subcategoryId ?? 0),
    bumpVersion(c),
  ]);
  audit(c, "product.create", "product", res.meta.last_row_id, { name: body.name });
  return loadOne(c, res.meta.last_row_id);
}

export async function updateProduct(c: Ctx): Promise<AdminProduct> {
  const pid = idParam(c.params[0]);
  const body = parse(await readJson(c.request), { name: text(80, 1), description: optText(500), visible: bool, categoryId: idField, subcategoryId: nullable(idField) });
  const row = await c.env.DB.prepare(`SELECT ${COLS} FROM products WHERE id = ?1`).bind(pid).first<ProductRow>();
  if (!row) throw fail(404, "NOT_FOUND", "That design was not found.");
  const sets: [string, unknown][] = [];
  if (body.name !== undefined) sets.push(["name", body.name]);
  if (body.description !== undefined) sets.push(["description", body.description]);
  if (body.visible !== undefined) sets.push(["visible", bit(body.visible)]);

  const moving = body.categoryId !== undefined || body.subcategoryId !== undefined;
  if (moving) {
    const categoryId = body.categoryId ?? row.category_id;
    // Moving to another collection without naming a type means "directly in the collection".
    const subcategoryId = body.subcategoryId !== undefined ? body.subcategoryId : categoryId === row.category_id ? row.subcategory_id : null;
    if (categoryId !== row.category_id || subcategoryId !== row.subcategory_id) {
      await checkContainer(c, categoryId, subcategoryId);
      sets.push(["category_id", categoryId], ["subcategory_id", subcategoryId]);
      if (categoryId !== row.category_id) sets.push(["slug", await productSlug(c, categoryId, row.name, pid)]);
      const last = await c.env.DB
        .prepare("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM products WHERE category_id = ?1 AND IFNULL(subcategory_id, 0) = ?2")
        .bind(categoryId, subcategoryId ?? 0)
        .first<{ p: number }>();
      sets.push(["position", last?.p ?? 1]);
    }
  }
  if (sets.length === 0) throw fail(400, "INVALID", "Nothing to change.");
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE products SET ${sets.map(([col], i) => `${col} = ?${i + 2}`).join(", ")}, updated_at = datetime('now') WHERE id = ?1`).bind(pid, ...sets.map(([, v]) => v)),
    bumpVersion(c),
  ]);
  audit(c, "product.update", "product", pid, { fields: sets.map(([col]) => col) });
  return loadOne(c, pid);
}

export async function deleteProduct(c: Ctx): Promise<Ok> {
  const pid = idParam(c.params[0]);
  const row = await c.env.DB.prepare("SELECT name FROM products WHERE id = ?1").bind(pid).first<{ name: string }>();
  if (!row) throw fail(404, "NOT_FOUND", "That design was not found.");
  await c.env.DB.batch([c.env.DB.prepare("DELETE FROM products WHERE id = ?1").bind(pid), bumpVersion(c)]);
  audit(c, "product.delete", "product", pid, { name: row.name });
  return { ok: true };
}

export async function deleteSampleProducts(c: Ctx): Promise<{ removed: number }> {
  const sample = "(SELECT image_key FROM product_images i WHERE i.product_id = p.id ORDER BY position, id LIMIT 1) LIKE 'demo/%'";
  const [count] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM products p WHERE ${sample}`),
    c.env.DB.prepare(`DELETE FROM products WHERE id IN (SELECT p.id FROM products p WHERE ${sample})`),
  ]);
  const removed = (count.results[0] as { n: number }).n;
  if (removed > 0) await bumpVersion(c).run();
  audit(c, "product.delete_samples", "product", undefined, { removed });
  return { removed };
}

export async function reorderProducts(c: Ctx): Promise<Ok> {
  const body = parse(await readJson(c.request), { categoryId: idField, subcategoryId: nullable(idField), ids: idList() }, ["categoryId", "subcategoryId", "ids"]);
  const { results } = await c.env.DB
    .prepare("SELECT id FROM products WHERE category_id = ?1 AND IFNULL(subcategory_id, 0) = ?2")
    .bind(body.categoryId, body.subcategoryId ?? 0)
    .all<{ id: number }>();
  await applyOrder(c, "products", body.ids!, results.map((r) => r.id));
  audit(c, "product.reorder", "product", undefined, { categoryId: body.categoryId, subcategoryId: body.subcategoryId ?? null });
  return { ok: true };
}

// -------------------------------------------------------------------- photos

export async function setProductImages(c: Ctx): Promise<AdminProduct> {
  const pid = idParam(c.params[0]);
  const body = await readJson(c.request);
  const { images } = parse(body, { images: (v, f) => {
    if (!Array.isArray(v) || v.length > MAX_IMAGES) throw fail(400, "INVALID", `Use up to ${MAX_IMAGES} photos.`, f);
    return v.map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) throw fail(400, "INVALID", "A photo is not valid.", f);
      return parse(entry as Record<string, unknown>, { mediaKey: text(120, 1), alt: optText(200) }, ["mediaKey"]);
    });
  } }, ["images"]);
  const list = images!;
  const keys = list.map((i) => i.mediaKey!);
  if (new Set(keys).size !== keys.length) throw fail(400, "INVALID", "The same photo is listed twice.", "images");
  const row = await c.env.DB.prepare("SELECT id FROM products WHERE id = ?1").bind(pid).first();
  if (!row) throw fail(404, "NOT_FOUND", "That design was not found.");

  // Sizes: from the library for uploaded photos; for stand-ins, from the same photo already on a design.
  const libraryKeys = keys.filter((k) => MEDIA_KEY.test(k));
  const sampleKeys = keys.filter((k) => k.startsWith("demo/"));
  if (libraryKeys.length + sampleKeys.length !== keys.length) throw fail(400, "INVALID", "A photo key is not valid.", "images");
  const [lib, demo] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT key, width, height FROM media WHERE key IN (SELECT value FROM json_each(?1))").bind(JSON.stringify(libraryKeys)),
    c.env.DB.prepare("SELECT image_key AS key, MAX(width) AS width, MAX(height) AS height FROM product_images WHERE image_key IN (SELECT value FROM json_each(?1)) GROUP BY image_key").bind(JSON.stringify(sampleKeys)),
  ]);
  const sizes = new Map<string, { width: number; height: number }>();
  for (const r of [...lib.results, ...demo.results] as { key: string; width: number; height: number }[]) sizes.set(r.key, r);
  for (const k of keys) if (!sizes.has(k)) throw fail(400, "MEDIA_NOT_FOUND", "A photo is not in the library.", "images");

  const insert = c.env.DB.prepare("INSERT INTO product_images (product_id, image_key, width, height, alt, position) VALUES (?1, ?2, ?3, ?4, ?5, ?6)");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM product_images WHERE product_id = ?1").bind(pid),
    ...list.map((img, i) => insert.bind(pid, img.mediaKey, sizes.get(img.mediaKey!)!.width, sizes.get(img.mediaKey!)!.height, img.alt ?? null, i + 1)),
    c.env.DB.prepare("UPDATE products SET updated_at = datetime('now') WHERE id = ?1").bind(pid),
    bumpVersion(c),
  ]);
  audit(c, "product.images", "product", pid, { count: list.length });
  return loadOne(c, pid);
}
