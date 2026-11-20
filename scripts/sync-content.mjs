// Brings the dashboard's content into the build-local D1 database, so the
// pre-rendered pages are built from what the owner published. Runs from
// scripts/build-db.mjs (npm script prebuild:next) when EXPORT_URL and
// EXPORT_TOKEN are set (Workers Builds build variables). Nothing here
// touches the live databases: it only READS the live site's export endpoint
// (GET /api/content/export, Bearer token) and WRITES the local database.
//
//   1. fetch and check the export (shape in lib/admin-api.ts: ContentExport)
//   2. download every photo in use to public/m/ (free static files), and
//      remove photos there that are no longer used
//   3. replace the content tables in the local database
//   4. write lib/build-info.json: the content version this build was made from
//
// Any problem stops the build with a non-zero exit, so a broken or empty
// export can never replace the live site. Only after step 3 succeeds is
// build-info.json written.
//
// For tests only: D1_PERSIST_TO=<dir> writes to a separate local database.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const PHOTOS = here("public/m");
const BUILD_INFO = here("lib/build-info.json");
// Same list as MEDIA_WIDTHS in lib/admin-api.ts.
const WIDTHS = new Set([480, 640, 800, 1080, 1200, 1600, 2048]);
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MEDIA_KEY = /^m\/([0-9a-f]{16})$/;
const HERO_SLOT = /^(home\.hero\.\d+|collection\.hero|about\.hero|contact\.hero)$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const IMAGE_KEY = /^(m\/[0-9a-f]{16}|demo\/[A-Za-z0-9._-]{1,80})$/;
// Wrangler's bin file is not in its package "exports", so it cannot be resolved by name.
const WRANGLER = here("node_modules/wrangler/bin/wrangler.js");

const fail = (message) => {
  throw new Error(message);
};
const must = (condition, message) => condition || fail(`Export check failed: ${message}`);

// ------------------------------------------------------------------ fetch

function exportUrl(base) {
  let url;
  try {
    url = new URL(base);
  } catch {
    return fail(`EXPORT_URL is not a web address: "${base}"`);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    fail("EXPORT_URL must start with https:// (the token would travel in clear text otherwise).");
  }
  return url;
}

async function fetchExport(origin, token) {
  const response = await fetch(new URL("/api/content/export", origin), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) fail(`The export endpoint answered ${response.status} ${response.statusText}.`);
  try {
    return await response.json();
  } catch {
    return fail("The export endpoint did not return JSON.");
  }
}

// --------------------------------------------------------------- validate

const isInt = (v) => Number.isInteger(v);
const isStr = (v) => typeof v === "string";
const orNull = (check) => (v) => v === null || check(v);
const SHAPES = {
  categories: { id: isInt, slug: isStr, name: isStr, tagline: orNull(isStr), image_key: orNull(isStr), hero_image_key: orNull(isStr), position: isInt },
  subcategories: { id: isInt, category_id: isInt, parent_id: orNull(isInt), slug: isStr, name: isStr, description: orNull(isStr), image_key: orNull(isStr), position: isInt },
  products: { id: isInt, category_id: isInt, subcategory_id: orNull(isInt), slug: isStr, name: isStr, description: orNull(isStr), position: isInt },
  product_images: { id: isInt, product_id: isInt, image_key: isStr, width: isInt, height: isInt, alt: orNull(isStr), position: isInt },
  media: { key: isStr, widths: isStr, width: isInt, height: isInt, alt: orNull(isStr) },
  site_images: { slot: isStr, media_key: orNull(isStr), alt: orNull(isStr) },
  settings: { key: isStr, value: isStr },
  testimonials: { id: isInt, name: isStr, text: isStr, position: isInt },
};

