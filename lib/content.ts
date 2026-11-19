// Reads the site content from D1. Pages call these during `next build`
// (they are pre-rendered), so visitors never wait on the database.
// Collections come from lib/catalogue.ts, the single place that reads them.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SITE_IMAGE_SLOTS } from "./admin-api";
import { getCatalogue, getMediaIndex } from "./catalogue";
import type { ContactInfo } from "./contact";
import { imageSource, type ImageSource } from "./media";

async function db() {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}

export type Subcategory = { id: number; slug: string; name: string; href: string };
export type Category = {
  id: number;
  slug: string;
  name: string;
  href: string;
  tagline: string | null;
  image: ImageSource | null;
  /** First level of types inside it. */
  subcategories: Subcategory[];
};

export type HeroSlide = { image: ImageSource; alt: string; title: string; cta: string; href: string };
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

type SlideText = { image?: string; alt?: string; title?: string; cta?: string; href?: string };

/** Optional hand-written slide texts (settings.hero_slides), matched by link. */
function parseSlides(raw: string | undefined): SlideText[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((s): s is SlideText => !!s && typeof s === "object") : [];
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

/** The collections for the Home page, footer, About and the enquiry forms. */
export async function getCategories(): Promise<Category[]> {
  const { categories } = await getCatalogue();
  return categories.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    href: c.href,
    tagline: c.tagline,
    image: c.image,
    subcategories: c.children.map((s) => ({ id: s.id, slug: s.slug, name: s.name, href: s.href })),
  }));
}

// ------------------------------------------------------------ photo places
// Every place on the site with a replaceable photo (SITE_IMAGE_SLOTS in
// lib/admin-api.ts). A photo chosen in the dashboard (site_images) wins; the
// stand-in below shows until then. The Home slides take their stand-in from
// the collection they link to, so they follow the collections.

const STAND_INS: Record<string, string> = {
  "collection.hero": "demo/sc-collection",
  "about.hero": "demo/about-hero",
  "about.story": "demo/about-story",
  "about.showroom": "demo/about-showroom",
  "about.band": "demo/about-band",
  "contact.hero": "demo/contact-hero",
  "contact.showroom": "demo/about-showroom",
};
const HERO_SLOT = /^home\.hero\.(\d+)$/;

export type SitePhoto = { image: ImageSource | null; alt: string | null };
export type SitePhotos = (slot: string) => SitePhoto;

async function loadSitePhotos(): Promise<SitePhotos> {
  for (const { slot } of SITE_IMAGE_SLOTS) {
    if (!HERO_SLOT.test(slot) && !(slot in STAND_INS)) {
      throw new Error(`lib/content.ts has no stand-in for the photo place "${slot}" (see SITE_IMAGE_SLOTS).`);
    }
  }
  const database = await db();
  const [rows, media] = await Promise.all([
    database.prepare("SELECT slot, media_key, alt FROM site_images WHERE media_key IS NOT NULL").all<{ slot: string; media_key: string; alt: string | null }>(),
    getMediaIndex(),
  ]);
  const chosen = new Map(rows.results.map((r) => [r.slot, r]));
  return (slot) => {
    const row = chosen.get(slot);
    // A chosen photo that can't be found falls back to the stand-in.
    const image = (row && imageSource(row.media_key, media)) || imageSource(STAND_INS[slot], media);
    return { image, alt: row?.alt ?? null };
  };
}

/** The photos for the places in SITE_IMAGE_SLOTS (other than the Home slides). */
export function getSitePhotos(): Promise<SitePhotos> {
  return process.env.NODE_ENV === "production" ? (sitePhotos ??= loadSitePhotos()) : loadSitePhotos();
}
let sitePhotos: Promise<SitePhotos> | null = null;

/** The Home slides: one for each of the first collections that has a slide place. */
async function getHeroSlides(categories: Category[], settings: Record<string, string>): Promise<HeroSlide[]> {
  const [photos, catalogue, media] = await Promise.all([getSitePhotos(), getCatalogue(), getMediaIndex()]);
  const texts = parseSlides(settings.hero_slides);
  const places = SITE_IMAGE_SLOTS.filter((s) => HERO_SLOT.test(s.slot));
  const slides: HeroSlide[] = [];
  places.forEach((place, i) => {
    const category = categories[i];
    if (!category) return;
    const text = texts.find((t) => t.href === category.href);
    const own = catalogue.categories.find((c) => c.id === category.id);
    const photo = photos(place.slot);
    // Chosen photo, then the slide's own stand-in, then the collection's photos.
    const image = photo.image ?? imageSource(text?.image, media) ?? own?.heroImage ?? category.image;
    if (!image) return;
    slides.push({
      image,
      alt: photo.alt ?? text?.alt ?? category.name,
      title: text?.title ?? headline(category),
      cta: text?.cta ?? `Explore ${category.name}`,
      href: category.href,
    });
  });
  return slides;
}

/** First sentence of the collection's description, or its name. */
function headline(category: Category): string {
  const first = category.tagline?.split(/(?<=[.!?])\s/)[0]?.trim();
  return first && first.length <= 80 ? first : category.name;
}

// ------------------------------------------------------------ text helpers
// Words that mention the collections are built from the database, so they
// stay right when a collection is added, renamed or hidden.

/** "A", "A and B", "A, B and C". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** "Five collections", "One collection". */
export function collectionCount(n: number): string {
  const word = NUMBER_WORDS[n] ?? String(n);
  const text = `${word} ${n === 1 ? "collection" : "collections"}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Collection names in running text: lower case, in order ("curtains & blinds"). */
export const namesInText = (categories: { name: string }[]) => listNames(categories.map((c) => c.name.toLowerCase()));

export const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
export async function getHomeContent(): Promise<HomeContent> {
  const database = await db();
  const [settings, categories] = await Promise.all([getSettings(), getCategories()]);
  const heroSlides = await getHeroSlides(categories, settings);

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
    heroSlides,
    categories,
    room,
    testimonials: testimonials.results as Testimonial[],
  };
}
