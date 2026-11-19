// Photo library: upload to R2, list, relabel, delete, and serve /m/*.
// Upload rules follow the OWASP File Upload cheat sheet: the type is checked
// from the file's own bytes, sizes and counts are capped, and names are
// generated from a hash, never taken from the client.
import { MEDIA_WIDTHS, SITE_IMAGE_SLOTS, type MediaAsset, type Ok, type Page } from "../admin-api";
import { audit } from "./audit";
import type { Ctx } from "./context";
import type { AdminEnv } from "./env";
import { hex } from "./crypto";
import { decodeCursor, encodeCursor, fail, idParam, int, iso, nullable, optText, pageLimit, parse, readBytes, readJson } from "./http";
import { likeTerm } from "./shared";

const MAX_FILE = 1_500_000;
const MAX_TOTAL = 6_000_000;
const MAX_FILES = 6;
const MAX_DIMENSION = 4096;
const MAX_LIBRARY_BYTES = 9_000_000_000; // R2 free plan: 10 GB
const MAX_LIBRARY_ITEMS = 5000;
const WIDTHS = MEDIA_WIDTHS as readonly number[];

// ------------------------------------------------------------ WebP header

/** True when the RIFF chunks after the header each fit and together fill the file, with an image chunk among them. */
function chunksFit(b: Uint8Array): boolean {
  const le32 = (at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] * 2 ** 24)) >>> 0;
  const name = (at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
  let pos = 12;
  let image = false;
  let lastOdd = false;
  while (pos + 8 <= b.length) {
    const size = le32(pos + 4);
    if (pos + 8 + size > b.length) return false;
    if (["VP8 ", "VP8L"].includes(name(pos))) image = true;
    lastOdd = (size & 1) === 1;
    pos += 8 + size + (size & 1);
  }
  return image && (pos === b.length || (pos === b.length + 1 && lastOdd));
}

/** Pixel size read from a WebP file's own header, or null if it is not a WebP. */
export function webpSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 30) return null;
  const tag = (at: number, s: string) => s.split("").every((ch, i) => b[at + i] === ch.charCodeAt(0));
  if (!tag(0, "RIFF") || !tag(8, "WEBP")) return null;
  const riff = b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] * 2 ** 24);
  if (riff + 8 !== b.length && riff + 9 !== b.length) return null; // size must match (odd sizes are padded)
  if (!chunksFit(b)) return null; // every chunk length must fit inside the file
  if (tag(12, "VP8X")) return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  if (tag(12, "VP8L")) {
    if (b[20] !== 0x2f) return null;
    return { width: 1 + (b[21] | ((b[22] & 0x3f) << 8)), height: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)) };
  }
  if (tag(12, "VP8 ")) {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  }
  return null;
}

// ----------------------------------------------------------------- mapping

type MediaRow = { id: number; key: string; widths: string; width: number; height: number; bytes: number; label: string | null; alt: string | null; created_at: string };
const COLS = "id, key, widths, width, height, bytes, label, alt, created_at";

export const toAsset = (r: MediaRow, usedBy: MediaAsset["usedBy"] = []): MediaAsset => ({
  id: r.id, key: r.key, widths: r.widths.split(",").map(Number), width: r.width, height: r.height, bytes: r.bytes,
  label: r.label, alt: r.alt, createdAt: iso(r.created_at), usedBy,
});

