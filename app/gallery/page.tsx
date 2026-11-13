// Gallery: products and décor, with zoom and search (agreement §02).
// Pre-rendered at build time from D1; the filter and search run in the
// browser, so a visit costs one cached page request.
import type { Metadata } from "next";
import { Gallery } from "@/components/gallery/Gallery";
import { Words } from "@/components/Words";
import { whatsappLink } from "@/lib/contact";
import { contactFrom, getCategories, getGallery, getSettings } from "@/lib/content";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Gallery",
  description:
    "Photos of curtains & blinds, upholstery fabric, carpets & mats, cushions and wallpaper. Filter, search and tap a photo to enquire. Delta Furnishings, Kirti Nagar, New Delhi.",
};

export default async function GalleryPage() {
  const [settings, categories, items] = await Promise.all([getSettings(), getCategories(), getGallery()]);
  const contact = contactFrom(settings);

  return (
    <main className="pt-16 sm:pt-20">
      <section className="shell pt-12 pb-20 sm:pt-16 sm:pb-28 lg:pt-20" aria-labelledby="gallery-title">
        <div className="max-w-2xl">
          <p className="section-label hero-rise">
            Gallery
          </p>
          <h1 id="gallery-title" className="mt-3 text-[2.1rem] leading-[1.1] font-medium sm:text-[2.8rem] lg:text-[3.3rem]">
            <Words parts={["Ideas for", { accent: "every room" }]} mode="auto" />
          </h1>
          <p className="mt-4 max-w-lg text-[1.02rem] leading-relaxed text-ink-soft hero-rise" style={{ ["--rise-delay" as string]: 2 }}>
            Browse by category or search. Tap a photo to see it larger and enquire about it.
          </p>
        </div>

        <div className="mt-10 sm:mt-12">
          {items.length > 0 ? (
            <Gallery
              items={items}
              categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
              whatsappBase={whatsappLink(contact)}
              businessName={contact.businessName}
            />
          ) : (
            <p className="py-20 text-center text-[1.05rem] text-muted">Photos are on their way.</p>
          )}
        </div>
      </section>
    </main>
  );
}
