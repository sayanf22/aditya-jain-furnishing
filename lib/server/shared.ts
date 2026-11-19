// Pieces the content handlers share: change counter, slugs, photo keys.
import type { Ctx } from "./context";
import { fail } from "./http";

/** Every change to content bumps the version so the dashboard can say "N changes not published". */
export const bumpVersion = (c: Ctx): D1PreparedStatement =>
  c.env.DB.prepare("UPDATE content_state SET version = version + 1, updated_at = datetime('now') WHERE id = 1");

export function slugify(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return s || "item";
}

/** Next free slug: base, base-2, base-3 ... `taken` answers whether a slug is used. */
export async function freeSlug(base: string, taken: (slug: string) => Promise<boolean>): Promise<string> {
  let candidate = base;
  for (let n = 2; n < 100; n++) {
    if (!(await taken(candidate))) return candidate;
    const suffix = `-${n}`;
    candidate = base.slice(0, 60 - suffix.length) + suffix;
  }
  throw fail(409, "SLUG_TAKEN", "Choose a different name.");
}

export const MEDIA_KEY = /^m\/[0-9a-f]{16}$/;
const DEMO_KEY = /^demo\/[a-z0-9][a-z0-9._-]{0,80}$/;

/**
 * A photo key stored on a collection, type or site place: null, a library photo
 * that exists ("m/<hash>"), or a stand-in ("demo/<name>").
 */
export async function checkImageKey(c: Ctx, key: unknown, field: string): Promise<string | null> {
  if (key === null) return null;
  if (typeof key !== "string") throw fail(400, "INVALID", "Pick a photo.", field);
  if (DEMO_KEY.test(key)) return key;
  if (!MEDIA_KEY.test(key)) throw fail(400, "INVALID", "That photo is not valid.", field);
  const row = await c.env.DB.prepare("SELECT 1 AS ok FROM media WHERE key = ?1").bind(key).first();
  if (!row) throw fail(400, "MEDIA_NOT_FOUND", "That photo is not in the library.", field);
  return key;
}

/**
 * Saves a new order. `ids` must be exactly the rows currently in the list
 * (otherwise the list changed under the editor: 409).
 */
export async function applyOrder(c: Ctx, table: "categories" | "subcategories" | "products" | "testimonials", ids: number[], current: number[]): Promise<void> {
  const same = ids.length === current.length && current.every((id) => ids.includes(id));
  if (!same) throw fail(409, "LIST_CHANGED", "The list changed. Reload and try again.");
  const update = c.env.DB.prepare(`UPDATE ${table} SET position = ?1 WHERE id = ?2`);
  await c.env.DB.batch([...ids.map((id, i) => update.bind(i + 1, id)), bumpVersion(c)]);
}

/** Escapes % and _ for a LIKE ... ESCAPE '\' search. */
export const likeTerm = (q: string): string => `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

export const bit = (v: boolean | number): number => (v ? 1 : 0);
