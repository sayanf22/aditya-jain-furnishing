// Collections (categories) and types (subcategories): the tree, create,
// edit, hide, reorder, delete. Contract: lib/admin-api.ts.
import type { AdminCategory, AdminSubcategory, Ok } from "../admin-api";
import { audit } from "./audit";
import type { Ctx } from "./context";
import { removeUnusedMedia } from "./media";
import { bit, applyOrder, bumpVersion, checkImageKey, freeSlug, slugify } from "./shared";
import { bool, fail, idField, idList, idParam, nullable, optText, parse, readJson, slug, text } from "./http";

type CatRow = { id: number; slug: string; name: string; tagline: string | null; image_key: string | null; hero_image_key: string | null; position: number; visible: number };
type SubRow = { id: number; category_id: number; parent_id: number | null; slug: string; name: string; description: string | null; image_key: string | null; position: number; visible: number };
type CountRow = { category_id: number; subcategory_id: number | null; n: number };

const MAX_DEPTH = 5;

// ----------------------------------------------------------------- reading

function buildTree(cats: CatRow[], subs: SubRow[], counts: CountRow[]): AdminCategory[] {
  const direct = new Map<string, number>();
  for (const r of counts) direct.set(`${r.category_id}:${r.subcategory_id ?? 0}`, r.n);
  const byParent = new Map<string, SubRow[]>();
  for (const s of subs) {
    const key = `${s.category_id}:${s.parent_id ?? 0}`;
    (byParent.get(key) ?? byParent.set(key, []).get(key)!).push(s);
  }
  const sort = (a: { position: number; id: number }, b: { position: number; id: number }) => a.position - b.position || a.id - b.id;
  const nest = (categoryId: number, parentId: number | null, depth: number): AdminSubcategory[] =>
    (byParent.get(`${categoryId}:${parentId ?? 0}`) ?? [])
      .sort(sort)
      .map((s) => {
        const children = depth < MAX_DEPTH + 1 ? nest(categoryId, s.id, depth + 1) : [];
        return {
          id: s.id, categoryId, parentId, slug: s.slug, name: s.name, description: s.description, imageKey: s.image_key,
          visible: s.visible === 1, position: s.position,
          productCount: (direct.get(`${categoryId}:${s.id}`) ?? 0) + children.reduce((n, ch) => n + ch.productCount, 0),
          children,
        };
      });
  return cats.sort(sort).map((c) => {
    const children = nest(c.id, null, 1);
    return {
      id: c.id, slug: c.slug, name: c.name, description: c.tagline, imageKey: c.image_key, heroImageKey: c.hero_image_key,
      visible: c.visible === 1, position: c.position,
      productCount: (direct.get(`${c.id}:0`) ?? 0) + children.reduce((n, ch) => n + ch.productCount, 0),
      children,
    };
  });
}

async function loadTree(c: Ctx, categoryId?: number): Promise<{ categories: AdminCategory[]; totalProducts: number }> {
  const db = c.env.DB;
  const where = categoryId === undefined ? "" : " WHERE category_id = ?1";
  const bindOne = (sql: string) => (categoryId === undefined ? db.prepare(sql) : db.prepare(sql).bind(categoryId));
  const [cats, subs, counts] = await db.batch([
    categoryId === undefined
      ? db.prepare("SELECT id, slug, name, tagline, image_key, hero_image_key, position, visible FROM categories")
      : db.prepare("SELECT id, slug, name, tagline, image_key, hero_image_key, position, visible FROM categories WHERE id = ?1").bind(categoryId),
    bindOne(`SELECT id, category_id, parent_id, slug, name, description, image_key, position, visible FROM subcategories${where}`),
    bindOne(`SELECT category_id, subcategory_id, COUNT(*) AS n FROM products${where} GROUP BY category_id, subcategory_id`),
  ]);
  const categories = buildTree(cats.results as CatRow[], subs.results as SubRow[], counts.results as CountRow[]);
  return { categories, totalProducts: categories.reduce((n, cat) => n + cat.productCount, 0) };
}

export const getCatalogue = (c: Ctx) => loadTree(c);

async function oneCategory(c: Ctx, id: number): Promise<AdminCategory> {
  const { categories } = await loadTree(c, id);
  if (!categories[0]) throw fail(404, "NOT_FOUND", "That collection was not found.");
  return categories[0];
}

function findSub(nodes: AdminSubcategory[], id: number): AdminSubcategory | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const inner = findSub(n.children, id);
    if (inner) return inner;
  }
  return null;
}