/** Everything that uses these photos (designs, collections, types, site places, room fabrics). */
export async function usageOf(env: AdminEnv, keys: string[]): Promise<Map<string, MediaAsset["usedBy"]>> {
  const out = new Map<string, MediaAsset["usedBy"]>();
  if (keys.length === 0) return out;
  const list = JSON.stringify(keys);
  const inList = "IN (SELECT value FROM json_each(?1))";
  // D1 allows at most five SELECTs joined by UNION ALL, so the six places are read in two statements.
  const [first, second] = await env.DB.batch([
    env.DB
      .prepare(
        `SELECT 'product' AS type, p.id AS id, p.name AS name, i.image_key AS k FROM product_images i JOIN products p ON p.id = i.product_id WHERE i.image_key ${inList}
         UNION ALL SELECT 'category', id, name, image_key FROM categories WHERE image_key ${inList}
         UNION ALL SELECT 'category', id, name, hero_image_key FROM categories WHERE hero_image_key ${inList}`,
      )
      .bind(list),
    env.DB
      .prepare(
        `SELECT 'subcategory' AS type, id, name, image_key AS k FROM subcategories WHERE image_key ${inList}
         UNION ALL SELECT 'site', slot, slot, media_key FROM site_images WHERE media_key ${inList}
         UNION ALL SELECT 'room', id, name, texture_key FROM room_options WHERE texture_key ${inList}`,
      )
      .bind(list),
  ]);
  const results = [...first.results, ...second.results] as { type: MediaAsset["usedBy"][number]["type"]; id: number | string; name: string; k: string }[];
  for (const r of results) {
    const entries = out.get(r.k) ?? [];
    if (entries.some((e) => e.type === r.type && e.id === r.id)) continue;
    const name = r.type === "site" ? (SITE_IMAGE_SLOTS.find((s) => s.slot === r.id)?.label ?? String(r.id)) : r.name;
    entries.push({ type: r.type, id: r.id, name });
    out.set(r.k, entries);
  }
  return out;
}

// -------------------------------------------------------------------- list

