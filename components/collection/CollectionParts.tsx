// Server-rendered pieces of the Collection pages: the breadcrumb trail,
// the collection tree (sidebar on desktop, "Browse collections" panel on
// phones) that shows where the visitor is and where they can go, the cards
// for the types inside a page, and the plain-data form of products for the
// ProductBrowser. Plain <a> links: every Collection page is pre-rendered.
import type { CatalogueCategory, CatalogueNode, Product } from "@/lib/catalogue";
import { ArrowRightIcon, ChevronRightIcon } from "../icons";
import { RevealImage } from "../RevealImage";
import { SiteLink } from "../SiteLink";
import { CollectionMenu as Menu, CollectionTree, type TreeNode } from "./CollectionTree";
import type { BrowserProduct } from "./ProductBrowser";

export const designs = (n: number) => (n === 1 ? "1 design" : `${n} designs`);
export const types = (n: number) => (n === 1 ? "1 type" : `${n} types`);

export function Breadcrumbs({ trail }: { trail: { name: string; href: string }[] }) {
  const items = [{ name: "Collection", href: "/collection" }, ...trail];
  return (
    <nav aria-label="Breadcrumb" className="no-scrollbar -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <ol className="flex items-center gap-1.5 text-[0.82rem] whitespace-nowrap text-muted">
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

/** The tree in the slim shape the client component takes. */
function slim(nodes: CatalogueNode[]): TreeNode[] {
  return nodes.map((n) => ({ id: n.id, name: n.name, href: n.href, count: n.productCount, children: slim(n.children) }));
}

/** Desktop: a sticky sidebar with the collection tree. */
export function CollectionSidebar({ categories, current }: { categories: CatalogueCategory[]; current: string }) {
  return (
    <aside className="hidden lg:block">
      <nav aria-label="Collections" className="collection-aside sticky top-28 max-h-[calc(100dvh-8rem)] overflow-y-auto pr-1 pb-6">
        <SiteLink href="/collection" className="mb-3 block px-3 text-[0.72rem] font-semibold tracking-[0.2em] text-muted uppercase hover:text-ink">
          All collections
        </SiteLink>
        <CollectionTree nodes={slim(categories)} current={current} />
      </nav>
    </aside>
  );
}

/** Phones and tablets: the same tree under a "Browse collections" bar. */
export function CollectionMenu({ categories, current, here }: { categories: CatalogueCategory[]; current: string; here: string }) {
  return <Menu nodes={slim(categories)} current={current} here={here} />;
}

// Columns for the type cards (the content column sits beside the sidebar on
// desktops). Two or four types: two across; otherwise three.
const COLS: Record<number, string> = { 1: "sm:grid-cols-2", 2: "sm:grid-cols-2", 4: "sm:grid-cols-2" };

/** Cards for the types inside a page: photo, name, description, what's inside. */
export function TypeCards({ nodes, headingId }: { nodes: CatalogueNode[]; headingId: string }) {
  const cols = COLS[nodes.length] ?? "sm:grid-cols-2 lg:grid-cols-3";
  const wide = nodes.length <= 2 || nodes.length === 4;
  return (
    <ul aria-labelledby={headingId} className={`mt-6 grid gap-x-6 gap-y-5 sm:mt-8 sm:gap-y-10 lg:gap-x-8 ${cols}`}>
      {nodes.map((n, i) => (
        <li key={n.id}>
          {/* Phones: a row with a small square photo, so a list of types
              stays short. Larger screens: photo above, text below. */}
          <a href={n.href} className="type-card group flex items-center gap-4 sm:block">
            <RevealImage
              image={n.image}
              alt=""
              sizes={wide ? "(min-width: 1024px) 34vw, (min-width: 640px) 46vw, 96px" : "(min-width: 1024px) 23vw, (min-width: 640px) 46vw, 96px"}
              className={`node-tile-img aspect-square w-24 shrink-0 overflow-hidden rounded-2xl sm:w-auto sm:rounded-[1.35rem] ${wide ? "sm:aspect-[16/10]" : "sm:aspect-[4/3]"}`}
              delay={Math.min(i, 6)}
            />
            <span className="flex min-w-0 flex-1 items-start justify-between gap-4 px-0.5 sm:mt-4">
              <span className="min-w-0">
                <span className="block text-[1.1rem] leading-snug font-medium transition-colors duration-300 group-hover:text-terracotta sm:text-[1.2rem]">{n.name}</span>
                {n.description && <span className="mt-1 block text-[0.86rem] leading-snug text-ink-soft sm:mt-1.5 sm:text-[0.9rem] sm:leading-relaxed">{n.description}</span>}
                <span className="mt-2 block text-[0.8rem] text-muted">
                  {n.children.length > 0 ? `${types(n.children.length)} · ${designs(n.productCount)}` : designs(n.productCount)}
                </span>
              </span>
              <span className="type-card-arrow mt-0.5 hidden h-9 w-9 shrink-0 sm:flex items-center justify-center rounded-full border border-ink/12 text-ink">
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
    const source = first?.source ?? null;
    return {
      id: p.id,
      name: p.name,
      description: p.description ?? opts.describe?.(p) ?? null,
      trail: (opts.trail ? opts.trail(p) : p.trail).join(" · "),
      href: p.href,
      collection: opts.collectionName(p),
      group: opts.group(p),
      image: source && first ? { src: source.src, srcSet: source.srcSet, width: first.width, height: first.height, alt: first.alt ?? p.name } : null,
    };
  });
}
