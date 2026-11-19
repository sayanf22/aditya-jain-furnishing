// Site pages: photo places, business details, testimonials.
import { SITE_IMAGE_SLOTS, type Ok, type SiteImage, type SiteSettings, type Testimonial } from "../admin-api";
import { audit } from "./audit";
import type { Ctx } from "./context";
import { bool, fail, idList, idParam, nullable, optText, parse, readJson, text, type Rule } from "./http";
import { toAsset } from "./media";
import { applyOrder, bit, bumpVersion, checkImageKey } from "./shared";

// ------------------------------------------------------------------ photos

type SlotRow = { slot: string; media_key: string | null; alt: string | null; mid: number | null; mkey: string | null; widths: string | null; width: number | null; height: number | null; bytes: number | null; label: string | null; malt: string | null; created_at: string | null };

export async function listSiteImages(c: Ctx): Promise<{ slots: SiteImage[] }> {
  const { results } = await c.env.DB
    .prepare(
      `SELECT s.slot, s.media_key, s.alt, m.id AS mid, m.key AS mkey, m.widths, m.width, m.height, m.bytes, m.label, m.alt AS malt, m.created_at
         FROM site_images s LEFT JOIN media m ON m.key = s.media_key`,
    )
    .all<SlotRow>();
  const rows = new Map(results.map((r) => [r.slot, r]));
  return { slots: SITE_IMAGE_SLOTS.map((def) => slotImage(def, rows.get(def.slot))) };
}

function slotImage(def: (typeof SITE_IMAGE_SLOTS)[number], r: SlotRow | undefined): SiteImage {
  const media =
    r?.mid != null
      ? toAsset({ id: r.mid, key: r.mkey!, widths: r.widths!, width: r.width!, height: r.height!, bytes: r.bytes!, label: r.label, alt: r.malt, created_at: r.created_at! }, [{ type: "site", id: def.slot, name: def.label }])
      : null;
  return { ...def, mediaKey: r?.media_key ?? null, alt: r?.alt ?? null, media };
}

export async function setSiteImage(c: Ctx): Promise<SiteImage> {
  const slot = c.params[0];
  const def = SITE_IMAGE_SLOTS.find((s) => s.slot === slot);
  if (!def) throw fail(404, "NOT_FOUND", "That place was not found.");
  const body = parse(await readJson(c.request), { mediaKey: nullable(text(120, 1)), alt: optText(200) }, ["mediaKey"]);
  const key = body.mediaKey ?? null;
  if (key !== null) {
    if (!key.startsWith("m/")) throw fail(400, "INVALID", "Pick a photo from the library.", "mediaKey");
    await checkImageKey(c, key, "mediaKey");
    const media = await c.env.DB.prepare("SELECT width FROM media WHERE key = ?1").bind(key).first<{ width: number }>();
    const needed = Math.min(...def.widths);
    if (media && media.width < needed) throw fail(400, "TOO_SMALL", `This photo is too small for this place. Use one at least ${needed} pixels wide.`, "mediaKey");
  }
  await c.env.DB.batch([
    c.env.DB
      .prepare("INSERT INTO site_images (slot, media_key, alt, updated_at) VALUES (?1, ?2, ?3, datetime('now')) ON CONFLICT (slot) DO UPDATE SET media_key = ?2, alt = ?3, updated_at = datetime('now')")
      .bind(slot, key, key === null ? null : (body.alt ?? null)),
    bumpVersion(c),
  ]);
  audit(c, "site.image", "site_image", slot, { mediaKey: key });
  const { slots } = await listSiteImages(c);
  return slots.find((s) => s.slot === slot)!;
}

// ---------------------------------------------------------------- settings

const phone: Rule<string> = (value, field) => {
  let digits = text(30, 1)(value, field).replace(/[\s()-]/g, "").replace(/^\+/, "");
  if (/^[6-9]\d{9}$/.test(digits)) digits = `91${digits}`;
  if (!/^\d{11,15}$/.test(digits)) throw fail(400, "INVALID", "Enter the number with country code, for example 919212456021.", field);
  return digits;
};
const gstin: Rule<string> = (value, field) => {
  const v = text(15)(value, field).toUpperCase();
  if (v !== "" && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v)) throw fail(400, "INVALID", "This GSTIN is not in the right format.", field);
  return v;
};
const instagram: Rule<string> = (value, field) => {
  const v = text(31)(value, field).replace(/^@/, "");
  if (v !== "" && !/^[A-Za-z0-9._]{1,30}$/.test(v)) throw fail(400, "INVALID", "Use only letters, numbers, dots and underscores.", field);
  return v;
};

const SETTINGS_SPEC = {
  businessName: text(80, 1),
  legalName: text(120, 1),
  addressLine1: text(120),
  addressLine2: text(120),
  phone,
  phoneDisplay: text(30, 1),
  gstin,
  instagramHandle: instagram,
};

async function readSettings(c: Ctx): Promise<SiteSettings> {
  const { results } = await c.env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const s = Object.fromEntries(results.map((r) => [r.key, r.value]));
  return {
    businessName: s.business_name ?? "",
    legalName: s.legal_name ?? "",
    addressLine1: s.address_line1 ?? "",
    addressLine2: s.address_line2 ?? "",
    phone: (s.whatsapp_number ?? s.phone ?? "").replace(/\D/g, ""),
    phoneDisplay: s.phone_display ?? "",
    gstin: s.gstin ?? "",
    instagramHandle: s.instagram_handle ?? "",
  };
}