async function subRow(c: Ctx, id: number): Promise<SubRow> {
  const row = await c.env.DB.prepare("SELECT id, category_id, parent_id, slug, name, description, image_key, position, visible FROM subcategories WHERE id = ?1").bind(id).first<SubRow>();
  if (!row) throw fail(404, "NOT_FOUND", "That type was not found.");
  return row;
}

async function oneSub(c: Ctx, id: number): Promise<AdminSubcategory> {
  const row = await subRow(c, id);
  const found = findSub((await oneCategory(c, row.category_id)).children, id);
  if (!found) throw fail(404, "NOT_FOUND", "That type was not found.");
  return found;
}

// ------------------------------------------------------- rules about the tree

/** True if designs sit directly in this collection (subId null) or type. */
export async function holdsDesigns(c: Ctx, categoryId: number, subId: number | null): Promise<boolean> {
  const row = subId === null
    ? await c.env.DB.prepare("SELECT 1 AS x FROM products WHERE category_id = ?1 AND subcategory_id IS NULL LIMIT 1").bind(categoryId).first()
    : await c.env.DB.prepare("SELECT 1 AS x FROM products WHERE subcategory_id = ?1 LIMIT 1").bind(subId).first();
  return row !== null;
}

/** True if types sit directly in this collection (subId null) or type. */
export async function holdsTypes(c: Ctx, categoryId: number, subId: number | null): Promise<boolean> {
  const row = await c.env.DB
    .prepare("SELECT 1 AS x FROM subcategories WHERE category_id = ?1 AND IFNULL(parent_id, 0) = ?2 LIMIT 1")
    .bind(categoryId, subId ?? 0)
    .first();
  return row !== null;
}

async function slugTaken(c: Ctx, table: "categories" | "subcategories", slugValue: string, scope: { categoryId?: number; parentId?: number | null }, exceptId?: number): Promise<boolean> {
  const row =
    table === "categories"
      ? await c.env.DB.prepare("SELECT 1 AS x FROM categories WHERE slug = ?1 AND id != ?2").bind(slugValue, exceptId ?? 0).first()
      : await c.env.DB
          .prepare("SELECT 1 AS x FROM subcategories WHERE category_id = ?1 AND IFNULL(parent_id, 0) = ?2 AND slug = ?3 AND id != ?4")
          .bind(scope.categoryId, scope.parentId ?? 0, slugValue, exceptId ?? 0)
          .first();
  return row !== null;
}

// -------------------------------------------------------------- categories

export async function createCategory(c: Ctx): Promise<AdminCategory> {
  const body = parse(await readJson(c.request), { name: text(80, 1), description: text(500), slug }, ["name"]);
  let chosen: string;
  if (body.slug) {
    if (await slugTaken(c, "categories", body.slug, {})) throw fail(409, "SLUG_TAKEN", "Another collection already uses that address.", "slug");
    chosen = body.slug;
  } else {
    chosen = await freeSlug(slugify(body.name!), (s) => slugTaken(c, "categories", s, {}));
  }
  const [res] = await c.env.DB.batch([
    c.env.DB
      .prepare("INSERT INTO categories (slug, name, tagline, position) VALUES (?1, ?2, ?3, (SELECT COALESCE(MAX(position), 0) + 1 FROM categories))")
      .bind(chosen, body.name, body.description || null),
    bumpVersion(c),
  ]);
  const id = res.meta.last_row_id;
  audit(c, "category.create", "category", id, { name: body.name });
  return oneCategory(c, id);
}

