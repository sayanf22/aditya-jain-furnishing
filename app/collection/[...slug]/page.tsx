// One Collection page per category and per subcategory, at any depth, in
// the client's tree (15 Nov 2026):
//   /collection/curtains-blinds
//   /collection/curtains-blinds/curtains
//   /collection/curtains-blinds/curtains/sheer/organza
//
// Every page has the same simple layout, so a visitor always knows where
// they are and where to go next:
//   - left (desktop): the collection tree, with the current page marked;
//     phones get the same tree under a "Browse collections" bar
//   - breadcrumb, the page's name and a clear description
//   - a page with types inside lists those types (photo, name,
//     description, how many designs); a page with no types inside shows
//     its designs, which open large with an Enquire button.
//
// All pages are pre-rendered at build time from D1 (generateStaticParams);
// any other path is a 404 (dynamicParams = false).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs, CollectionMenu, CollectionSidebar, designs, toBrowser, TypeCards, types } from "@/components/collection/CollectionParts";
import { ProductBrowser } from "@/components/collection/ProductBrowser";
import { WhatsAppIcon } from "@/components/icons";
import { allPaths, findNode, getCatalogue, productsIn } from "@/lib/catalogue";
import { whatsappLink } from "@/lib/contact";
import { contactFrom, getSettings } from "@/lib/content";

export const dynamic = "force-static";
export const dynamicParams = false;

type Props = { params: Promise<{ slug: string[] }> };

export async function generateStaticParams() {
  return allPaths(await getCatalogue()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = findNode(await getCatalogue(), slug);
  if (!found) return {};
  const { category, node } = found;
  const title = node === category ? category.name : `${node.trail.slice(1).map((t) => t.name).join(" · ")} | ${category.name}`;
  return {
    title,
    description: node.description ?? `${node.name} at Delta Furnishings, Kirti Nagar, New Delhi.`,
  };
}

export default async function CollectionNodePage({ params }: Props) {
  const { slug } = await params;
  const [catalogue, settings] = await Promise.all([getCatalogue(), getSettings()]);
  const found = findNode(catalogue, slug);
  if (!found) notFound();
  const { category, node } = found;
  const contact = contactFrom(settings);
  const whatsappBase = whatsappLink(contact);
  const hasTypes = node.children.length > 0;
  const here = `You are in: ${node.name}`;
  // The level above, as a small label over the title ("Curtains › Sheer").
  const above = node.trail.length > 1 ? node.trail.slice(0, -1).map((t) => t.name).join(" › ") : "Collection";

  const products = hasTypes
    ? []
    : toBrowser(productsIn(catalogue, category, node), {
        collectionName: () => node.name,
        group: () => null,
        // Every design on this page is the same type, so the cards show
        // only their names.
        trail: () => [],
        describe: () => node.description,
      });
  const enquiry = whatsappBase
    ? `${whatsappBase}?text=${encodeURIComponent(`Hello, I'd like to know more about ${node.trail.map((t) => t.name).join(" · ")} from your website.`)}`
    : null;

  return (
    <main className="shell pt-24 pb-20 sm:pt-28 lg:pt-32 lg:pb-28">
      <div className="grid gap-8 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-14 xl:grid-cols-[17rem_minmax(0,1fr)] xl:gap-20">
        <CollectionSidebar categories={catalogue.categories} current={node.href} />

        <div className="min-w-0">
          <Breadcrumbs trail={node.trail} />
          <div className="mt-4">
            <CollectionMenu categories={catalogue.categories} current={node.href} here={here} />
          </div>

          <header className="mt-8 border-b border-ink/10 pb-8 sm:mt-10 sm:pb-10">
            <p className="section-label">{above}</p>
            <h1 id="node-title" className="mt-3 text-[2rem] leading-[1.1] font-medium tracking-[-0.01em] sm:text-[2.6rem] lg:text-[3rem]">
              {node.name}
            </h1>
            {node.description && <p className="mt-4 max-w-2xl text-[1rem] leading-relaxed text-ink-soft sm:text-[1.08rem]">{node.description}</p>}
            <p className="mt-4 text-[0.85rem] text-muted">{hasTypes ? `${types(node.children.length)} · ${designs(node.productCount)}` : designs(node.productCount)}</p>
          </header>

          {hasTypes ? (
            <section className="pt-10 sm:pt-12" aria-labelledby="types-title">
              <h2 id="types-title" className="text-[1.15rem] font-medium sm:text-[1.3rem]">
                Choose a type
              </h2>
              <TypeCards nodes={node.children} headingId="types-title" />
            </section>
          ) : (
            <section className="pt-10 sm:pt-12" aria-labelledby="products-title">
              <h2 id="products-title" className="sr-only">
                {node.name} designs
              </h2>
              {products.length > 0 ? (
                <>
                  <p className="mb-6 text-[0.92rem] text-ink-soft">Tap a design to see it large, then enquire about it.</p>
                  <ProductBrowser products={products} groups={[]} allLabel={node.name} whatsappBase={whatsappBase} headingId="products-title" />
                </>
              ) : (
                <div className="rounded-[1.5rem] bg-sand px-6 py-14 text-center">
                  <p className="text-[1.1rem] font-medium">Designs are being added</p>
                  <p className="mt-2 text-[0.95rem] text-muted">Ask the showroom about {node.name.toLowerCase()} in the meantime.</p>
                  {enquiry && (
                    <a
                      href={enquiry}
                      target="_blank"
                      rel="noopener"
                      className="btn mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-terracotta px-6 text-[0.85rem] font-medium text-white hover:bg-terracotta-dark"
                    >
                      <WhatsAppIcon className="h-4 w-4" />
                      Enquire
                    </a>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
