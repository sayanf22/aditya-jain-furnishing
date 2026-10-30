// Turns an image key from the database into <img> src/srcset values.
//
// Keys starting with "demo/" are the stand-in stock images in public/demo/,
// stored as <name>-<width>.webp (see scripts/stock/fetch-stock.mjs). Photos
// uploaded from the admin dashboard will use R2 keys and the same
// "<key>-<width>.webp" naming, served from /api/media/ (added with the
// dashboard step).
import demoSizes from "@/public/demo/sizes.json";

type SizeInfo = { widths: number[]; aspect: [number, number] };
const DEMO = demoSizes as unknown as Record<string, SizeInfo>;

export type ImageSource = {
  src: string;
  srcSet: string;
  width: number;
  height: number;
};

export function imageSource(key: string | null | undefined): ImageSource | null {
  if (!key) return null;
  if (key.startsWith("demo/")) {
    const name = key.slice("demo/".length);
    const info = DEMO[name];
    if (!info || info.widths.length === 0) return null;
    const [aw, ah] = info.aspect;
    const widths = [...info.widths].sort((a, b) => a - b);
    const largest = widths[widths.length - 1];
    // Default src: a middle size, for browsers that ignore srcset.
    const fallback = widths[Math.min(1, widths.length - 1)];
    return {
      src: `/demo/${name}-${fallback}.webp`,
      srcSet: widths.map((w) => `/demo/${name}-${w}.webp ${w}w`).join(", "),
      width: largest,
      height: Math.round((largest * ah) / aw),
    };
  }
  // R2 keys: served through the Worker once uploads exist.
  return { src: `/api/media/${key}`, srcSet: "", width: 1600, height: 1200 };
}

export function videoSource(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.startsWith("demo/")) return `/${key}`;
  return `/api/media/${key}`;
}
