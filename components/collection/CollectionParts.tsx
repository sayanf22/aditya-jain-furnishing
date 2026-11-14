// Server-rendered pieces of the Collection pages: the breadcrumb trail,
// the row of sibling collections, the tiles for the collections inside a
// page, and the plain-data form of products for the ProductBrowser.
// Plain <a> links: every Collection page is pre-rendered HTML.
import type { CatalogueNode, Product } from "@/lib/catalogue";
import { imageSource } from "@/lib/media";
import { ArrowRightIcon, ChevronRightIcon } from "../icons";
import { RevealImage } from "../RevealImage";
import type { BrowserProduct } from "./ProductBrowser";

export function Breadcrumbs({ trail }: { trail: { name: string; href: string }[] }) {
  const items = [{ name: "Collection", href: "/collection" }, ...trail];
  return (
    <nav aria-label="Breadcrumb" className="no-scrollbar -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <ol className="flex items-center gap-1.5 text-[0.8rem] whitespace-nowrap text-muted">
        {items.map((t, i) => {
          const last = i === items.length - 1;
          return (
            <li key={t.href} className="flex items-center gap-1.5">
              {last ? (
                <span aria-current="page" className="font-medium text-ink">
                  {t.name}
                </span>
              ) : (
                <>
                  <a href={t.href} className="link-line transition-colors duration-300 hover:text-ink">
                    {t.name}
                  </a>
                  <ChevronRightIcon className="h-3.5 w-3.5 text-ink/30" />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The other collections at the same level, so a visitor can hop across. */
export function Siblings({ parent, current }: { parent: CatalogueNode; current: CatalogueNode }) {
  if (parent.children.length < 2) return null;
  return (
    <div className="chip-row no-scrollbar -mx-5 flex items-center gap-2 overflow-x-auto overflow-y-hidden px-5 sm:-mx-8 sm:px-8 lg:mx-0 lg:flex-wrap lg:px-0">
      <span className="mr-1 shrink-0 text-[0.72rem] font-semibold tracking-[0.16em] text-muted uppercase">{parent.name}</span>
      {parent.children.map((c) => {
        const on = c.id === current.id;
        return (
          <a
            key={c.id}
            href={c.href}
            aria-current={on ? "page" : undefined}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-[0.8rem] font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-300 ${
              on ? "border-terracotta bg-terracotta text-white" : "border-ink/15 text-ink-soft hover:border-ink hover:text-ink"
            }`}
          >
            {c.name}
          </a>
        );
      })}
    </div>
  );
}

const count = (n: number) => (n === 1 ? "1 product" : `${n} products`);

/** Photo tiles for the collections inside a page. */
export function NodeTiles({ nodes, headingId }: { nodes: CatalogueNode[]; headingId: string }) {
  const many = nodes.length > 4;
  return (
    <ul
      aria-labelledby={headingId}
      className={`mt-8 grid gap-3 sm:mt-10 sm:gap-5 lg:gap-6 ${
        nodes.length === 2 ? "grid-cols-2" : many ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      }`}
    >
      {nodes.map((n, i) => (
        <li key={n.id}>
          <a href={n.href} className="node-tile group relative isolate block overflow-hidden rounded-[1.25rem] text-white sm:rounded-[1.6rem]">
            <RevealImage
              image={n.imageKey}
              alt=""
              sizes={nodes.length === 2 ? "(min-width: 1024px) 40vw, 50vw" : "(min-width: 1024px) 23vw, (min-width: 768px) 31vw, 50vw"}
              className={`node-tile-img ${nodes.length === 2 ? "aspect-[4/5] sm:aspect-[4/3]" : "aspect-[4/5]"}`}
              delay={Math.min(i, 6)}
            />
            <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_top,rgba(20,16,12,0.78)_0%,rgba(20,16,12,0.25)_45%,rgba(20,16,12,0)_70%)]" />
            <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-5 lg:p-6">
              <span className="min-w-0">
                <span className="block text-[1.05rem] leading-tight font-medium sm:text-[1.3rem]">{n.name}</span>
                <span className="mt-1 block text-[0.75rem] text-white/80 sm:text-[0.8rem]">
                  {n.children.length > 0 ? `${n.children.map((c) => c.name).join(", ")}` : count(n.productCount)}
                </span>
              </span>
              <span className="node-tile-arrow flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 sm:h-10 sm:w-10">
                <ArrowRightIcon className="h-4 w-4" />
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Products in the plain shape the browser component takes. */
export function toBrowser<T extends Product>(
  products: T[],
  opts: {
    collectionName: (p: T) => string;
    group: (p: T) => number | null;
    describe?: (p: T) => string | null;
    /** The part of the trail to show on cards (default: all of it). */
    trail?: (p: T) => string[];
  },
): BrowserProduct[] {
  return products.map((p) => {
    const first = p.images[0];
    const source = first ? imageSource(first.key) : null;
    return {
      id: p.id,
      name: p.name,
      description: p.description ?? opts.describe?.(p) ?? null,
      trail: p.trail.join(" · "),
      href: p.href,
      collection: opts.collectionName(p),
      group: opts.group(p),
      image: source && first ? { src: source.src, srcSet: source.srcSet, width: first.width, height: first.height, alt: first.alt ?? p.name } : null,
    };
  });
}
