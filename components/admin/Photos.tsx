"use client";

// Photos: the library. Upload, rename, describe, replace and delete.
import { useState } from "react";
import type { MediaAsset } from "@/lib/admin-api";
import { api, asFailure } from "./api";
import { fileSize } from "./format";
import { useDebounced } from "./hooks";
import { IconReplace, IconSearch, IconTrash } from "./icons";
import { Dropzone, MediaGrid, UploadButton, UploadQueue, useMediaLibrary, useUploads } from "./media";
import { MediaPicker } from "./MediaPicker";
import { Photo } from "./Photo";
import { replaceEverywhere } from "./replace";
import { Badge, Button, ConfirmDialog, Empty, ErrorNote, Field, Loading, PageHeader, Sheet, TextArea, TextInput, useToast } from "./ui";

const USE_NAMES = { product: "Design", category: "Collection", subcategory: "Type", site: "Site", room: "Room" } as const;

export function PhotosScreen() {
  const [search, setSearch] = useState("");
  const library = useMediaLibrary(useDebounced(search));
  const uploads = useUploads({ onUploaded: library.add });
  const [openId, setOpenId] = useState<number | null>(null);
  const open = library.items.find((asset) => asset.id === openId) ?? null;

  return (
    <Dropzone onFiles={uploads.addFiles}>
      <PageHeader title="Photos">
        <UploadButton onFiles={uploads.addFiles} />
      </PageHeader>

      <label className="a-search a-search--solo">
        <IconSearch />
        <TextInput type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search photos" aria-label="Search photos" />
      </label>

      <UploadQueue items={uploads.items} onDismiss={uploads.dismiss} />

      {library.error ? (
        <ErrorNote error={library.error} onRetry={library.reload} />
      ) : library.loading && library.items.length === 0 ? (
        <Loading />
      ) : library.items.length === 0 ? (
        <Empty title={search ? "No photos found" : "No photos yet"}>Drop photos anywhere on this page, or press Upload.</Empty>
      ) : (
        <>
          <MediaGrid items={library.items} onOpen={(asset) => setOpenId(asset.id)} />
          {library.hasMore && (
            <div className="a-more-row">
              <Button onClick={() => void library.loadMore()} busy={library.loadingMore}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}

      {open && (
        <PhotoDetail
          key={open.id}
          asset={open}
          onClose={() => setOpenId(null)}
          onChanged={(asset) => library.update(asset)}
          onDeleted={() => {
            library.remove(open.id);
            setOpenId(null);
          }}
          onReplaced={library.reload}
        />
      )}
    </Dropzone>
  );
}

type DetailProps = {
  asset: MediaAsset;
  onClose: () => void;
  onChanged: (asset: MediaAsset) => void;
  onDeleted: () => void;
  onReplaced: () => void;
};

function PhotoDetail({ asset, onClose, onChanged, onDeleted, onReplaced }: DetailProps) {
  const toast = useToast();
  const [label, setLabel] = useState(asset.label ?? "");
  const [alt, setAlt] = useState(asset.alt ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [busyReplace, setBusyReplace] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inUse = asset.usedBy.length > 0;
  const dirty = label !== (asset.label ?? "") || alt !== (asset.alt ?? "");

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.patch<MediaAsset>(`/media/${asset.id}`, { label: label.trim(), alt: alt.trim() || null });
      onChanged(updated);
      toast("Saved");
      onClose();
    } catch (failure) {
      setError(asFailure(failure).message);
      setSaving(false);
    }
  }

  async function replace(next: MediaAsset) {
    if (next.id === asset.id) return;
    setBusyReplace(true);
    try {
      const places = await replaceEverywhere(asset, next);
      toast(`Replaced in ${places} ${places === 1 ? "place" : "places"}`);
      onReplaced();
      onClose();
    } catch (failure) {
      toast(asFailure(failure).message, "error");
      setBusyReplace(false);
    }
  }

  return (
    <Sheet title={asset.label || "Photo"} onClose={onClose} dirty={dirty} saving={saving} onSave={save} error={error}>
      <div className="a-stack">
        <div className="a-preview">
          <Photo mediaKey={asset.key} alt={asset.alt ?? ""} width={1200} />
        </div>
        <p className="a-meta">
          {asset.width} × {asset.height} · {fileSize(asset.bytes)} · {asset.widths.length} sizes
        </p>
        <Field label="Label">
          <TextInput value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} />
        </Field>
        <Field label="Description" hint="Read aloud by screen readers">
          <TextArea value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={200} rows={2} />
        </Field>

        <section aria-label="Where it is used">
          <span className="a-field__label">Used in</span>
          {inUse ? (
            <ul className="a-uselist">
              {asset.usedBy.map((use) => (
                <li key={`${use.type}-${use.id}`}>
                  <Badge>{USE_NAMES[use.type]}</Badge> {use.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="a-meta">Not used anywhere.</p>
          )}
        </section>

        <div className="a-sheet__extra">
          {inUse && (
            <Button icon={<IconReplace />} onClick={() => setReplacing(true)} busy={busyReplace}>
              Replace everywhere
            </Button>
          )}
          <Button variant="danger" className="a-btn--outline" icon={<IconTrash />} onClick={() => setDeleting(true)} disabled={inUse}>
            Delete photo
          </Button>
        </div>
        {inUse && <p className="a-meta">A photo in use can’t be deleted. Replace it, or remove it from where it is used.</p>}
      </div>

      {replacing && <MediaPicker title="Replace with" onPick={(assets) => assets[0] && void replace(assets[0])} onClose={() => setReplacing(false)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete this photo?"
          actionLabel="Delete"
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await api.del(`/media/${asset.id}`);
            toast("Photo deleted");
            onDeleted();
          }}
        >
          <p>The photo is removed from your library for good.</p>
        </ConfirmDialog>
      )}
    </Sheet>
  );
}