function validate(data) {
  must(data && typeof data === "object", "not an object");
  must(isInt(data.version) && data.version >= 0, "version is missing");
  for (const [table, shape] of Object.entries(SHAPES)) {
    must(Array.isArray(data[table]), `${table} is missing`);
    data[table].forEach((row, i) => {
      for (const [field, ok] of Object.entries(shape)) {
        must(row && ok(row[field]), `${table}[${i}].${field} has the wrong type`);
      }
    });
  }
  // Slugs become page addresses and image keys become file names, so both are held to a strict pattern.
  for (const table of ["categories", "subcategories", "products"]) {
    data[table].forEach((row, i) => must(SLUG.test(row.slug), `${table}[${i}].slug is not a valid address`));
  }
  const imageKeys = [
    ...data.categories.flatMap((c) => [c.image_key, c.hero_image_key]),
    ...data.subcategories.map((s) => s.image_key),
    ...data.product_images.map((i) => i.image_key),
    ...data.site_images.filter((s) => !HERO_SLOT.test(s.slot)).map((s) => s.media_key),
  ];
  must(imageKeys.every((k) => k === null || IMAGE_KEY.test(k)), "a photo key is not valid");
  // Never publish an empty site by accident.
  must(data.categories.length > 0, "there are no collections (refusing to publish an empty site)");

  const ids = (rows) => new Set(rows.map((r) => r.id));
  const categories = ids(data.categories);
  const subcategories = ids(data.subcategories);
  const products = ids(data.products);
  must(categories.size === data.categories.length, "duplicate collection ids");
  must(data.subcategories.every((s) => categories.has(s.category_id) && (s.parent_id === null || subcategories.has(s.parent_id))), "a type points at a missing collection or parent");
  must(data.products.every((p) => categories.has(p.category_id) && (p.subcategory_id === null || subcategories.has(p.subcategory_id))), "a design points at a missing collection or type");
  must(data.product_images.every((i) => products.has(i.product_id)), "a design photo points at a missing design");
  for (const m of data.media) {
    const widths = m.widths.split(",").map(Number);
    must(MEDIA_KEY.test(m.key) && widths.length > 0 && widths.every((w) => WIDTHS.has(w)), `media "${m.key}" is not valid`);
  }
}

/** Every uploaded photo (m/<hash>) the pages will show, checked against the media list. */
function usedPhotos(data) {
  const keys = new Set();
  const add = (key) => key && !key.startsWith("demo/") && keys.add(key);
  data.categories.forEach((c) => (add(c.image_key), add(c.hero_image_key)));
  data.subcategories.forEach((s) => add(s.image_key));
  data.product_images.forEach((i) => add(i.image_key));
  data.site_images.filter((s) => !HERO_SLOT.test(s.slot)).forEach((s) => add(s.media_key));
  const media = new Map(data.media.map((m) => [m.key, m]));
  const files = [];
  for (const key of keys) {
    const info = media.get(key);
    must(info, `photo "${key}" is used but not in the media list`);
    const hash = MEDIA_KEY.exec(key)[1];
    for (const w of info.widths.split(",")) files.push(`${hash}-${Number(w)}.webp`);
  }
  return files;
}

// ----------------------------------------------------------------- photos

