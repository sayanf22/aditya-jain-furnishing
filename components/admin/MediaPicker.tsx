"use client";

// Choose photos from the library, or upload new ones, and hand them back.
import { useCallback, useState } from "react";
import type { MediaAsset } from "@/lib/admin-api";
import { useDebounced } from "./hooks";
import { IconSearch } from "./icons";
import { Dropzone, MediaGrid, UploadButton, UploadQueue, useMediaLibrary, useUploads } from "./media";
import { Button, Empty, ErrorNote, Loading, Sheet, TextInput } from "./ui";

type PickerProps = {
  title?: string;
  /** Sizes to make when a new photo is uploaded here (see SITE_IMAGE_SLOTS). */
  widths?: readonly number[];
  multiple?: boolean;
  onPick: (assets: MediaAsset[]) => void;
  onClose: () => void;
};

export function MediaPicker({ title = "Choose a photo", widths, multiple = false, onPick, onClose }: PickerProps) {
  const [search, setSearch] = useState("");
  const library = useMediaLibrary(useDebounced(search));
  const [chosen, setChosen] = useState<MediaAsset[]>([]);
  const { add } = library;

  const finish = useCallback(
    (assets: MediaAsset[]) => {
      onPick(assets);
      onClose();
    },
    [onPick, onClose],
  );

  const uploaded = useCallback(
    (asset: MediaAsset) => {
      add(asset);
      if (multiple) setChosen((list) => [...list, asset]);
      else finish([asset]);
    },
    [add, multiple, finish],
  );
  const uploads = useUploads({ widths, onUploaded: uploaded });

  function open(asset: MediaAsset) {
    if (!multiple) return finish([asset]);
    setChosen((list) => (list.some((item) => item.key === asset.key) ? list.filter((item) => item.key !== asset.key) : [...list, asset]));
  }

  const footer = multiple ? (
    <div className="a-saveactions">
      <span className="a-saveactions__status is-dirty">{chosen.length ? `${chosen.length} selected` : ""}</span>
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button variant="primary" disabled={chosen.length === 0} onClick={() => finish(chosen)}>
        {chosen.length > 1 ? `Use ${chosen.length} photos` : "Use photo"}
      </Button>
    </div>
  ) : undefined;

  return (
    <Sheet title={title} variant="wide" onClose={onClose} footer={footer}>
      <Dropzone onFiles={uploads.addFiles}>
        <div className="a-toolbar">
          <label className="a-search">
            <IconSearch />
            <TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search photos" aria-label="Search photos" type="search" />
          </label>
          <UploadButton onFiles={uploads.addFiles} label="Upload" variant="secondary" />
        </div>
        <UploadQueue items={uploads.items} onDismiss={uploads.dismiss} />
        {library.error ? (
          <ErrorNote error={library.error} onRetry={library.reload} />
        ) : library.loading && library.items.length === 0 ? (
          <Loading />
        ) : library.items.length === 0 ? (
          <Empty title={search ? "No photos found" : "No photos yet"}>Drop photos here or press Upload.</Empty>
        ) : (
          <>
            <MediaGrid items={library.items} onOpen={open} selected={multiple ? chosen.map((item) => item.key) : undefined} />
            {library.hasMore && (
              <div className="a-more-row">
                <Button onClick={() => void library.loadMore()} busy={library.loadingMore}>
                  Show more
                </Button>
              </div>
            )}
          </>
        )}
      </Dropzone>
    </Sheet>
  );
}
