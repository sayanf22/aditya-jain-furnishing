// Turns an image key from the database into <img> src/srcset values.
//
// Two kinds of key:
//   demo/<name>  stand-in stock photos in public/demo/, stored as
//                <name>-<width>.webp (sizes in public/demo/sizes.json,
//                made by scripts/stock/fetch-stock.mjs).
//   m/<hash>     photos uploaded from the dashboard. Files are
//                /m/<hash>-<width>.webp; the widths and the shape come from
//                the `media` table, which the loaders (lib/catalogue.ts)
//                read once and pass in as a MediaIndex.
//
// This file has no server-only imports, so client components can use it.
import demoSizes from "@/public/demo/sizes.json";

type SizeInfo = { widths: number[]; aspect: [number, number] };
const DEMO = demoSizes as unknown as Record<string, SizeInfo>;

export type ImageSource = {
  src: string;
  srcSet: string;
  width: number;
  height: number;
};

/** Sizes a default photo (demo/<name>) has in public/demo/, smallest first; empty if unknown. */
export function demoWidths(key: string): number[] {
  return [...(DEMO[key.replace(/^demo\//, "")]?.widths ?? [])].sort((a, b) => a - b);
}

/** A row of the `media` table, as the loaders read it. */
export type MediaRow = { key: string; widths: string; width: number; height: number };
type MediaInfo = { widths: number[]; width: number; height: number };
export type MediaIndex = ReadonlyMap<string, MediaInfo>;

const UPLOADED_KEY = /^m\/([0-9a-f]{16})$/;

export function buildMediaIndex(rows: MediaRow[]): MediaIndex {
  const index = new Map<string, MediaInfo>();
  for (const row of rows) {
    const widths = row.widths
      .split(",")
      .map((w) => Number(w))
      .filter((w) => Number.isInteger(w) && w > 0)
      .sort((a, b) => a - b);
    if (widths.length > 0) index.set(row.key, { widths, width: row.width, height: row.height });
  }
  return index;
}

/** The middle size is the default src, for browsers that ignore srcset. */
function sourceFrom(base: string, widths: number[], width: number, height: number): ImageSource {
  const fallback = widths[Math.min(1, widths.length - 1)];
  return {
    src: `${base}-${fallback}.webp`,
    srcSet: widths.map((w) => `${base}-${w}.webp ${w}w`).join(", "),
    width,
    height,
  };
}

/**
 * `media` is only needed for uploaded photos (m/<hash>). A key that can't be
 * resolved gives null, so the page leaves the photo out instead of showing a
 * broken image.
 */
export function imageSource(key: string | null | undefined, media?: MediaIndex): ImageSource | null {
  if (!key) return null;
  if (key.startsWith("demo/")) {
    const name = key.slice("demo/".length);
    const info = DEMO[name];
    if (!info || info.widths.length === 0) return null;
    const [aw, ah] = info.aspect;
    const widths = [...info.widths].sort((a, b) => a - b);
    const largest = widths[widths.length - 1];
    return sourceFrom(`/demo/${name}`, widths, largest, Math.round((largest * ah) / aw));
  }
  const hash = UPLOADED_KEY.exec(key)?.[1];
  const info = hash ? media?.get(key) : undefined;
  if (!hash || !info) return null;
  return sourceFrom(`/m/${hash}`, info.widths, info.width, info.height);
}
