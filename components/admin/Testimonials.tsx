"use client";

// Customer reviews shown on the site: add, edit, show or hide, reorder, delete.
import { useState } from "react";
import type { Testimonial } from "@/lib/admin-api";
import { ApiFailure, api, asFailure } from "./api";
import { movedIds } from "./catalogue-utils";
import { FlipList } from "./FlipList";
import { useResource } from "./hooks";
import { IconDown, IconPlus, IconTrash, IconUp } from "./icons";
import { Badge, Button, ConfirmDialog, Empty, ErrorNote, Field, IconButton, Loading, Sheet, TextArea, TextInput, cx, useToast } from "./ui";

type Editing = { type: "new" } | { type: "edit"; item: Testimonial };

export function Testimonials() {
  const toast = useToast();
  const list = useResource<{ items: Testimonial[] }>("/testimonials");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Testimonial | null>(null);
  const { data, mutate, reload } = list;

  if (list.error && !data) return <ErrorNote error={list.error} onRetry={reload} />;
  if (!data) return <Loading />;
  const items = [...data.items].sort((a, b) => a.position - b.position);
  const ids = items.map((item) => item.id);

  async function move(id: number, step: -1 | 1) {
    const order = movedIds(ids, id, step);
    mutate((current) => ({ items: current.items.map((item) => ({ ...item, position: order.indexOf(item.id) })) }));
    try {
      await api.post("/testimonials/reorder", { ids: order });
    } catch (error) {
      toast(asFailure(error).message, "error");
      reload();
    }
  }

  async function toggle(item: Testimonial) {
    const visible = !item.visible;
    mutate((current) => ({ items: current.items.map((entry) => (entry.id === item.id ? { ...entry, visible } : entry)) }));
    try {
      await api.patch(`/testimonials/${item.id}`, { visible });
    } catch (error) {
      toast(asFailure(error).message, "error");
      reload();
    }
  }

  return (
    <>
      <div className="a-toolbar a-toolbar--end">
        <Button icon={<IconPlus />} onClick={() => setEditing({ type: "new" })}>
          Add review
        </Button>
      </div>

      {items.length === 0 ? (
        <Empty title="No reviews yet">Add what customers say about you.</Empty>
      ) : (
        <div className="a-card a-card--flush">
          <FlipList className="a-list a-tree" order={ids.join(",")}>
            {items.map((item, index) => (
              <li key={item.id} data-flip={item.id} className={cx("a-row a-row--review", !item.visible && "is-hidden")}>
                <button type="button" className="a-row__main" onClick={() => setEditing({ type: "edit", item })}>
                  <span className="a-row__text">
                    <span className="a-row__name">{item.name}</span>
                    <span className="a-row__quote">{item.text}</span>
                    {!item.visible && <Badge>Hidden</Badge>}
                  </span>
                </button>
                <div className="a-row__actions">
                  <IconButton label={`Move ${item.name} up`} disabled={index === 0} onClick={() => void move(item.id, -1)}>
                    <IconUp />
                  </IconButton>
                  <IconButton label={`Move ${item.name} down`} disabled={index === items.length - 1} onClick={() => void move(item.id, 1)}>
                    <IconDown />
                  </IconButton>
                  <Button variant="ghost" onClick={() => void toggle(item)}>
                    {item.visible ? "Hide" : "Show"}
                  </Button>
                </div>
              </li>
            ))}
          </FlipList>
        </div>
      )}

      {editing && (
        <ReviewEditor
          key={editing.type === "new" ? "new" : editing.item.id}
          item={editing.type === "edit" ? editing.item : null}
          onClose={() => setEditing(null)}
          onSaved={reload}
          onDelete={(item) => {
            setEditing(null);
            setDeleting(item);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete the review by ${deleting.name}?`}
          actionLabel="Delete"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api.del(`/testimonials/${deleting.id}`);
            toast("Review deleted");
            reload();
          }}
        >
          <p>It is removed from the site on the next publish.</p>
        </ConfirmDialog>
      )}
    </>
  );
}

function ReviewEditor({ item, onClose, onSaved, onDelete }: { item: Testimonial | null; onClose: () => void; onSaved: () => void; onDelete: (item: Testimonial) => void }) {
  const toast = useToast();
  const [name, setName] = useState(item?.name ?? "");
  const [text, setText] = useState(item?.text ?? "");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const dirty = name !== (item?.name ?? "") || text !== (item?.text ?? "");
  const fieldError = (field: string) => (failure?.field === field ? failure.message : null);

  async function save() {
    setSaving(true);
    setFailure(null);
    try {
      const body = { name: name.trim(), text: text.trim() };
      if (item) await api.patch(`/testimonials/${item.id}`, body);
      else await api.post("/testimonials", body);
      toast(item ? "Saved" : "Review added");
      onSaved();
      onClose();
    } catch (error) {
      setFailure(asFailure(error));
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={item ? "Edit review" : "New review"}
      onClose={onClose}
      dirty={dirty}
      saving={saving}
      onSave={save}
      saveLabel={item ? "Save" : "Add"}
      canSave={name.trim().length > 0 && text.trim().length > 0}
      error={failure && !failure.field ? failure.message : null}
    >
      <div className="a-stack">
        <Field label="Name" error={fieldError("name")}>
          <TextInput value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoFocus={!item} />
        </Field>
        <Field label="Review" error={fieldError("text")} hint={`${text.length} / 500`}>
          <TextArea value={text} onChange={(event) => setText(event.target.value)} maxLength={500} rows={5} />
        </Field>
        {item && (
          <div className="a-sheet__extra">
            <Button variant="danger" className="a-btn--outline" icon={<IconTrash />} onClick={() => onDelete(item)}>
              Delete review
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
