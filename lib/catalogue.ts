// The catalogue (categories, nested subcategories, products) for the
// Collection pages, read from D1 in one batch at build time. Pages are
// pre-rendered, so visitors never wait on the database.
//
// Shape: category -> subcategories (any depth) -> products. A product sits
// in the deepest subcategory it belongs to, or directly in a category that
// is a single collection (Wallpapers, Cushions). A node's photo is its own
// image if one is set, otherwise the first product photo inside it.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { buildMediaIndex, imageSource, type ImageSource, type MediaIndex, type MediaRow } from "./media";

export type ProductImage = { key: string; width: number; height: number; alt: string | null; source: ImageSource | null };
export type Product = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  images: ProductImage[];
  /** Where it sits, e.g. ["Curtains", "Sheer", "Organza"]. */
  trail: string[];
  /** URL of the collection it sits in. */
  href: string;
  /** Slug of its child of the page being viewed (for the filter chips). */
  leafId: number | null;
};
export type CatalogueNode = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  imageKey: string | null;
  /** The photo ready for <img>, or null when there is none. */
  image: ImageSource | null;
  href: string;
  /** Names from the category down to this node. */
  trail: { name: string; href: string }[];
  children: CatalogueNode[];
  productCount: number;
};
export type CatalogueCategory = CatalogueNode & {
  tagline: string | null;
  heroKey: string | null;
  /** Wide photo for the top of the collection's page. */
  heroImage: ImageSource | null;
};
export type Catalogue = {
  categories: CatalogueCategory[];
  products: (Product & { categoryId: number; subcategoryId: number | null })[];
  /** Every subcategory by id. */
  nodes: Map<number, CatalogueNode>;
};

type CatRow = { id: number; slug: string; name: string; tagline: string | null; image_key: string | null; hero_image_key: string | null };
type SubRow = { id: number; category_id: number; parent_id: number | null; slug: string; name: string; description: string | null; image_key: string | null };
type ProdRow = { id: number; category_id: number; subcategory_id: number | null; slug: string; name: string; description: string | null };
type ImgRow = { product_id: number; image_key: string; width: number; height: number; alt: string | null };

/**
 * Read once per build: every page uses the same data. `next dev` reads again
 * on each request, so database changes show without a restart.
 */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;
  return () => (process.env.NODE_ENV === "production" ? (cached ??= load()) : load());
}

/** The `media` table: widths and shape of every uploaded photo. */
export const getMediaIndex = once(async (): Promise<MediaIndex> => {
  const { env } = await getCloudflareContext({ async: true });
  const { results } = await env.DB.prepare("SELECT key, widths, width, height FROM media").all<MediaRow>();
  return buildMediaIndex(results);
});

export const getCatalogue = once(load);

async function load(): Promise<Catalogue> {
  const { env } = await getCloudflareContext({ async: true });
  const database = env.DB;
  const [cats, subs, prods, imgs, media] = await database.batch([
    database.prepare("SELECT id, slug, name, tagline, image_key, hero_image_key FROM categories WHERE visible = 1 ORDER BY position, id"),
    database.prepare(
      "SELECT id, category_id, parent_id, slug, name, description, image_key FROM subcategories WHERE visible = 1 ORDER BY position, id",
    ),
    database.prepare(
      "SELECT id, category_id, subcategory_id, slug, name, description FROM products WHERE visible = 1 ORDER BY position, id",
    ),
    database.prepare("SELECT product_id, image_key, width, height, alt FROM product_images ORDER BY product_id, position, id"),
    database.prepare("SELECT key, widths, width, height FROM media"),
  ]);
  return build(
    cats.results as CatRow[],
    subs.results as SubRow[],
    prods.results as ProdRow[],
    imgs.results as ImgRow[],
    buildMediaIndex(media.results as MediaRow[]),
  );
}

