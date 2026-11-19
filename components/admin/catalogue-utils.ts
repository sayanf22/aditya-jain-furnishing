// Pure helpers for the collection tree (categories with types inside them).
import type { AdminCategory, AdminSubcategory } from "@/lib/admin-api";

export type NodeKind = "category" | "sub";

/** One row of the tree, whichever level it is on. */
export type TreeNode = {
  kind: NodeKind;
  id: number;
  categoryId: number;
  parentId: number | null;
  slug: string;
  name: string;
  description: string | null;
  imageKey: string | null;
  heroImageKey: string | null;
  visible: boolean;
  productCount: number;
  children: AdminSubcategory[];
};

/** Where a list of siblings lives: the top level, or inside one collection / type. */
export type Scope = { categoryId: number | null; parentId: number | null };

export const nodeKey = (kind: NodeKind, id: number) => `${kind === "category" ? "c" : "s"}${id}`;

export function fromCategory(category: AdminCategory): TreeNode {
  return { kind: "category", categoryId: category.id, parentId: null, ...category };
}
export function fromSub(sub: AdminSubcategory): TreeNode {
  return { kind: "sub", heroImageKey: null, ...sub };
}

/** Number of types below a node, at any depth. */
export function countTypes(children: AdminSubcategory[]): number {
  return children.reduce((total, child) => total + 1 + countTypes(child.children), 0);
}

export function findNode(categories: AdminCategory[], kind: NodeKind, id: number): TreeNode | null {
  if (kind === "category") {
    const found = categories.find((category) => category.id === id);
    return found ? fromCategory(found) : null;
  }
  const search = (list: AdminSubcategory[]): AdminSubcategory | null => {
    for (const item of list) {
      if (item.id === id) return item;
      const inside = search(item.children);
      if (inside) return inside;
    }
    return null;
  };
  for (const category of categories) {
    const found = search(category.children);
    if (found) return fromSub(found);
  }
  return null;
}

function mapSubs(list: AdminSubcategory[], change: (sub: AdminSubcategory) => AdminSubcategory): AdminSubcategory[] {
  return list.map((sub) => change({ ...sub, children: mapSubs(sub.children, change) }));
}

/** Returns a copy of the tree with one field set changed on one node. */
export function patchNode(categories: AdminCategory[], kind: NodeKind, id: number, patch: Partial<AdminCategory & AdminSubcategory>): AdminCategory[] {
  if (kind === "category") return categories.map((category) => (category.id === id ? { ...category, ...patch } : category));
  return categories.map((category) => ({ ...category, children: mapSubs(category.children, (sub) => (sub.id === id ? { ...sub, ...patch } : sub)) }));
}

function arrange<T extends { id: number; position: number }>(list: T[], ids: number[]): T[] {
  const byId = new Map(list.map((item) => [item.id, item]));
  const arranged = ids.flatMap((id, index) => {
    const item = byId.get(id);
    return item ? [{ ...item, position: index }] : [];
  });
  return arranged.length === list.length ? arranged : list;
}

/** Returns a copy of the tree with one list of siblings put in the order of `ids`. */
export function reorderSiblings(categories: AdminCategory[], scope: Scope, ids: number[]): AdminCategory[] {
  if (scope.categoryId === null) return arrange(categories, ids);
  return categories.map((category) => {
    if (category.id !== scope.categoryId) return category;
    if (scope.parentId === null) return { ...category, children: arrange(category.children, ids) };
    return {
      ...category,
      children: mapSubs(category.children, (sub) => (sub.id === scope.parentId ? { ...sub, children: arrange(sub.children, ids) } : sub)),
    };
  });
}

/** The ids with one moved a step up (-1) or down (+1); unchanged at the ends. */
export function movedIds(ids: number[], id: number, step: -1 | 1): number[] {
  const from = ids.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export type Place = { value: string; label: string; categoryId: number; subcategoryId: number | null; visible: boolean };

export type FilterOption = { value: string; label: string };

/** Every collection and type, with its path, for the "Where" filter. Values: "c:<id>" or "s:<id>". */
export function filterOptions(categories: AdminCategory[]): FilterOption[] {
  const options: FilterOption[] = [];
  const walk = (list: AdminSubcategory[], path: string[]) => {
    for (const sub of list) {
      const trail = [...path, sub.name];
      options.push({ value: `s:${sub.id}`, label: trail.join(" › ") });
      walk(sub.children, trail);
    }
  };
  for (const category of categories) {
    options.push({ value: `c:${category.id}`, label: category.name });
    walk(category.children, [category.name]);
  }
  return options;
}

/** Every place a design can live in: collections and types that hold no types themselves. */
export function designPlaces(categories: AdminCategory[]): Place[] {
  const places: Place[] = [];
  const walk = (category: AdminCategory, list: AdminSubcategory[], path: string[], visible: boolean) => {
    for (const sub of list) {
      const trail = [...path, sub.name];
      const shown = visible && sub.visible;
      if (sub.children.length === 0) {
        places.push({ value: `${category.id}:${sub.id}`, label: trail.join(" › "), categoryId: category.id, subcategoryId: sub.id, visible: shown });
      } else {
        walk(category, sub.children, trail, shown);
      }
    }
  };
  for (const category of categories) {
    if (category.children.length === 0) {
      places.push({ value: `${category.id}:0`, label: category.name, categoryId: category.id, subcategoryId: null, visible: category.visible });
    } else {
      walk(category, category.children, [category.name], category.visible);
    }
  }
  return places;
}
