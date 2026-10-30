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
export type WatchItem = { id: number; title: string; videoKey: string; posterKey: string };
export type Testimonial = { id: number; name: string; text: string };

export type HomeContent = {
  contact: ContactInfo;
  heroSlides: HeroSlide[];
  categories: Category[];
  decor: DecorScene | null;
  watch: WatchItem[];
  testimonials: Testimonial[];
  enquiryImageKey: string | null;
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

  const [scenes, options, watch, testimonials] = await database.batch([
    database.prepare("SELECT id, name FROM decor_scenes WHERE visible = 1 ORDER BY position, id LIMIT 1"),
    database.prepare(
      `SELECT o.id, o.scene_id, o.name, o.swatch_image_key, o.result_image_key, o.width, o.height
       FROM decor_options o ORDER BY o.position, o.id`,
    ),
    database.prepare(
      "SELECT id, title, video_key, poster_image_key FROM watch_items WHERE visible = 1 ORDER BY position, id",
    ),
    database.prepare("SELECT id, name, text FROM testimonials WHERE visible = 1 ORDER BY position, id"),
  ]);

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
    watch: (watch.results as { id: number; title: string; video_key: string; poster_image_key: string }[]).map((w) => ({
      id: w.id,
      title: w.title,
      videoKey: w.video_key,
      posterKey: w.poster_image_key,
    })),
    testimonials: testimonials.results as Testimonial[],
    enquiryImageKey: settings.enquiry_image ?? null,
  };
}
