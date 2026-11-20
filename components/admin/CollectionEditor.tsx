"use client";

// Add or edit one collection or type: name, description, photos, page address.
import { useState } from "react";
import { categoryCardDefaultFor, type AdminCategory, type AdminSubcategory, CategoryPatch, SubcategoryPatch } from "@/lib/admin-api";
import { ApiFailure, api, asFailure } from "./api";
import { type NodeKind, type TreeNode } from "./catalogue-utils";
import { ORDINARY_WIDTHS } from "./image-pipeline";
import { IconPlus, IconTrash } from "./icons";
import { PhotoField } from "./PhotoField";
import { Button, Field, Sheet, TextArea, TextInput, useToast } from "./ui";

export type EditorMode = { type: "edit"; node: TreeNode } | { type: "create"; parent: TreeNode | null };

type Props = {
  mode: EditorMode;
  onClose: () => void;
  /** Called after a save. `created` names a new row so the screen can open it for photos. */
  onSaved: (created?: { kind: NodeKind; id: number }) => void;
  onAddChild: (parent: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
};

type Draft = {
  name: string;
  description: string;
  slug: string;
  imageKey: string | null;
};

function startDraft(mode: EditorMode): Draft {
  if (mode.type === "create") return { name: "", description: "", slug: "", imageKey: null };
  const { node } = mode;
  return { name: node.name, description: node.description ?? "", slug: node.slug, imageKey: node.imageKey };
}

export function CollectionEditor({ mode, onClose, onSaved, onAddChild, onDelete }: Props) {
  const toast = useToast();
  const [initial] = useState(() => startDraft(mode));
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const editing = mode.type === "edit" ? mode.node : null;
  const isCategory = mode.type === "create" ? mode.parent === null : mode.node.kind === "category";
  const noun = isCategory ? "collection" : "type";
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const slugChanged = editing !== null && draft.slug !== initial.slug;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const fieldError = (name: string) => (failure?.field === name ? failure.message : null);

  async function save() {
    setSaving(true);
    setFailure(null);
    try {
      const name = draft.name.trim();
      const description = draft.description.trim();
      if (mode.type === "create") {
        const body = { name, ...(description ? { description } : {}), ...(draft.slug.trim() ? { slug: draft.slug.trim() } : {}) };
        const created = mode.parent
          ? await api.post<AdminSubcategory>("/subcategories", {
              ...body,
              categoryId: mode.parent.categoryId,
              parentId: mode.parent.kind === "sub" ? mode.parent.id : null,
            })
          : await api.post<AdminCategory>("/categories", body);
        toast(`Added “${created.name}”`);
        // The screen swaps this form for the new row's editor, so photos can be added next.
        onSaved({ kind: mode.parent ? "sub" : "category", id: created.id });
        return;
      } else {
        const patch: CategoryPatch & SubcategoryPatch = {};
        if (name !== initial.name) patch.name = name;
        if (description !== initial.description) patch.description = description || null;
        if (draft.slug !== initial.slug) patch.slug = draft.slug.trim();
        if (draft.imageKey !== initial.imageKey) patch.imageKey = draft.imageKey;
        await api.patch(`/${isCategory ? "categories" : "subcategories"}/${mode.node.id}`, patch);
        toast("Saved");
        onSaved();
      }
      onClose();
    } catch (error) {
      setFailure(asFailure(error));
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={editing ? editing.name : `New ${noun}`}
      onClose={onClose}
      dirty={dirty}
      saving={saving}
      onSave={save}
      saveLabel={editing ? "Save" : "Add"}
      canSave={draft.name.trim().length > 0}
      error={failure && !failure.field ? failure.message : null}
    >
      <div className="a-stack">
        <Field label="Name" error={fieldError("name")}>
          <TextInput value={draft.name} onChange={(event) => set("name", event.target.value)} maxLength={80} autoFocus={!editing} required />
        </Field>
        <Field label="Description" error={fieldError("description")} hint={`${draft.description.length} / 500`}>
          <TextArea value={draft.description} onChange={(event) => set("description", event.target.value)} maxLength={500} rows={4} />
        </Field>

        {editing && (
          <>
            <PhotoField
              label={isCategory ? "Card photo" : "Photo"}
              hint={isCategory ? "Upright, shown on the home page" : undefined}
              shape={isCategory ? "tall" : "square"}
              widths={ORDINARY_WIDTHS}
              mediaKey={draft.imageKey}
              defaultKey={isCategory ? categoryCardDefaultFor(initial.slug) : null}
              onChange={(key) => set("imageKey", key)}
            />
          </>
        )}

        <details className="a-details">
          <summary>Page address</summary>
          <Field label="Address" error={fieldError("slug")} hint={slugChanged ? "Changing this breaks old links to the page." : "Made from the name. Letters, numbers and dashes."}>
            <TextInput value={draft.slug} onChange={(event) => set("slug", event.target.value.toLowerCase())} maxLength={60} placeholder="made-from-the-name" autoCapitalize="off" spellCheck={false} />
          </Field>
        </details>

        {editing && (
          <div className="a-sheet__extra">
            <Button onClick={() => onAddChild(editing)} icon={<IconPlus />}>
              Add type inside
            </Button>
            <Button variant="danger" className="a-btn--outline" onClick={() => onDelete(editing)} icon={<IconTrash />}>
              Delete {noun}
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