export const getSettings = readSettings;

export async function updateSettings(c: Ctx): Promise<SiteSettings> {
  const body = parse(await readJson(c.request), SETTINGS_SPEC);
  const writes: [string, string][] = [];
  if (body.businessName !== undefined) writes.push(["business_name", body.businessName]);
  if (body.legalName !== undefined) writes.push(["legal_name", body.legalName]);
  if (body.addressLine1 !== undefined) writes.push(["address_line1", body.addressLine1]);
  if (body.addressLine2 !== undefined) writes.push(["address_line2", body.addressLine2]);
  // One number for calls and messages: +digits for calls, digits for message links.
  if (body.phone !== undefined) writes.push(["phone", `+${body.phone}`], ["whatsapp_number", body.phone]);
  if (body.phoneDisplay !== undefined) writes.push(["phone_display", body.phoneDisplay]);
  if (body.gstin !== undefined) writes.push(["gstin", body.gstin]);
  if (body.instagramHandle !== undefined) writes.push(["instagram_handle", body.instagramHandle]);
  if (writes.length === 0) throw fail(400, "INVALID", "Nothing to change.");
  const upsert = c.env.DB.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value");
  const remove = c.env.DB.prepare("DELETE FROM settings WHERE key = ?1");
  // GSTIN and Instagram are optional: empty means the line is left out.
  await c.env.DB.batch([...writes.map(([k, v]) => (v === "" && (k === "gstin" || k === "instagram_handle") ? remove.bind(k) : upsert.bind(k, v))), bumpVersion(c)]);
  audit(c, "site.settings", "settings", undefined, { fields: writes.map(([k]) => k) });
  return readSettings(c);
}

// ------------------------------------------------------------ testimonials

type TestimonialRow = { id: number; name: string; text: string; position: number; visible: number };
const toTestimonial = (r: TestimonialRow): Testimonial => ({ id: r.id, name: r.name, text: r.text, position: r.position, visible: r.visible === 1 });
const MAX_TESTIMONIALS = 30;

export async function listTestimonials(c: Ctx): Promise<{ items: Testimonial[] }> {
  const { results } = await c.env.DB.prepare("SELECT id, name, text, position, visible FROM testimonials ORDER BY position, id").all<TestimonialRow>();
  return { items: results.map(toTestimonial) };
}

async function oneTestimonial(c: Ctx, id: number): Promise<Testimonial> {
  const row = await c.env.DB.prepare("SELECT id, name, text, position, visible FROM testimonials WHERE id = ?1").bind(id).first<TestimonialRow>();
  if (!row) throw fail(404, "NOT_FOUND", "That testimonial was not found.");
  return toTestimonial(row);
}

export async function createTestimonial(c: Ctx): Promise<Testimonial> {
  const body = parse(await readJson(c.request), { name: text(80, 1), text: text(500, 1) }, ["name", "text"]);
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM testimonials").first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_TESTIMONIALS) throw fail(409, "LIMIT", `Keep it to ${MAX_TESTIMONIALS} testimonials.`);
  const [res] = await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO testimonials (name, text, position) VALUES (?1, ?2, (SELECT COALESCE(MAX(position), 0) + 1 FROM testimonials))").bind(body.name, body.text),
    bumpVersion(c),
  ]);
  audit(c, "testimonial.create", "testimonial", res.meta.last_row_id);
  return oneTestimonial(c, res.meta.last_row_id);
}

export async function updateTestimonial(c: Ctx): Promise<Testimonial> {
  const id = idParam(c.params[0]);
  const body = parse(await readJson(c.request), { name: text(80, 1), text: text(500, 1), visible: bool });
  const sets: [string, unknown][] = [];
  if (body.name !== undefined) sets.push(["name", body.name]);
  if (body.text !== undefined) sets.push(["text", body.text]);
  if (body.visible !== undefined) sets.push(["visible", bit(body.visible)]);
  if (sets.length === 0) throw fail(400, "INVALID", "Nothing to change.");
  const [res] = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE testimonials SET ${sets.map(([col], i) => `${col} = ?${i + 2}`).join(", ")} WHERE id = ?1`).bind(id, ...sets.map(([, v]) => v)),
    bumpVersion(c),
  ]);
  if (!res.meta.changes) throw fail(404, "NOT_FOUND", "That testimonial was not found.");
  audit(c, "testimonial.update", "testimonial", id);
  return oneTestimonial(c, id);
}

export async function deleteTestimonial(c: Ctx): Promise<Ok> {
  const id = idParam(c.params[0]);
  const [res] = await c.env.DB.batch([c.env.DB.prepare("DELETE FROM testimonials WHERE id = ?1").bind(id), bumpVersion(c)]);
  if (!res.meta.changes) throw fail(404, "NOT_FOUND", "That testimonial was not found.");
  audit(c, "testimonial.delete", "testimonial", id);
  return { ok: true };
}

export async function reorderTestimonials(c: Ctx): Promise<Ok> {
  const body = parse(await readJson(c.request), { ids: idList() }, ["ids"]);
  const { results } = await c.env.DB.prepare("SELECT id FROM testimonials").all<{ id: number }>();
  await applyOrder(c, "testimonials", body.ids!, results.map((r) => r.id));
  audit(c, "testimonial.reorder", "testimonial");
  return { ok: true };
}