export async function updateCategory(c: Ctx): Promise<AdminCategory> {
  const id = idParam(c.params[0]);
  const body = parse(await readJson(c.request), {
    name: text(80, 1), description: optText(500), slug, visible: bool,
    imageKey: nullable(text(120, 1)), heroImageKey: nullable(text(120, 1)),
  });
  const current = await c.env.DB.prepare("SELECT id FROM categories WHERE id = ?1").bind(id).first();
  if (!current) throw fail(404, "NOT_FOUND", "That collection was not found.");
  const sets: [string, unknown][] = [];
  if (body.name !== undefined) sets.push(["name", body.name]);
  if (body.description !== undefined) sets.push(["tagline", body.description]);
  if (body.slug !== undefined) {
    if (await slugTaken(c, "categories", body.slug, {}, id)) throw fail(409, "SLUG_TAKEN", "Another collection already uses that address.", "slug");
    sets.push(["slug", body.slug]);
  }
  if (body.visible !== undefined) sets.push(["visible", bit(body.visible)]);
  if (body.imageKey !== undefined) sets.push(["image_key", await checkImageKey(c, body.imageKey, "imageKey")]);
  // Every page header photo is fixed.
  if (body.heroImageKey !== undefined) throw fail(400, "NOT_REPLACEABLE", "Header photos are fixed and cannot be changed.", "heroImageKey");
  if (sets.length === 0) throw fail(400, "INVALID", "Nothing to change.");
  // Column names above are fixed strings from this function, never from the request.
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE categories SET ${sets.map(([col], i) => `${col} = ?${i + 2}`).join(", ")}, updated_at = datetime('now') WHERE id = ?1`).bind(id, ...sets.map(([, v]) => v)),
    bumpVersion(c),
  ]);
  audit(c, "category.update", "category", id, { fields: sets.map(([col]) => col) });
  return oneCategory(c, id);
}

export async function deleteCategory(c: Ctx): Promise<Ok> {
  const id = idParam(c.params[0]);
  const row = await c.env.DB.prepare("SELECT name FROM categories WHERE id = ?1").bind(id).first<{ name: string }>();
  if (!row) throw fail(404, "NOT_FOUND", "That collection was not found.");
  if ((c.url.searchParams.get("confirm") ?? "").trim() !== row.name) throw fail(400, "CONFIRM_MISMATCH", "Type the collection name to confirm.", "confirm");
  // Photos of the collection, its types and its designs: removed from D1 and R2 afterwards if nothing else uses them.
  const { results: held } = await c.env.DB
    .prepare(
      `SELECT image_key AS k FROM categories WHERE id = ?1
       UNION SELECT hero_image_key FROM categories WHERE id = ?1
       UNION SELECT image_key FROM subcategories WHERE category_id = ?1
       UNION SELECT image_key FROM product_images WHERE product_id IN (SELECT id FROM products WHERE category_id = ?1)`,
    )
    .bind(id)
    .all<{ k: string | null }>();
  // Types and designs go with it (foreign keys: ON DELETE CASCADE).
  await c.env.DB.batch([c.env.DB.prepare("DELETE FROM categories WHERE id = ?1").bind(id), bumpVersion(c)]);
  const removed = await removeUnusedMedia(c.env, held.map((r) => r.k));
  audit(c, "category.delete", "category", id, { name: row.name, photosRemoved: removed });
  return { ok: true };
}

export async function reorderCategories(c: Ctx): Promise<Ok> {
  const body = parse(await readJson(c.request), { ids: idList() }, ["ids"]);
  const { results } = await c.env.DB.prepare("SELECT id FROM categories").all<{ id: number }>();
  await applyOrder(c, "categories", body.ids!, results.map((r) => r.id));
  audit(c, "category.reorder", "category");
  return { ok: true };
}

// ----------------------------------------------------------- subcategories

async function depthOf(c: Ctx, subId: number): Promise<number> {
  const row = await c.env.DB
    .prepare(
      `WITH RECURSIVE up(id, parent_id, d) AS (
         SELECT id, parent_id, 1 FROM subcategories WHERE id = ?1
         UNION ALL SELECT s.id, s.parent_id, up.d + 1 FROM subcategories s JOIN up ON s.id = up.parent_id)
       SELECT MAX(d) AS d FROM up`,
    )
    .bind(subId)
    .first<{ d: number | null }>();
  return row?.d ?? 0;
}

export async function createSubcategory(c: Ctx): Promise<AdminSubcategory> {
  const body = parse(await readJson(c.request), { categoryId: idField, parentId: nullable(idField), name: text(80, 1), description: text(500), slug }, ["categoryId", "name"]);
  const categoryId = body.categoryId!;
  const parentId = body.parentId ?? null;
  const cat = await c.env.DB.prepare("SELECT id FROM categories WHERE id = ?1").bind(categoryId).first();
  if (!cat) throw fail(404, "NOT_FOUND", "That collection was not found.");
  if (parentId !== null) {
    const parent = await subRow(c, parentId).catch(() => null);
    if (!parent || parent.category_id !== categoryId) throw fail(400, "INVALID", "That parent type is not in this collection.", "parentId");
    if ((await depthOf(c, parentId)) >= MAX_DEPTH) throw fail(409, "TOO_DEEP", "Types can only go five levels deep.");
  }
  if (await holdsDesigns(c, categoryId, parentId)) {
    throw fail(409, "HOLDS_DESIGNS", "This already has designs in it. Move them into a type first, or add a type somewhere else.");
  }
  let chosen: string;
  if (body.slug) {
    if (await slugTaken(c, "subcategories", body.slug, { categoryId, parentId })) throw fail(409, "SLUG_TAKEN", "Another type here already uses that address.", "slug");
    chosen = body.slug;
  } else {
    chosen = await freeSlug(slugify(body.name!), (s) => slugTaken(c, "subcategories", s, { categoryId, parentId }));
  }
  const [res] = await c.env.DB.batch([
    c.env.DB
      .prepare(
        `INSERT INTO subcategories (category_id, parent_id, slug, name, description, position)
         VALUES (?1, ?2, ?3, ?4, ?5, (SELECT COALESCE(MAX(position), 0) + 1 FROM subcategories WHERE category_id = ?1 AND IFNULL(parent_id, 0) = ?6))`,
      )
      .bind(categoryId, parentId, chosen, body.name, body.description || null, parentId ?? 0),
    bumpVersion(c),
  ]);
  audit(c, "subcategory.create", "subcategory", res.meta.last_row_id, { name: body.name, categoryId, parentId });
  return oneSub(c, res.meta.last_row_id);
}

export async function updateSubcategory(c: Ctx): Promise<AdminSubcategory> {
  const subId = idParam(c.params[0]);
  const body = parse(await readJson(c.request), { name: text(80, 1), description: optText(500), slug, visible: bool, imageKey: nullable(text(120, 1)) });
  const row = await subRow(c, subId);
  const sets: [string, unknown][] = [];
  if (body.name !== undefined) sets.push(["name", body.name]);
  if (body.description !== undefined) sets.push(["description", body.description]);
  if (body.slug !== undefined) {
    if (await slugTaken(c, "subcategories", body.slug, { categoryId: row.category_id, parentId: row.parent_id }, subId)) {
      throw fail(409, "SLUG_TAKEN", "Another type here already uses that address.", "slug");
    }
    sets.push(["slug", body.slug]);
  }
  if (body.visible !== undefined) sets.push(["visible", bit(body.visible)]);
  if (body.imageKey !== undefined) sets.push(["image_key", await checkImageKey(c, body.imageKey, "imageKey")]);
  if (sets.length === 0) throw fail(400, "INVALID", "Nothing to change.");
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE subcategories SET ${sets.map(([col], i) => `${col} = ?${i + 2}`).join(", ")}, updated_at = datetime('now') WHERE id = ?1`).bind(subId, ...sets.map(([, v]) => v)),
    bumpVersion(c),
  ]);
  audit(c, "subcategory.update", "subcategory", subId, { fields: sets.map(([col]) => col) });
  return oneSub(c, subId);
}

