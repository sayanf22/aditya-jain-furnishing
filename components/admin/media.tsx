"use client";

// Photo library pieces shared by the Photos screen and the photo picker:
// the list hook, the upload queue (resize in the browser, then upload) and the grid.
import { useCallback, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { MediaAsset } from "@/lib/admin-api";
import { asFailure, query } from "./api";
import { labelFromFileName } from "./format";
import { usePaged } from "./hooks";
import { IconCheck, IconUpload } from "./icons";
import { ORDINARY_WIDTHS, prepareImage, uploadImage } from "./image-pipeline";
import { Photo } from "./Photo";
import { Button, cx } from "./ui";

export type UploadItem = {
  id: number;
  name: string;
  /** 0 to 1 across resizing and sending. */
  progress: number;
  error?: string;
};

type UploadOptions = {
  widths?: readonly number[];
  onUploaded: (asset: MediaAsset) => void;
};

/** Takes files one at a time: resize, upload, report. Several files can be added at once. */
export function useUploads({ widths = ORDINARY_WIDTHS, onUploaded }: UploadOptions) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const counter = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());

  const patch = useCallback((id: number, change: Partial<UploadItem>) => {
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)));
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const id = ++counter.current;
        setItems((list) => [...list, { id, name: file.name, progress: 0 }]);
        chain.current = chain.current.then(async () => {
          try {
            const prepared = await prepareImage(file, widths);
            patch(id, { progress: 0.15 });
            const asset = await uploadImage(prepared, { label: labelFromFileName(file.name) }, (fraction) => patch(id, { progress: 0.15 + fraction * 0.85 }));
            onUploaded(asset);
            setItems((list) => list.filter((item) => item.id !== id));
          } catch (error) {
            patch(id, { error: asFailure(error).message });
          }
        });
      }
    },
    [widths, onUploaded, patch],
  );

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((item) => item.id !== id)), []);
  return { items, addFiles, dismiss };
}

export function UploadQueue({ items, onDismiss }: { items: UploadItem[]; onDismiss: (id: number) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="a-uploads" aria-label="Uploads">
      {items.map((item) => (
        <li key={item.id} className={cx("a-upload", item.error && "is-error")}>
          <span className="a-upload__name">{item.name}</span>
          {item.error ? (
            <>
              <span className="a-upload__msg">{item.error}</span>
              <button type="button" className="a-link" onClick={() => onDismiss(item.id)}>
                Dismiss
              </button>
            </>
          ) : (
            <span className="a-upload__bar" role="progressbar" aria-valuenow={Math.round(item.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ transform: `scaleX(${item.progress})` }} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Wraps content so photos can be dropped anywhere on it. Also offers the Upload button. */
export function Dropzone({ onFiles, children }: { onFiles: (files: File[]) => void; children: ReactNode }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  function hasFiles(event: DragEvent) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }
  return (
    <div
      className={cx("a-dropzone", over && "is-over")}
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(event) => {
        if (hasFiles(event)) event.preventDefault();
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setOver(false);
        onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {children}
      {over && (
        <div className="a-dropzone__veil" aria-hidden="true">
          <IconUpload />
          Drop photos to upload
        </div>
      )}
    </div>
  );
}

export function UploadButton({ onFiles, label = "Upload", variant = "primary" }: { onFiles: (files: File[]) => void; label?: string; variant?: "primary" | "secondary" }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant={variant} icon={<IconUpload />} onClick={() => input.current?.click()}>
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

type GridProps = {
  items: MediaAsset[];
  onOpen: (asset: MediaAsset) => void;
  selected?: string[];
};

export function MediaGrid({ items, onOpen, selected }: GridProps) {
  return (
    <ul className="a-mediagrid">
      {items.map((asset) => {
        const picked = selected?.indexOf(asset.key) ?? -1;
        return (
          <li key={asset.id}>
            <button type="button" className={cx("a-media", picked >= 0 && "is-picked")} onClick={() => onOpen(asset)} aria-pressed={selected ? picked >= 0 : undefined}>
              <span className="a-media__frame">
                <Photo mediaKey={asset.key} alt="" width={480} />
                {asset.usedBy.length > 0 && <span className="a-media__use" title="In use" />}
                {picked >= 0 && <span className="a-media__pick">{selected && selected.length > 1 ? picked + 1 : <IconCheck />}</span>}
              </span>
              <span className="a-media__label">{asset.label || "Untitled"}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The photo library, newest first, with search. New and changed photos update the list in place. */
export function useMediaLibrary(search: string) {
  const list = usePaged<MediaAsset>(`/media${query({ limit: 48, q: search.trim() })}`);
  const { mutate } = list;
  const add = useCallback((asset: MediaAsset) => mutate((items) => [asset, ...items.filter((item) => item.id !== asset.id)]), [mutate]);
  const update = useCallback((asset: MediaAsset) => mutate((items) => items.map((item) => (item.id === asset.id ? asset : item))), [mutate]);
  const remove = useCallback((id: number) => mutate((items) => items.filter((item) => item.id !== id)), [mutate]);
  return { ...list, add, update, remove };
}