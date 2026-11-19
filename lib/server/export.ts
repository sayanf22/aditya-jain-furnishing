// GET /api/content/export: what the site build needs, visible content only.
// Called by scripts/sync-content.mjs with Authorization: Bearer EXPORT_TOKEN.
// Never returns users, sessions, enquiries or the audit log.
import type { ContentExport } from "../admin-api";
import { safeEqual, secretOk } from "./crypto";
import type { AdminEnv } from "./env";
import { API_HEADERS } from "./http";

const PUBLIC_SETTINGS = ["business_name", "legal_name", "address_line1", "address_line2", "phone", "phone_display", "whatsapp_number", "gstin", "instagram_handle", "hero_slides"];

const reply = (status: number, body: unknown, extra?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...API_HEADERS, ...extra } });

export async function handleExport(request: Request, env: AdminEnv, ip: string): Promise<Response> {
  if (request.method !== "GET") return reply(405, { error: { code: "METHOD", message: "Use GET." } }, { Allow: "GET" });
  const token = env.EXPORT_TOKEN ?? "";
  if (!secretOk(token, 32)) return reply(503, { error: { code: "NOT_CONFIGURED", message: "Export is not set up." } });
  if (env.ADMIN_LIMITER) {
    const { success } = await env.ADMIN_LIMITER.limit({ key: `export:${ip}` });
    if (!success) return reply(429, { error: { code: "SLOW_DOWN", message: "Too many requests." } }, { "Retry-After": "60" });
  }
  const sent = /^Bearer (.+)$/.exec(request.headers.get("Authorization") ?? "")?.[1] ?? "";
  if (!safeEqual(sent, token)) return reply(401, { error: { code: "UNAUTHORIZED", message: "Not allowed." } }, { "WWW-Authenticate": "Bearer" });

  const db = env.DB;
  // A type is shown only if it and every type above it, and its collection, are visible.
  const subs = `WITH RECURSIVE shown(id) AS (
      SELECT s.id FROM subcategories s JOIN categories c ON c.id = s.category_id WHERE s.parent_id IS NULL AND s.visible = 1 AND c.visible = 1
      UNION ALL SELECT s.id FROM subcategories s JOIN shown ON s.parent_id = shown.id WHERE s.visible = 1)`;
  const shownProducts = `FROM products p JOIN categories c ON c.id = p.category_id AND c.visible = 1
      WHERE p.visible = 1 AND (p.subcategory_id IS NULL OR p.subcategory_id IN (SELECT id FROM shown))
        AND EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)`;

  const [state, categories, subcategories, products, images, siteImages, settings, testimonials] = await db.batch([
    db.prepare("SELECT version FROM content_state WHERE id = 1"),
    db.prepare("SELECT id, slug, name, tagline, image_key, hero_image_key, position FROM categories WHERE visible = 1 ORDER BY position, id"),
    db.prepare(`${subs} SELECT id, category_id, parent_id, slug, name, description, image_key, position FROM subcategories WHERE id IN (SELECT id FROM shown) ORDER BY position, id`),
    db.prepare(`${subs} SELECT p.id, p.category_id, p.subcategory_id, p.slug, p.name, p.description, p.position ${shownProducts} ORDER BY p.position, p.id`),
    db.prepare(`${subs} SELECT i.id, i.product_id, i.image_key, i.width, i.height, i.alt, i.position FROM product_images i WHERE i.product_id IN (SELECT p.id ${shownProducts}) ORDER BY i.position, i.id`),
    db.prepare("SELECT slot, media_key, alt FROM site_images"),
    // Only the public business details, so a future private setting can't leave through the export.
    db.prepare(`SELECT key, value FROM settings WHERE key IN (${PUBLIC_SETTINGS.map(() => "?").join(", ")})`).bind(...PUBLIC_SETTINGS),
    db.prepare("SELECT id, name, text, position FROM testimonials WHERE visible = 1 ORDER BY position, id"),
  ]);

  const payload: ContentExport = {
    version: (state.results[0] as { version: number }).version,
    exportedAt: new Date().toISOString(),
    categories: categories.results as ContentExport["categories"],
    subcategories: subcategories.results as ContentExport["subcategories"],
    products: products.results as ContentExport["products"],
    product_images: images.results as ContentExport["product_images"],
    media: [],
    site_images: siteImages.results as ContentExport["site_images"],
    settings: settings.results as ContentExport["settings"],
    testimonials: testimonials.results as ContentExport["testimonials"],
  };

  // Library details for every uploaded photo the exported rows point to.
  const keys = new Set<string>();
  const note = (k: string | null | undefined) => {
    if (k && k.startsWith("m/")) keys.add(k);
  };
  payload.categories.forEach((r) => (note(r.image_key), note(r.hero_image_key)));
  payload.subcategories.forEach((r) => note(r.image_key));
  payload.product_images.forEach((r) => note(r.image_key));
  payload.site_images.forEach((r) => note(r.media_key));
  if (keys.size > 0) {
    const { results } = await db
      .prepare("SELECT key, widths, width, height, alt FROM media WHERE key IN (SELECT value FROM json_each(?1))")
      .bind(JSON.stringify([...keys]))
      .all();
    payload.media = results as ContentExport["media"];
  }
  return new Response(JSON.stringify(payload), { headers: API_HEADERS });
}