export async function listMedia(c: Ctx): Promise<Page<MediaAsset>> {
  const limit = pageLimit(c.url);
  const cursor = decodeCursor(c.url.searchParams.get("cursor"), 1);
  const q = (c.url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const where: string[] = ["id < ?1"];
  const binds: unknown[] = [cursor ? cursor[0] : Number.MAX_SAFE_INTEGER];
  if (q) {
    where.push("(label LIKE ?2 ESCAPE '\\' OR alt LIKE ?2 ESCAPE '\\')");
    binds.push(likeTerm(q));
  }
  const { results } = await c.env.DB
    .prepare(`SELECT ${COLS} FROM media WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ?${binds.length + 1}`)
    .bind(...binds, limit + 1)
    .all<MediaRow>();
  const rows = results.slice(0, limit);
  const usage = await usageOf(c.env, rows.map((r) => r.key));
  return {
    items: rows.map((r) => toAsset(r, usage.get(r.key) ?? [])),
    nextCursor: results.length > limit ? encodeCursor([rows[rows.length - 1].id]) : null,
  };
}

async function loadAsset(c: Ctx, id: number): Promise<MediaAsset> {
  const row = await c.env.DB.prepare(`SELECT ${COLS} FROM media WHERE id = ?1`).bind(id).first<MediaRow>();
  if (!row) throw fail(404, "NOT_FOUND", "That photo was not found.");
  return toAsset(row, (await usageOf(c.env, [row.key])).get(row.key) ?? []);
}

// ------------------------------------------------------------------ upload

export async function uploadMedia(c: Ctx): Promise<Response> {
  const type = c.request.headers.get("Content-Type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data")) throw fail(415, "BAD_CONTENT_TYPE", "Upload photos as a form.");
  const bytes = await readBytes(c.request, MAX_TOTAL + 200_000);
  let form: FormData;
  try {
    form = await new Response(bytes.buffer as ArrayBuffer, { headers: { "Content-Type": type } }).formData();
  } catch {
    throw fail(400, "BAD_FORM", "That upload could not be read.");
  }

  let metaText: string | null = null;
  const files = new Map<number, Uint8Array>();
  let entries = 0;
  let total = 0;
  for (const [name, value] of form.entries()) {
    entries++;
    if (name === "meta" && typeof value === "string") {
      metaText = value;
      continue;
    }
    const m = /^w(\d{3,4})$/.exec(name);
    const width = m ? Number(m[1]) : 0;
    if (!m || !WIDTHS.includes(width) || typeof value === "string") throw fail(400, "BAD_FORM", "That upload has a part that is not allowed.", name);
    if (value.size > MAX_FILE) throw fail(413, "TOO_LARGE", "A photo is over 1.5 MB.", name);
    total += value.size;
    files.set(width, new Uint8Array(await value.arrayBuffer()));
  }
  if (entries !== files.size + 1 || metaText === null) throw fail(400, "BAD_FORM", "That upload is missing its details or repeats a size.");
  if (files.size > MAX_FILES) throw fail(413, "TOO_LARGE", "Too many sizes in one upload.");
  if (total > MAX_TOTAL) throw fail(413, "TOO_LARGE", "That upload is over 6 MB.");

  let metaRaw: unknown;
  try {
    metaRaw = JSON.parse(metaText.length > 2000 ? "" : metaText);
  } catch {
    throw fail(400, "BAD_FORM", "The photo details could not be read.", "meta");
  }
  if (typeof metaRaw !== "object" || metaRaw === null || Array.isArray(metaRaw)) throw fail(400, "BAD_FORM", "The photo details could not be read.", "meta");
  const meta = parse(metaRaw as Record<string, unknown>, { label: optText(80), alt: optText(200), width: int(1, 16384), height: int(1, 16384) }, ["width", "height"]);
  if (files.size < 2 && meta.width! >= 800) throw fail(400, "BAD_FORM", "Send at least two sizes.");
  if (files.size < 1) throw fail(400, "BAD_FORM", "No photo was sent.");

  // Real format and size from each file's own header; must match its name and the original's shape.
  const sorted = [...files.entries()].sort((a, b) => a[0] - b[0]);
  const ratio = meta.width! / meta.height!;
  let largest = { width: 0, height: 0 };
  for (const [width, data] of sorted) {
    const size = webpSize(data);
    if (!size) throw fail(400, "NOT_WEBP", "Only WebP photos are accepted.", `w${width}`);
    if (size.width > MAX_DIMENSION || size.height > MAX_DIMENSION) throw fail(400, "TOO_BIG", "A photo is larger than 4096 pixels.", `w${width}`);
    if (size.width !== width) throw fail(400, "BAD_SIZE", "A photo is not the width it says.", `w${width}`);
    if (Math.abs(size.width / size.height - ratio) / ratio > 0.02) throw fail(400, "BAD_SIZE", "The sizes are not the same shape.", `w${width}`);
    largest = size;
  }

  const hash = hex(await crypto.subtle.digest("SHA-256", sorted[sorted.length - 1][1] as BufferSource)).slice(0, 16);
  const key = `m/${hash}`;

  const [existing, usage] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT ${COLS} FROM media WHERE key = ?1`).bind(key),
    c.env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes FROM media"),
  ]);
  if (existing.results.length > 0) return Response.json(toAsset(existing.results[0] as MediaRow, (await usageOf(c.env, [key])).get(key) ?? []), { headers: { "Cache-Control": "no-store" } });
  const u = usage.results[0] as { n: number; bytes: number };
  if (u.n >= MAX_LIBRARY_ITEMS || u.bytes + total > MAX_LIBRARY_BYTES) throw fail(409, "LIBRARY_FULL", "The photo library is full. Delete photos that are not used.");

  const names = sorted.map(([width]) => `${key}-${width}.webp`);
  const widths = sorted.map(([w]) => w).join(",");
  try {
    for (const [width, data] of sorted) {
      await c.env.MEDIA.put(`${key}-${width}.webp`, data, {
        httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" },
      });
    }
    await c.env.DB
      .prepare("INSERT OR IGNORE INTO media (key, widths, width, height, bytes, label, alt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
      .bind(key, widths, largest.width, largest.height, total, meta.label ?? null, meta.alt ?? null)
      .run();
  } catch (e) {
    // Don't leave half an upload in R2.
    await c.env.MEDIA.delete(names).catch(() => undefined);
    throw e;
  }
  const row = await c.env.DB.prepare(`SELECT ${COLS} FROM media WHERE key = ?1`).bind(key).first<MediaRow>();
  audit(c, "media.upload", "media", row!.id, { key, bytes: total });
  return Response.json(toAsset(row!), { status: 201, headers: { "Cache-Control": "no-store" } });
}

// ---------------------------------------------------------- relabel, delete

export async function updateMedia(c: Ctx): Promise<MediaAsset> {
  const id = idParam(c.params[0]);
  const body = parse(await readJson(c.request), { label: nullable(optText(80)), alt: nullable(optText(200)) });
  const sets: [string, unknown][] = [];
  if (body.label !== undefined) sets.push(["label", body.label]);
  if (body.alt !== undefined) sets.push(["alt", body.alt]);
  if (sets.length === 0) throw fail(400, "INVALID", "Nothing to change.");
  const res = await c.env.DB
    .prepare(`UPDATE media SET ${sets.map(([col], i) => `${col} = ?${i + 2}`).join(", ")} WHERE id = ?1`)
    .bind(id, ...sets.map(([, v]) => v))
    .run();
  if (!res.meta.changes) throw fail(404, "NOT_FOUND", "That photo was not found.");
  await c.env.DB.prepare("UPDATE content_state SET version = version + 1, updated_at = datetime('now') WHERE id = 1").run();
  audit(c, "media.update", "media", id, { fields: sets.map(([col]) => col) });
  return loadAsset(c, id);
}

export async function deleteMedia(c: Ctx): Promise<Ok> {
  const id = idParam(c.params[0]);
  const row = await c.env.DB.prepare(`SELECT ${COLS} FROM media WHERE id = ?1`).bind(id).first<MediaRow>();
  if (!row) throw fail(404, "NOT_FOUND", "That photo was not found.");
  const usedBy = (await usageOf(c.env, [row.key])).get(row.key) ?? [];
  if (usedBy.length > 0) {
    throw fail(409, "MEDIA_IN_USE", "This photo is in use. Replace it where it is used, then delete it.", undefined, { usedBy });
  }
  await c.env.DB.prepare("DELETE FROM media WHERE id = ?1").bind(id).run();
  await c.env.MEDIA.delete(row.widths.split(",").map((w) => `${row.key}-${w}.webp`));
  audit(c, "media.delete", "media", id, { key: row.key });
  return { ok: true };
}

// ------------------------------------------------------------ public /m/*

const SERVED = /^\/m\/[0-9a-f]{16}-(480|640|800|1080|1200|1600|2048)\.webp$/;

/** Serves a photo from R2 (the ones the last build did not copy next to the pages). */
export async function serveMedia(request: Request, env: AdminEnv, pathname: string, exec?: ExecutionContext): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  if (!SERVED.test(pathname)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  // Edge cache: a photo URL never changes (its name holds the hash), so repeat views cost no R2 read.
  const cache = typeof caches !== "undefined" ? (caches as unknown as { default?: Cache }).default : undefined;
  const cacheKey = new Request(new URL(pathname, request.url).toString(), { method: "GET" });
  if (cache && request.method === "GET" && !request.headers.has("If-None-Match")) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }
  const object = await env.MEDIA.get(pathname.slice(1));
  if (!object) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const headers = new Headers({
    "Content-Type": "image/webp",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    ETag: object.httpEtag,
  });
  if (request.headers.get("If-None-Match") === object.httpEtag) {
    await object.body.cancel();
    return new Response(null, { status: 304, headers });
  }
  headers.set("Content-Length", String(object.size));
  const response = new Response(request.method === "HEAD" ? null : object.body, { headers });
  if (cache && exec && request.method === "GET") exec.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
  return response;
}