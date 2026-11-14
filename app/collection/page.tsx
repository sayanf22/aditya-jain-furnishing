// Collection (agreement §02: "Browse by category and subcategory, with
// images and descriptions"). The five categories, each with what's inside,
// then every product with a filter per category and a search. Pre-rendered
// at build time from D1.
import type { Metadata } from "next";
import { NodeTilesHeading } from "@/components/collection/NodeTilesHeading";
import { toBrowser } from "@/components/collection/CollectionParts";
import { ProductBrowser } from "@/components/collection/ProductBrowser";
import { ArrowRightIcon } from "@/components/icons";
import { PageHero } from "@/components/PageHero";
import { RevealImage } from "@/components/RevealImage";
import { Words } from "@/components/Words";
import { getCatalogue } from "@/lib/catalogue";
import { whatsappLink } from "@/lib/contact";
import { contactFrom, getSettings } from "@/lib/content";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Collection",
  description: "Upholstery, curtains & blinds, carpets & mats, wallpapers and cushions at Delta Furnishings, Kirti Nagar, New Delhi.",
};

const delay = (n: number) => ({ ["--reveal-delay" as string]: n });

export default async function CollectionPage() {
  const [catalogue, settings] = await Promise.all([getCatalogue(), getSettings()]);
  const contact = contactFrom(settings);
  const categories = catalogue.categories;
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));
  const products = toBrowser(catalogue.products, {
    collectionName: (p) => nameOf.get(p.categoryId) ?? "",
    group: (p) => p.categoryId,
    describe: (p) => {
      const sub = p.subcategoryId;
      return sub ? catalogue.nodes.get(sub)?.description ?? null : null;
    },
  });

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
          <NodeTilesHeading id="cats-title" label="Categories" parts={["Five", { accent: "collections" }]} />
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
                  <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_top,rgba(20,16,12,0.8)_0%,rgba(20,16,12,0.3)_45%,rgba(20,16,12,0)_72%)]" />
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

      {/* Every product */}
      <section className="px-3 pb-16 sm:px-5 sm:pb-20 lg:px-6 lg:pb-24" aria-labelledby="all-title">
        <div className="mx-auto max-w-[108rem] rounded-[2rem] bg-sand/55 lg:rounded-[2.5rem]">
          <div className="shell py-14 sm:py-20 lg:py-24">
            <div className="mb-8 flex flex-col gap-3 sm:mb-10 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="section-label" data-reveal>
                  All products
                </p>
                <h2 id="all-title" className="section-title mt-3" data-words>
                  <Words parts={["Find", { accent: "a design" }]} />
                </h2>
              </div>
              <p className="max-w-md text-[0.98rem] text-muted lg:text-right" data-reveal style={delay(1)}>
                Filter by category or search, then tap a design to see it large.
              </p>
            </div>
            <ProductBrowser
              products={products}
              groups={categories.filter((c) => c.productCount > 0).map((c) => ({ id: c.id, name: c.name }))}
              allLabel="products"
              whatsappBase={whatsappLink(contact)}
              showCollection
              headingId="all-title"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
