// "Replace" for a photo that is already in use: the photo store is keyed by a
// hash of the file, so replacing means pointing every place that shows the old
// photo at the new one. Each step is one ordinary API call.
import { isReplaceableSlot, type AdminCategory, type AdminProduct, MediaAsset, SiteImage } from "@/lib/admin-api";
import { api } from "./api";
import type { AdminSubcategory } from "@/lib/admin-api";

type Catalogue = { categories: AdminCategory[] };

function* subs(list: AdminSubcategory[]): Generator<AdminSubcategory> {
  for (const sub of list) {
    yield sub;
    yield* subs(sub.children);
  }
}

/** Points every use of `old` at `next`. Returns how many places changed. */
export async function replaceEverywhere(old: MediaAsset, next: MediaAsset): Promise<number> {
  let changed = 0;

  const { categories } = await api.get<Catalogue>("/catalogue");
  for (const category of categories) {
    const patch: Record<string, string> = {};
    if (category.imageKey === old.key) patch.imageKey = next.key;
    if (Object.keys(patch).length) {
      await api.patch(`/categories/${category.id}`, patch);
      changed += 1;
    }
    for (const sub of subs(category.children)) {
      if (sub.imageKey === old.key) {
        await api.patch(`/subcategories/${sub.id}`, { imageKey: next.key });
        changed += 1;
      }
    }
  }

  const { slots } = await api.get<{ slots: SiteImage[] }>("/site/images");
  for (const slot of slots) {
    if (isReplaceableSlot(slot.slot) && slot.mediaKey === old.key) {
      await api.put(`/site/images/${slot.slot}`, { mediaKey: next.key, alt: slot.alt });
      changed += 1;
    }
  }

  for (const use of old.usedBy.filter((item) => item.type === "product")) {
    const product = await api.get<AdminProduct>(`/products/${use.id}`);
    const images = [...product.images]
      .sort((a, b) => a.position - b.position)
      .map((image) => ({ mediaKey: image.mediaKey === old.key ? next.key : image.mediaKey, ...(image.alt ? { alt: image.alt } : {}) }));
    await api.put(`/products/${product.id}/images`, { images });
    changed += 1;
  }

  return changed;
}
