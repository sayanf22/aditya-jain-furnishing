// Collection (agreement §02: "Browse by category and subcategory, with
// images and descriptions"). A photo header, then the same layout as every
// page inside: the collection tree on the left (a "Browse collections" bar
// on phones), how browsing works in three steps, and the five categories,
// each with a clear description. The designs themselves sit on the pages
// with no types inside, so this page stays simple (15 Nov 2026).
// Pre-rendered at build time from D1.
import type { Metadata } from "next";
import { CollectionMenu, CollectionSidebar, TypeCards } from "@/components/collection/CollectionParts";
import { PageHero } from "@/components/PageHero";
import { getCatalogue } from "@/lib/catalogue";
import { getSettings } from "@/lib/content";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Collection",
  description: "Upholstery, curtains & blinds, carpets & mats, wallpapers and cushions at Delta Furnishings, Kirti Nagar, New Delhi.",
};

const STEPS = ["Pick a collection", "Choose a type", "Tap a design to see it large, then enquire"];

export default async function CollectionPage() {
  const [catalogue, settings] = await Promise.all([getCatalogue(), getSettings()]);
  const categories = catalogue.categories;

  return (
    <main>
      <PageHero
        id="collection-title"
        label="Collection"
        title={["Browse", { accent: "the collection" }]}
        intro="Upholstery, curtains and blinds, carpets and mats, wallpapers and cushions."
        image={settings.collection_hero_image ?? null}
        alt="A furnished living room"
        size="short"
      />

      <div className="shell py-12 sm:py-16 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-14 xl:grid-cols-[17rem_minmax(0,1fr)] xl:gap-20">
          <CollectionSidebar categories={categories} current="/collection" />

          <div className="min-w-0">
            <CollectionMenu categories={categories} current="/collection" here="All five collections" />

            <section className="mt-8 border-b border-ink/10 pb-8 sm:pb-10 lg:mt-0" aria-label="How to browse">
              <h2 className="text-[1.15rem] font-medium sm:text-[1.3rem]">How to browse</h2>
              <ol className="mt-5 grid gap-3 sm:grid-cols-3 sm:gap-4">
                {STEPS.map((s, i) => (
                  <li key={s} className="flex items-center gap-3 rounded-2xl bg-sand px-4 py-3.5 text-[0.92rem] text-ink-soft">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-terracotta text-[0.78rem] font-semibold text-white">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </section>

            <section className="pt-10 sm:pt-12" aria-labelledby="cats-title">
              <h2 id="cats-title" className="text-[1.15rem] font-medium sm:text-[1.3rem]">
                Five collections
              </h2>
              <TypeCards nodes={categories} headingId="cats-title" />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
