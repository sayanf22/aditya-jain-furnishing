"use client";

import { useState } from "react";
import { MEDIA_WIDTHS, isNoPhoto } from "@/lib/admin-api";
import { demoWidths } from "@/lib/media";

/** Size that worked for each photo, so later views go straight to it. */
const workedBefore = new Map<string, number>();

/** Sizes to try: the one that worked, then the nearest to the wanted width. */
function candidateWidths(mediaKey: string, wanted: number, known?: readonly number[]): number[] {
  // A default photo (demo/...) has its own sizes, listed in public/demo/sizes.json.
  const demo = mediaKey.startsWith("demo/") ? demoWidths(mediaKey) : [];
  const pool = demo.length > 0 ? demo : known && known.length > 0 ? known : MEDIA_WIDTHS;
  const nearest = [...pool].sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || a - b);
  const cached = workedBefore.get(mediaKey);
  return cached !== undefined && pool.includes(cached) ? [cached, ...nearest.filter((w) => w !== cached)] : nearest;
}

/** Address of one size of a stored photo: "m/<hash>" or "demo/<name>". */
export function photoUrl(key: string, width: number): string {
  return `/${key}-${width}.webp`;
}

type PhotoProps = {
  mediaKey: string | null | undefined;
  alt?: string;
  /** Width in px that suits the box this sits in (a size close to it is loaded). */
  width?: number;
  /** Sizes this photo is known to have. When unknown, nearby sizes are tried in turn. */
  widths?: readonly number[];
  className?: string;
};

type ImageProps = { mediaKey: string; width: number; widths?: readonly number[]; alt?: string; className?: string };

function PhotoImage({ mediaKey, alt, width, widths, className }: ImageProps) {
  const [attempt, setAttempt] = useState(0);
  const sizes = candidateWidths(mediaKey, width, widths);
  if (attempt >= sizes.length) return <span className={`a-photo a-photo--empty ${className ?? ""}`} aria-label={alt || "Photo not found"} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`a-photo ${className ?? ""}`}
      src={photoUrl(mediaKey, sizes[attempt])}
      alt={alt ?? ""}
      loading="lazy"
      decoding="async"
      onLoad={() => workedBefore.set(mediaKey, sizes[attempt])}
      onError={() => setAttempt((value) => value + 1)}
    />
  );
}

/** A photo shown whole (never cropped). Falls back to another size, then to a quiet placeholder. */
export function Photo({ mediaKey, alt, width = 480, widths, className }: PhotoProps) {
  if (!mediaKey || isNoPhoto(mediaKey)) return <span className={`a-photo a-photo--empty ${className ?? ""}`} aria-hidden="true" />;
  return <PhotoImage key={mediaKey} mediaKey={mediaKey} alt={alt} width={width} widths={widths} className={className} />;
}