export async function deleteSubcategory(c: Ctx): Promise<Ok> {
  const subId = idParam(c.params[0]);
  const row = await subRow(c, subId);
  if ((c.url.searchParams.get("confirm") ?? "").trim() !== row.name) throw fail(400, "CONFIRM_MISMATCH", "Type the name to confirm.", "confirm");
  const { results: held } = await c.env.DB
    .prepare(
      `WITH RECURSIVE d(id) AS (SELECT ?1 UNION ALL SELECT s.id FROM subcategories s JOIN d ON s.parent_id = d.id)
       SELECT image_key AS k FROM subcategories WHERE id IN (SELECT id FROM d)
       UNION SELECT image_key FROM product_images WHERE product_id IN (SELECT id FROM products WHERE subcategory_id IN (SELECT id FROM d))`,
    )
    .bind(subId)
    .all<{ k: string | null }>();
  // products.subcategory_id is ON DELETE SET NULL, so designs in this type and
  // the types below it are removed explicitly; the sub-types go by cascade.
  await c.env.DB.batch([
    c.env.DB
      .prepare(
        `WITH RECURSIVE d(id) AS (SELECT ?1 UNION ALL SELECT s.id FROM subcategories s JOIN d ON s.parent_id = d.id)
         DELETE FROM products WHERE subcategory_id IN (SELECT id FROM d)`,
      )
      .bind(subId),
    c.env.DB.prepare("DELETE FROM subcategories WHERE id = ?1").bind(subId),
    bumpVersion(c),
  ]);
  const removed = await removeUnusedMedia(c.env, held.map((r) => r.k));
  audit(c, "subcategory.delete", "subcategory", subId, { name: row.name, photosRemoved: removed });
  return { ok: true };
}

export async function reorderSubcategories(c: Ctx): Promise<Ok> {
  const body = parse(await readJson(c.request), { categoryId: idField, parentId: nullable(idField), ids: idList() }, ["categoryId", "parentId", "ids"]);
  const { results } = await c.env.DB
    .prepare("SELECT id FROM subcategories WHERE category_id = ?1 AND IFNULL(parent_id, 0) = ?2")
    .bind(body.categoryId, body.parentId ?? 0)
    .all<{ id: number }>();
  await applyOrder(c, "subcategories", body.ids!, results.map((r) => r.id));
  audit(c, "subcategory.reorder", "subcategory", undefined, { categoryId: body.categoryId, parentId: body.parentId ?? null });
  return { ok: true };
}