async function download(origin, name) {
  const target = join(PHOTOS, name);
  // Photo files never change (the name is the hash), so a copy already here is good.
  if (existsSync(target) && statSync(target).size > 0) return;
  const response = await fetch(new URL(`/m/${name}`, origin), { redirect: "error", signal: AbortSignal.timeout(60_000) });
  if (!response.ok) fail(`Photo /m/${name} answered ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const webp = bytes.length > 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP";
  if (!webp || bytes.length > MAX_PHOTO_BYTES) fail(`Photo /m/${name} is not a WebP file of a sensible size.`);
  const partial = `${target}.part`;
  writeFileSync(partial, bytes);
  renameSync(partial, target);
}

async function syncPhotos(origin, files) {
  mkdirSync(PHOTOS, { recursive: true });
  const wanted = new Set(files);
  for (const existing of readdirSync(PHOTOS)) {
    if (!wanted.has(existing)) rmSync(join(PHOTOS, existing), { force: true });
  }
  const queue = [...wanted];
  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    for (let name = queue.pop(); name; name = queue.pop()) await download(origin, name);
  });
  await Promise.all(workers);
  return wanted.size;
}

// --------------------------------------------------------------- database

const q = (value) => {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : fail("A number in the export is not finite.");
  return `'${String(value).replaceAll("'", "''")}'`;
};
/** One INSERT statement (no closing semicolon; sqlFor adds it). */
const insert = (table, row, fields) => `INSERT INTO ${table} (${fields.join(", ")}) VALUES (${fields.map((f) => q(row[f])).join(", ")})`;

/** Parents before children, because of the parent_id reference. */
function parentsFirst(rows) {
  const done = new Set();
  const out = [];
  let rest = rows;
  while (rest.length > 0) {
    const ready = rest.filter((r) => r.parent_id === null || done.has(r.parent_id));
    must(ready.length > 0, "types sit inside each other in a circle");
    for (const r of ready) {
      out.push(r);
      done.add(r.id);
    }
    rest = rest.filter((r) => !done.has(r.id));
  }
  return out;
}
function sqlFor(data) {
  const sql = [];
  // Photos, designs and types are rebuilt. Collections are updated in place,
  // because the interactive room points at them (deleting one would clear
  // that link); only collections no longer in the export are removed.
  sql.push("DELETE FROM product_images", "DELETE FROM products", "DELETE FROM subcategories");
  sql.push(`DELETE FROM categories WHERE id NOT IN (${data.categories.map((c) => c.id).join(", ")})`);
  // Free every address first, so two collections can swap slugs.
  sql.push("UPDATE categories SET slug = '~' || id");
  for (const c of data.categories) {
    const fields = ["id", "slug", "name", "tagline", "image_key", "hero_image_key", "position"];
    const update = fields.slice(1).map((f) => `${f} = excluded.${f}`).join(", ");
    sql.push(`${insert("categories", c, fields)} ON CONFLICT (id) DO UPDATE SET ${update}, visible = 1`);
  }
  for (const s of parentsFirst(data.subcategories)) {
    sql.push(insert("subcategories", s, ["id", "category_id", "parent_id", "slug", "name", "description", "image_key", "position"]));
  }
  for (const p of data.products) {
    sql.push(insert("products", p, ["id", "category_id", "subcategory_id", "slug", "name", "description", "position"]));
  }
  for (const i of data.product_images) {
    sql.push(insert("product_images", i, ["id", "product_id", "image_key", "width", "height", "alt", "position"]));
  }
  sql.push("DELETE FROM media");
  for (const m of data.media) sql.push(insert("media", { ...m, bytes: 0 }, ["key", "widths", "width", "height", "bytes", "alt"]));
  sql.push("DELETE FROM site_images");
  // Hero places are fixed (lib/admin-api.ts NON_REPLACEABLE_SLOTS): rows for them are ignored.
  for (const s of data.site_images.filter((r) => !HERO_SLOT.test(r.slot))) sql.push(insert("site_images", s, ["slot", "media_key", "alt"]));
  // Settings are added to, not replaced: the business details come from the
  // migrations and stay unless the dashboard changed them.
  for (const s of data.settings) {
    sql.push(`${insert("settings", s, ["key", "value"])} ON CONFLICT (key) DO UPDATE SET value = excluded.value`);
  }
  sql.push("DELETE FROM testimonials");
  for (const t of data.testimonials) sql.push(insert("testimonials", { ...t, visible: 1 }, ["id", "name", "text", "position", "visible"]));
  return `${sql.join(";\n")};\n`;
}

function writeDatabase(sql) {
  const file = join(tmpdir(), `delta-sync-${process.pid}.sql`);
  writeFileSync(file, sql, "utf8");
  const persist = process.env.D1_PERSIST_TO ? ["--persist-to", process.env.D1_PERSIST_TO] : [];
  try {
    // No shell: the arguments are passed as a list, so nothing in them can be read as a command.
    execFileSync(process.execPath, [WRANGLER, "d1", "execute", "DB", "--local", ...persist, "--file", file], { stdio: "inherit" });
  } finally {
    rmSync(file, { force: true });
  }
}

// -------------------------------------------------------------------- run

async function main() {
  const { EXPORT_URL, EXPORT_TOKEN } = process.env;
  if (!EXPORT_URL || !EXPORT_TOKEN) fail("EXPORT_URL and EXPORT_TOKEN must both be set.");
  const origin = exportUrl(EXPORT_URL);

  const data = await fetchExport(origin, EXPORT_TOKEN);
  validate(data);
  const photos = await syncPhotos(origin, usedPhotos(data));
  writeDatabase(sqlFor(data));
  writeFileSync(BUILD_INFO, `${JSON.stringify({ contentVersion: data.version, builtAt: new Date().toISOString() }, null, 2)}\n`);

  console.log(
    `Content synced from ${origin.origin}: version ${data.version}, ${data.categories.length} collections, ` +
      `${data.subcategories.length} types, ${data.products.length} designs, ${photos} photo files.`,
  );
}

main().catch((error) => {
  console.error(`\nContent sync FAILED: ${error instanceof Error ? error.message : error}`);
  console.error("The build is stopped so the live site keeps its last good version.");
  process.exit(1);
});
