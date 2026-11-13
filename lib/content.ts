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
export type RoomSlug = "wall" | "curtains" | "blind" | "sofa" | "armchair" | "cushions" | "rug";
export type RoomOption = {
  id: number;
  name: string;
  description: string | null;
  textureKey: string;
  tile: number;
  colour: string;
};
export type RoomElement = {
  id: number;
  slug: RoomSlug;
  name: string;
  description: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  options: RoomOption[];
};
export type Testimonial = { id: number; name: string; text: string };

export type HomeContent = {
  contact: ContactInfo;
  heroSlides: HeroSlide[];
  categories: Category[];
  room: RoomElement[];
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

  const [elements, options, testimonials] = await database.batch([
    database.prepare(
      `SELECT e.id, e.slug, e.name, e.description, c.name AS category_name, c.slug AS category_slug
       FROM room_elements e LEFT JOIN categories c ON c.id = e.category_id
       WHERE e.visible = 1 ORDER BY e.position, e.id`,
    ),
    database.prepare(
      `SELECT id, element_id, name, description, texture_key, tile, colour
       FROM room_options WHERE visible = 1 ORDER BY position, id`,
    ),
    database.prepare("SELECT id, name, text FROM testimonials WHERE visible = 1 ORDER BY position, id"),
  ]);

  const optionRows = options.results as {
    id: number;
    element_id: number;
    name: string;
    description: string | null;
    texture_key: string;
    tile: number;
    colour: string;
  }[];

  const room = (
    elements.results as {
      id: number;
      slug: RoomSlug;
      name: string;
      description: string | null;
      category_name: string | null;
      category_slug: string | null;
    }[]
  ).map((e) => ({
    id: e.id,
    slug: e.slug,
    name: e.name,
    description: e.description,
    categoryName: e.category_name,
    categorySlug: e.category_slug,
    options: optionRows
      .filter((o) => o.element_id === e.id)
      .map((o) => ({
        id: o.id,
        name: o.name,
        description: o.description,
        textureKey: o.texture_key,
        tile: o.tile,
        colour: o.colour,
      })),
  }));

  return {
    contact: contactFrom(settings),
    heroSlides: parseSlides(settings.hero_slides),
    categories,
    room,
    testimonials: testimonials.results as Testimonial[],
  };
}
