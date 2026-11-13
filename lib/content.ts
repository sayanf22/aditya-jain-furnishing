// Reads the site content from D1. Pages call these during `next build`
// (they are pre-rendered), so visitors never wait on the database.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { ContactInfo } from "./contact";

async function db() {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}

export type Subcategory = { id: number; slug: string; name: string };
export type Category = {
  id: number;
  slug: string;
  name: string;
  tagline: string | null;
  imageKey: string | null;
  subcategories: Subcategory[];
};

export type HeroSlide = { image: string; alt: string; title: string; cta: string; href: string };
export type DecorOption = {
  id: number;
  name: string;
  swatchKey: string;
  imageKey: string;
  width: number;
  height: number;
};
export type DecorScene = { id: number; name: string; options: DecorOption[] };
export type LookHotspot = {
  id: number;
  x: number;
  y: number;
  name: string;
  categoryName: string | null;
  categorySlug: string | null;
};
export type Look = { id: number; title: string; imageKey: string; hotspots: LookHotspot[] };
export type Testimonial = { id: number; name: string; text: string };

export type HomeContent = {
  contact: ContactInfo;
  heroSlides: HeroSlide[];
  categories: Category[];
  decor: DecorScene | null;
  looks: Look[];
  testimonials: Testimonial[];
};

function parseSlides(raw: string | undefined): HeroSlide[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((s) => s && s.image && s.title) : [];
  } catch {
    return [];
  }
}

export async function getSettings(): Promise<Record<string, string>> {
  const { results } = await (await db())
    .prepare("SELECT key, value FROM settings")
    .all<{ key: string; value: string }>();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}

export function contactFrom(settings: Record<string, string>): ContactInfo {
  return {
    businessName: settings.business_name ?? "Delta Furnishings",
    legalName: settings.legal_name ?? settings.business_name ?? "Delta Furnishings",
    addressLine1: settings.address_line1 ?? "",
    addressLine2: settings.address_line2 ?? "",
    phone: settings.phone ?? null,
    phoneDisplay: settings.phone_display ?? settings.phone ?? null,
    gstin: settings.gstin ?? null,
    whatsappNumber: settings.whatsapp_number ?? null,
    instagramHandle: settings.instagram_handle ?? null,
  };
}

export async function getCategories(): Promise<Category[]> {
  const database = await db();
  const [cats, subs] = await database.batch([
    database.prepare(
      "SELECT id, slug, name, tagline, image_key FROM categories ORDER BY position, id",
    ),
    database.prepare(
      `SELECT id, category_id, slug, name FROM subcategories
       WHERE parent_id IS NULL AND visible = 1 ORDER BY position, id`,
    ),
  ]);
  const subRows = subs.results as { id: number; category_id: number; slug: string; name: string }[];
  return (cats.results as { id: number; slug: string; name: string; tagline: string | null; image_key: string | null }[]).map(
    (c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      tagline: c.tagline,
      imageKey: c.image_key,
      subcategories: subRows
        .filter((s) => s.category_id === c.id)
        .map((s) => ({ id: s.id, slug: s.slug, name: s.name })),
    }),
  );
}

export async function getHomeContent(): Promise<HomeContent> {
  const database = await db();
  const [settings, categories] = await Promise.all([getSettings(), getCategories()]);

  const [scenes, options, looks, hotspots, testimonials] = await database.batch([
    database.prepare("SELECT id, name FROM decor_scenes WHERE visible = 1 ORDER BY position, id LIMIT 1"),
    database.prepare(
      `SELECT o.id, o.scene_id, o.name, o.swatch_image_key, o.result_image_key, o.width, o.height
       FROM decor_options o ORDER BY o.position, o.id`,
    ),
    database.prepare("SELECT id, title, image_key FROM looks WHERE visible = 1 ORDER BY position, id"),
    database.prepare(
      `SELECT h.id, h.look_id, h.x, h.y, h.name, c.name AS category_name, c.slug AS category_slug
       FROM look_hotspots h LEFT JOIN categories c ON c.id = h.category_id
       ORDER BY h.position, h.id`,
    ),
    database.prepare("SELECT id, name, text FROM testimonials WHERE visible = 1 ORDER BY position, id"),
  ]);

  const spotRows = hotspots.results as {
    id: number;
    look_id: number;
    x: number;
    y: number;
    name: string;
    category_name: string | null;
    category_slug: string | null;
  }[];

  const scene = (scenes.results as { id: number; name: string }[])[0];
  const sceneOptions = scene
    ? (options.results as {
        id: number;
        scene_id: number;
        name: string;
        swatch_image_key: string;
        result_image_key: string;
        width: number;
        height: number;
      }[])
        .filter((o) => o.scene_id === scene.id)
        .map((o) => ({
          id: o.id,
          name: o.name,
          swatchKey: o.swatch_image_key,
          imageKey: o.result_image_key,
          width: o.width,
          height: o.height,
        }))
    : [];

  return {
    contact: contactFrom(settings),
    heroSlides: parseSlides(settings.hero_slides),
    categories,
    decor: scene && sceneOptions.length > 0 ? { id: scene.id, name: scene.name, options: sceneOptions } : null,
    looks: (looks.results as { id: number; title: string; image_key: string }[])
      .map((l) => ({
        id: l.id,
        title: l.title,
        imageKey: l.image_key,
        hotspots: spotRows
          .filter((h) => h.look_id === l.id)
          .map((h) => ({
            id: h.id,
            x: h.x,
            y: h.y,
            name: h.name,
            categoryName: h.category_name,
            categorySlug: h.category_slug,
          })),
      }))
      .filter((l) => l.hotspots.length > 0),
    testimonials: testimonials.results as Testimonial[],
  };
}

export type GalleryItem = {
  id: number;
  title: string;
  imageKey: string;
  width: number;
  height: number;
  categorySlug: string | null;
  categoryName: string | null;
};

export async function getGallery(): Promise<GalleryItem[]> {
  const { results } = await (await db())
    .prepare(
      `SELECT g.id, g.title, g.image_key, g.width, g.height, c.slug AS category_slug, c.name AS category_name
       FROM gallery_items g LEFT JOIN categories c ON c.id = g.category_id
       WHERE g.visible = 1 ORDER BY g.position, g.id`,
    )
    .all<{
      id: number;
      title: string;
      image_key: string;
      width: number;
      height: number;
      category_slug: string | null;
      category_name: string | null;
    }>();
  return results.map((r) => ({
    id: r.id,
    title: r.title,
    imageKey: r.image_key,
    width: r.width,
    height: r.height,
    categorySlug: r.category_slug,
    categoryName: r.category_name,
  }));
}
