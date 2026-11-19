"use client";

import { useState } from "react";
import type { MediaAsset } from "@/lib/admin-api";
import { IconPhotos, IconReplace, IconTrash } from "./icons";
import { MediaPicker } from "./MediaPicker";
import { Photo } from "./Photo";
import { Button, cx } from "./ui";

type PhotoFieldProps = {
  label: string;
  hint?: string;
  mediaKey: string | null;
  /** Shape of the frame this photo fills on the site; the preview matches it. */
  shape: "wide" | "tall" | "square";
  widths?: readonly number[];
  onChange: (key: string | null) => void;
};

/** A photo with Change and Remove. The change is held in the draft until Save. */
export function PhotoField({ label, hint, mediaKey, shape, widths, onChange }: PhotoFieldProps) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="a-photofield">
      <div className={cx("a-photofield__frame", `is-${shape}`)}>
        <Photo mediaKey={mediaKey} alt="" width={shape === "wide" ? 800 : 480} />
        {!mediaKey && <IconPhotos className="a-photofield__ghost" />}
      </div>
      <div className="a-photofield__side">
        <span className="a-photofield__label">{label}</span>
        {hint && <span className="a-photofield__hint">{hint}</span>}
        <div className="a-photofield__actions">
          <Button onClick={() => setPicking(true)} icon={<IconReplace />}>
            {mediaKey ? "Change" : "Add"}
          </Button>
          {mediaKey && (
            <Button variant="ghost" onClick={() => onChange(null)} icon={<IconTrash />} aria-label={`Remove ${label}`}>
              Remove
            </Button>
          )}
        </div>
      </div>
      {picking && (
        <MediaPicker
          title={label}
          widths={widths}
          onPick={(assets: MediaAsset[]) => onChange(assets[0]?.key ?? null)}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
