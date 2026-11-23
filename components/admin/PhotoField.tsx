"use client";

import { useState } from "react";
import { NO_PHOTO, isNoPhoto, type MediaAsset } from "@/lib/admin-api";
import { IconPhotos, IconReplace, IconTrash } from "./icons";
import { MediaPicker } from "./MediaPicker";
import { Photo } from "./Photo";
import { Badge, Button, cx } from "./ui";

type PhotoFieldProps = {
  label: string;
  hint?: string;
  mediaKey: string | null;
  /** Shape of the frame this photo fills on the site; the preview matches it. */
  shape: "wide" | "tall" | "square";
  widths?: readonly number[];
  /** Photo shown while nothing is uploaded (a static file). Never deletable. */
  defaultKey?: string | null;
  onChange: (key: string | null) => void;
};

/**
 * A photo with Replace and Remove. The change is held in the draft until Save.
 * With a default photo there are three states: your upload (Remove brings the default back),
 * the default (Hide shows no photo at all), and hidden (Use default brings it back).
 */
export function PhotoField({ label, hint, mediaKey, shape, widths, defaultKey, onChange }: PhotoFieldProps) {
  const [picking, setPicking] = useState(false);
  const hidden = isNoPhoto(mediaKey);
  const uploaded = Boolean(mediaKey) && !hidden;
  const showing = uploaded ? mediaKey : hidden ? null : (defaultKey ?? null);
  return (
    <div className="a-photofield">
      <div className={cx("a-photofield__frame", `is-${shape}`)}>
        <Photo mediaKey={showing} alt="" width={shape === "wide" ? 800 : 480} />
        {!showing && <IconPhotos className="a-photofield__ghost" />}
      </div>
      <div className="a-photofield__side">
        <span className="a-photofield__label">
          {label}
          {!uploaded && !hidden && defaultKey && <Badge>Default</Badge>}
          {hidden && <Badge>No photo</Badge>}
        </span>
        {hint && <span className="a-photofield__hint">{hint}</span>}
        <div className="a-photofield__actions">
          <Button onClick={() => setPicking(true)} icon={<IconReplace />}>
            {showing ? "Replace" : "Add"}
          </Button>
          {uploaded && (
            <Button variant="ghost" onClick={() => onChange(null)} icon={<IconTrash />} aria-label={`Remove ${label}`}>
              Remove
            </Button>
          )}
          {!uploaded && !hidden && defaultKey && (
            <Button variant="ghost" onClick={() => onChange(NO_PHOTO)} icon={<IconTrash />} aria-label={`Hide the default ${label}`}>
              Hide default
            </Button>
          )}
          {hidden && (
            <Button variant="ghost" onClick={() => onChange(null)} aria-label={`Use the default ${label}`}>
              Use default
            </Button>
          )}
        </div>
        {uploaded && defaultKey && <span className="a-photofield__hint">Remove brings the default photo back.</span>}
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
