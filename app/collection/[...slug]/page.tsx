// One Collection page per category and per subcategory, at any depth:
//   /collection/curtains-blinds
//   /collection/curtains-blinds/curtains
//   /collection/curtains-blinds/curtains/sheer/organza
// Each shows its photo header, where it sits (breadcrumb, and the other
// collections at its level), tiles for what's inside it, and every product
// inside it, with a filter per sub-collection and a search.
//
// All pages are pre-rendered at build time from D1 (generateStaticParams);
// any other path is a 404 (dynamicParams = false).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs, NodeTiles, Siblings, toBrowser } from "@/components/collection/CollectionParts";
import { NodeTilesHeading } from "@/components/collection/NodeTilesHeading";
import { ProductBrowser } from "@/components/collection/ProductBrowser";
import { WhatsAppIcon } from "@/components/icons";
import { PageHero } from "@/components/PageHero";
import { allPaths, findNode, getCatalogue, productsIn, type CatalogueNode } from "@/lib/catalogue";
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

/** The node that holds this one (the category for a top-level subcategory). */
function parentOf(category: CatalogueNode, node: CatalogueNode): CatalogueNode | null {
  if (node === category) return null;
  const find = (n: CatalogueNode): CatalogueNode | null => {
    if (n.children.some((c) => c.id === node.id)) return n;
    for (const c of n.children) {
      const hit = find(c);
      if (hit) return hit;
    }
    return null;
  };
  return find(category);
}

export default async function CollectionNodePage({ params }: Props) {
  const { slug } = await params;
  const [catalogue, settings] = await Promise.all([getCatalogue(), getSettings()]);
  const found = findNode(catalogue, slug);
  if (!found) notFound();
  const { category, node } = found;
  const contact = contactFrom(settings);
  const whatsappBase = whatsappLink(contact);
  const parent = parentOf(category, node);
  const isCategory = node === category;

  const products = toBrowser(productsIn(catalogue, category, node), {
    collectionName: (p) => p.trail[p.trail.length - 1] ?? category.name,
    group: (p) => p.leafId,
    // Below this page only, and at most the last two steps ("Sheer · Linen").
    trail: (p) => p.trail.slice(node.trail.length - 1).slice(-2),
    describe: (p) => {
      const sub = catalogue.products.find((x) => x.id === p.id)?.subcategoryId;
      return sub ? catalogue.nodes.get(sub)?.description ?? null : category.description;
    },
  });
  const label = isCategory ? "Collection" : node.trail.slice(0, -1).map((t) => t.name).join(" · ");
  const words = node.name.split(" ");
  const title = words.length > 1 ? [words.slice(0, -1).join(" "), { accent: words[words.length - 1] }] : [{ accent: node.name }];
  const enquiry = whatsappBase
    ? `${whatsappBase}?text=${encodeURIComponent(`Hello, I'd like to know more about ${node.trail.map((t) => t.name).join(" · ")} from your website.`)}`
    : null;

  return (
    <main>
      <PageHero
        id="node-title"
        label={label}
        title={title}
        intro={node.description ?? undefined}
        image={category.heroKey ?? category.imageKey}
        alt=""
        size="short"
      />

      <div className="shell flex flex-col gap-5 pt-8 sm:pt-10">
        <Breadcrumbs trail={node.trail} />
        {parent && <Siblings parent={parent} current={node} />}
      </div>

      {node.children.length > 0 && (
        <section className="pt-12 pb-4 sm:pt-16 lg:pt-20" aria-labelledby="inside-title">
          <div className="shell">
            <NodeTilesHeading id="inside-title" label={`Inside ${node.name}`} parts={["Choose", { accent: "a type" }]} />
            <NodeTiles nodes={node.children} headingId="inside-title" />
          </div>
        </section>
      )}

      <section className="py-14 sm:py-20 lg:py-24" aria-labelledby="products-title">
        <div className="shell">
          <div className="mb-8 sm:mb-10">
            <NodeTilesHeading id="products-title" label={isCategory ? category.name : node.name} parts={node.children.length > 0 ? ["All", { accent: "designs" }] : ["The", { accent: "designs" }]} />
          </div>
          {products.length > 0 ? (
            <ProductBrowser
              products={products}
              groups={node.children.filter((c) => c.productCount > 0).map((c) => ({ id: c.id, name: c.name }))}
              allLabel={node.name}
              whatsappBase={whatsappBase}
              headingId="products-title"
            />
          ) : (
            <div className="rounded-[1.5rem] bg-sand/60 px-6 py-14 text-center">
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
        </div>
      </section>
    </main>
  );
}
