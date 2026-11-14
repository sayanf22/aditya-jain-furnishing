// Collection (agreement §02: "Browse by category and subcategory, with
// images and descriptions"). The five categories, each with what's inside,
// and how browsing works in three steps. The designs themselves live on
// the category pages, so this page stays calm (15 Nov 2026: "less images,
// clean and understandable"). Pre-rendered at build time from D1.
import type { Metadata } from "next";
import { NodeTilesHeading } from "@/components/collection/NodeTilesHeading";
import { ArrowRightIcon } from "@/components/icons";
import { PageHero } from "@/components/PageHero";
import { RevealImage } from "@/components/RevealImage";
import { getCatalogue } from "@/lib/catalogue";
import { getSettings } from "@/lib/content";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Collection",
  description: "Upholstery, curtains & blinds, carpets & mats, wallpapers and cushions at Delta Furnishings, Kirti Nagar, New Delhi.",
};

const delay = (n: number) => ({ ["--reveal-delay" as string]: n });

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

      {/* The five categories */}
      <section className="py-16 sm:py-24 lg:py-28" aria-labelledby="cats-title">
        <div className="shell">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <NodeTilesHeading id="cats-title" label="Categories" parts={["Five", { accent: "collections" }]} />
            <ol className="flex flex-col gap-2.5 text-[0.9rem] text-ink-soft sm:flex-row sm:flex-wrap sm:gap-x-7" aria-label="How to browse">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-2.5" data-reveal style={delay(i + 1)}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-terracotta/10 text-[0.72rem] font-semibold text-terracotta">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
          <ul className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:grid-cols-6 lg:gap-6">
            {categories.map((c, i) => (
              // Two wide tiles on top, three below, on a desktop.
              <li key={c.id} className={i < 2 ? "lg:col-span-3" : "lg:col-span-2"}>
                <a href={c.href} className="node-tile group relative isolate block overflow-hidden rounded-[1.5rem] text-white sm:rounded-[1.75rem]">
                  <RevealImage
                    image={c.imageKey}
                    alt=""
                    sizes={i < 2 ? "(min-width: 1024px) 48vw, (min-width: 640px) 48vw, 100vw" : "(min-width: 1024px) 32vw, (min-width: 640px) 48vw, 100vw"}
                    className={`node-tile-img ${i < 2 ? "aspect-[4/3] lg:aspect-[16/10]" : "aspect-[4/3] lg:aspect-[4/5]"}`}
                    delay={i}
                    eager={i < 2}
                  />
                  <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_top,rgba(12,12,12,0.8)_0%,rgba(12,12,12,0.3)_45%,rgba(12,12,12,0)_72%)]" />
                  <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-6 lg:p-8">
                    <span className="min-w-0">
                      <span className="block text-[1.5rem] leading-tight font-medium sm:text-[1.75rem] lg:text-[2rem]">{c.name}</span>
                      <span className="mt-1.5 block text-[0.85rem] text-white/80">
                        {c.children.length > 0 ? c.children.map((s) => s.name).join(", ") : `${c.productCount} products`}
                      </span>
                    </span>
                    <span className="node-tile-arrow flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15">
                      <ArrowRightIcon className="h-4 w-4" />
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

    </main>
  );
}
