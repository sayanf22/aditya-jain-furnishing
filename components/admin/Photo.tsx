"use client";

import { useState } from "react";
import { MEDIA_WIDTHS } from "@/lib/admin-api";

/** Sizes to try, nearest to the wanted width first (a photo may not have every size). */
function candidateWidths(wanted: number): number[] {
  return [...MEDIA_WIDTHS].sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || a - b);
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
  className?: string;
};

function PhotoImage({ mediaKey, alt, width, className }: { mediaKey: string; width: number; alt?: string; className?: string }) {
  const [attempt, setAttempt] = useState(0);
  const sizes = candidateWidths(width);
  if (attempt >= sizes.length) return <span className={`a-photo a-photo--empty ${className ?? ""}`} aria-label={alt || "Photo not found"} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`a-photo ${className ?? ""}`}
      src={photoUrl(mediaKey, sizes[attempt])}
      alt={alt ?? ""}
      loading="lazy"
      decoding="async"
      onError={() => setAttempt((value) => value + 1)}
    />
  );
}

/** A photo shown whole (never cropped). Falls back to another size, then to a quiet placeholder. */
export function Photo({ mediaKey, alt, width = 480, className }: PhotoProps) {
  if (!mediaKey) return <span className={`a-photo a-photo--empty ${className ?? ""}`} aria-hidden="true" />;
  return <PhotoImage key={mediaKey} mediaKey={mediaKey} alt={alt} width={width} className={className} />;
}