export function build(cats: CatRow[], subs: SubRow[], prods: ProdRow[], imgs: ImgRow[], media: MediaIndex): Catalogue {
  const imagesOf = new Map<number, ProductImage[]>();
  for (const i of imgs) {
    const list = imagesOf.get(i.product_id) ?? [];
    list.push({ key: i.image_key, width: i.width, height: i.height, alt: i.alt, source: imageSource(i.image_key, media) });
    imagesOf.set(i.product_id, list);
  }
  const products: Catalogue["products"] = [];

  const categories = cats.map((c) => {
    const base = `/collection/${c.slug}`;
    const makeNode = (s: SubRow, parentHref: string, parentTrail: CatalogueNode["trail"]): CatalogueNode => {
      const href = `${parentHref}/${s.slug}`;
      const trail = [...parentTrail, { name: s.name, href }];
      const children = subs.filter((x) => x.parent_id === s.id).map((x) => makeNode(x, href, trail));
      return { id: s.id, slug: s.slug, name: s.name, description: s.description, imageKey: s.image_key, image: null, href, trail, children, productCount: 0 };
    };
    const node: CatalogueCategory = {
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.tagline,
      tagline: c.tagline,
      imageKey: c.image_key,
      image: null,
      heroKey: c.hero_image_key,
      heroImage: imageSource(c.hero_image_key, media),
      href: base,
      trail: [{ name: c.name, href: base }],
      children: [],
      productCount: 0,
    };
    node.children = subs.filter((s) => s.category_id === c.id && s.parent_id === null).map((s) => makeNode(s, base, node.trail));
    return node;
  });

  // Find each node by subcategory id, so products can be placed.
  const nodeById = new Map<number, CatalogueNode>();
  const walk = (n: CatalogueNode) => {
    nodeById.set(n.id, n);
    n.children.forEach(walk);
  };
  categories.forEach((c) => c.children.forEach(walk));

  for (const p of prods) {
    const cat = categories.find((c) => c.id === p.category_id);
    if (!cat) continue;
    // A product in a hidden subcategory (or one inside a hidden one) is hidden too.
    if (p.subcategory_id !== null && !nodeById.has(p.subcategory_id)) continue;
    const leaf = p.subcategory_id !== null ? nodeById.get(p.subcategory_id) ?? null : null;
    products.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      images: imagesOf.get(p.id) ?? [],
      trail: leaf ? leaf.trail.slice(1).map((t) => t.name) : [],
      href: leaf ? leaf.href : cat.href,
      leafId: null,
      categoryId: p.category_id,
      subcategoryId: leaf ? leaf.id : null,
    });
  }

  // List products in catalogue order: by category, then by where their
  // collection sits in the tree, then by their own position (SQL order).
  const order = new Map<number, number>();
  let n = 0;
  const number = (node: CatalogueNode) => {
    order.set(node.id, ++n);
    node.children.forEach(number);
  };
  categories.forEach((c) => c.children.forEach(number));
  const catOrder = new Map(categories.map((c, i) => [c.id, i]));
  const sqlOrder = new Map(products.map((p, i) => [p.id, i]));
  products.sort(
    (a, b) =>
      (catOrder.get(a.categoryId) ?? 0) - (catOrder.get(b.categoryId) ?? 0) ||
      (a.subcategoryId === null ? 0 : order.get(a.subcategoryId) ?? 0) - (b.subcategoryId === null ? 0 : order.get(b.subcategoryId) ?? 0) ||
      (sqlOrder.get(a.id) ?? 0) - (sqlOrder.get(b.id) ?? 0),
  );

  // Counts and cover photos, bottom up.
  const finish = (n: CatalogueNode, own: (pid: number | null) => boolean) => {
    n.children.forEach((ch) => finish(ch, (sid) => sid === ch.id));
    const direct = products.filter((p) => own(p.subcategoryId));
    n.productCount = direct.length + n.children.reduce((sum, ch) => sum + ch.productCount, 0);
    if (!n.imageKey) {
      n.imageKey = direct.find((p) => p.images[0])?.images[0].key ?? n.children.find((ch) => ch.imageKey)?.imageKey ?? null;
    }
    n.image = imageSource(n.imageKey, media);
  };
  for (const c of categories) {
    // Category level: its "direct" products are the ones with no
    // subcategory, counted here rather than in finish().
    finish(c, () => false);
    c.productCount = products.filter((p) => p.categoryId === c.id).length;
    c.imageKey ??= products.find((p) => p.categoryId === c.id && p.images[0])?.images[0].key ?? null;
    c.image = imageSource(c.imageKey, media);
  }

  return { categories, products, nodes: nodeById };
}

/** Every page path below /collection, for generateStaticParams. */
export function allPaths(catalogue: Catalogue): string[][] {
  const out: string[][] = [];
  const walk = (n: CatalogueNode, path: string[]) => {
    const here = [...path, n.slug];
    out.push(here);
    n.children.forEach((ch) => walk(ch, here));
  };
  catalogue.categories.forEach((c) => walk(c, []));
  return out;
}

/** The category and node for a path like ["curtains-blinds", "curtains", "sheer"]. */
export function findNode(catalogue: Catalogue, path: string[]): { category: CatalogueCategory; node: CatalogueNode } | null {
  const category = catalogue.categories.find((c) => c.slug === path[0]);
  if (!category) return null;
  let node: CatalogueNode = category;
  for (const slug of path.slice(1)) {
    const next: CatalogueNode | undefined = node.children.find((c) => c.slug === slug);
    if (!next) return null;
    node = next;
  }
  return { category, node };
}

/**
 * Products inside a node (any depth), each tagged with which of the node's
 * children it falls under, for the filter chips.
 */
export function productsIn(catalogue: Catalogue, category: CatalogueCategory, node: CatalogueNode): Product[] {
  const childOf = new Map<number, number>();
  const mark = (n: CatalogueNode, top: number) => {
    childOf.set(n.id, top);
    n.children.forEach((ch) => mark(ch, top));
  };
  node.children.forEach((ch) => mark(ch, ch.id));
  const inside = new Set<number>();
  const collect = (n: CatalogueNode) => {
    inside.add(n.id);
    n.children.forEach(collect);
  };
  if (node !== category) collect(node);
  return catalogue.products
    .filter((p) => p.categoryId === category.id && (node === category || (p.subcategoryId !== null && inside.has(p.subcategoryId))))
    .map((p) => ({ ...p, leafId: p.subcategoryId !== null ? childOf.get(p.subcategoryId) ?? null : null }));
}
