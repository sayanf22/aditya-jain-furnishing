"use client";

// Add or edit one design: name, description, where it lives, and its photos.
import { useState } from "react";
import type { AdminProduct, MediaAsset, NewProduct, ProductPatch } from "@/lib/admin-api";
import { ApiFailure, api, asFailure } from "./api";
import type { Place } from "./catalogue-utils";
import { IconLeft, IconPlus, IconReplace, IconRight, IconTrash } from "./icons";
import { MediaPicker } from "./MediaPicker";
import { Photo } from "./Photo";
import { Button, Field, IconButton, Select, Sheet, Switch, TextArea, TextInput, useToast } from "./ui";

type ImageDraft = { mediaKey: string; alt: string | null };

type Draft = {
  name: string;
  description: string;
  place: string;
  visible: boolean;
  images: ImageDraft[];
};

type Props = {
  product: AdminProduct | null;
  places: Place[];
  /** Place to start in for a new design. */
  defaultPlace?: string;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (product: AdminProduct) => void;
};

function placeOf(product: AdminProduct) {
  return `${product.categoryId}:${product.subcategoryId ?? 0}`;
}

function startDraft(product: AdminProduct | null, places: Place[], defaultPlace?: string): Draft {
  if (!product) return { name: "", description: "", place: defaultPlace ?? places[0]?.value ?? "", visible: true, images: [] };
  return {
    name: product.name,
    description: product.description ?? "",
    place: placeOf(product),
    visible: product.visible,
    images: [...product.images].sort((a, b) => a.position - b.position).map((image) => ({ mediaKey: image.mediaKey, alt: image.alt })),
  };
}

const sameImages = (a: ImageDraft[], b: ImageDraft[]) => JSON.stringify(a) === JSON.stringify(b);

export function DesignEditor({ product, places, defaultPlace, onClose, onSaved, onDelete }: Props) {
  const toast = useToast();
  const [initial] = useState(() => startDraft(product, places, defaultPlace));
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [picker, setPicker] = useState<{ type: "add" } | { type: "replace"; index: number } | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const fieldError = (name: string) => (failure?.field === name ? failure.message : null);
  const placeList = places.some((place) => place.value === draft.place) ? places : [{ value: draft.place, label: "Current place", categoryId: 0, subcategoryId: null, visible: true }, ...places];

  function moveImage(index: number, step: -1 | 1) {
    const to = index + step;
    if (to < 0 || to >= draft.images.length) return;
    const next = [...draft.images];
    [next[index], next[to]] = [next[to], next[index]];
    set("images", next);
  }

  function pick(assets: MediaAsset[]) {
    if (picker?.type === "replace") {
      const index = picker.index;
      set(
        "images",
        draft.images.map((image, position) => (position === index && assets[0] ? { mediaKey: assets[0].key, alt: assets[0].alt } : image)),
      );
    } else {
      const known = new Set(draft.images.map((image) => image.mediaKey));
      set("images", [...draft.images, ...assets.filter((asset) => !known.has(asset.key)).map((asset) => ({ mediaKey: asset.key, alt: asset.alt }))]);
    }
  }

  async function save() {
    setSaving(true);
    setFailure(null);
    const [categoryId, sub] = draft.place.split(":").map(Number);
    const subcategoryId = sub || null;
    try {
      let id = product?.id ?? createdId;
      if (id === null) {
        const body: NewProduct = { categoryId, subcategoryId, name: draft.name.trim(), visible: draft.visible };
        if (draft.description.trim()) body.description = draft.description.trim();
        const created = await api.post<AdminProduct>("/products", body);
        id = created.id;
        setCreatedId(id);
      } else {
        const patch: ProductPatch = {};
        if (draft.name.trim() !== initial.name) patch.name = draft.name.trim();
        if (draft.description.trim() !== initial.description) patch.description = draft.description.trim() || null;
        if (draft.visible !== initial.visible) patch.visible = draft.visible;
        if (draft.place !== initial.place) {
          patch.categoryId = categoryId;
          patch.subcategoryId = subcategoryId;
        }
        if (Object.keys(patch).length) await api.patch(`/products/${id}`, patch);
      }
      if (!sameImages(draft.images, initial.images)) {
        await api.put(`/products/${id}/images`, { images: draft.images.map((image) => ({ mediaKey: image.mediaKey, ...(image.alt ? { alt: image.alt } : {}) })) });
      }
      toast(product ? "Saved" : `Added “${draft.name.trim()}”`);
      onSaved();
      onClose();
    } catch (error) {
      setFailure(asFailure(error));
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={product ? product.name : "New design"}
      onClose={() => {
        if (createdId !== null) onSaved();
        onClose();
      }}
      dirty={dirty}
      saving={saving}
      onSave={save}
      saveLabel={product || createdId !== null ? "Save" : "Add"}
      canSave={draft.name.trim().length > 0 && draft.place !== ""}
      error={failure && !failure.field ? failure.message : null}
    >
      <div className="a-stack">
        <section aria-label="Photos">
          <span className="a-field__label">Photos</span>
          <ul className="a-gallery">
            {draft.images.map((image, index) => (
              <li key={image.mediaKey} className="a-gallery__item">
                <div className="a-gallery__frame">
                  <Photo mediaKey={image.mediaKey} alt="" width={480} />
                  {index === 0 && <span className="a-gallery__first">Main</span>}
                </div>
                <div className="a-gallery__tools">
                  <IconButton label="Move earlier" disabled={index === 0} onClick={() => moveImage(index, -1)}>
                    <IconLeft />
                  </IconButton>
                  <IconButton label="Move later" disabled={index === draft.images.length - 1} onClick={() => moveImage(index, 1)}>
                    <IconRight />
                  </IconButton>
                  <IconButton label="Replace photo" onClick={() => setPicker({ type: "replace", index })}>
                    <IconReplace />
                  </IconButton>
                  <IconButton label="Remove photo" onClick={() => set("images", draft.images.filter((_, position) => position !== index))}>
                    <IconTrash />
                  </IconButton>
                </div>
              </li>
            ))}
            <li>
              <button type="button" className="a-gallery__add" onClick={() => setPicker({ type: "add" })}>
                <IconPlus />
                <span>Add photos</span>
              </button>
            </li>
          </ul>
        </section>

        <Field label="Name" error={fieldError("name")}>
          <TextInput value={draft.name} onChange={(event) => set("name", event.target.value)} maxLength={80} autoFocus={!product} required />
        </Field>
        <Field label="Description" error={fieldError("description")} hint={`${draft.description.length} / 500`}>
          <TextArea value={draft.description} onChange={(event) => set("description", event.target.value)} maxLength={500} rows={4} />
        </Field>
        <Field label="Where" error={fieldError("categoryId") ?? fieldError("subcategoryId")}>
          <Select value={draft.place} onChange={(event) => set("place", event.target.value)}>
            {placeList.map((place) => (
              <option key={place.value} value={place.value}>
                {place.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="a-switchrow">
          <span>Show on site</span>
          <Switch checked={draft.visible} onChange={(next) => set("visible", next)} label="Show on site" />
        </div>

        {product && (
          <div className="a-sheet__extra">
            <Button variant="danger" className="a-btn--outline" onClick={() => onDelete(product)} icon={<IconTrash />}>
              Delete design
            </Button>
          </div>
        )}
      </div>

      {picker && <MediaPicker title={picker.type === "add" ? "Add photos" : "Replace photo"} multiple={picker.type === "add"} onPick={pick} onClose={() => setPicker(null)} />}
    </Sheet>
  );
}
