// Prepares a photo in the browser: resizes it to several widths (never
// bigger than the original, same shape, never cropped), encodes each as WebP
// and uploads all sizes in one multipart request.
// Limits match the Worker (docs/admin-architecture.md, Uploads).
import { MEDIA_WIDTHS, type MediaAsset } from "@/lib/admin-api";
import { ApiFailure, failureFrom, getCsrf } from "./api";

/** Sizes for an ordinary photo (a design, a collection card). */
export const ORDINARY_WIDTHS: readonly number[] = [480, 800, 1200];

const MAX_FILE_BYTES = 1_400_000; // the server refuses over 1.5 MB
const MAX_FILES = 4; // the server allows 6; places never need more than 4
const MAX_SIDE = 4096;
// Start near-lossless (WebP 90) and only step down if a size is still over the upload limit.
const START_QUALITY = 0.9;
const LOWEST_QUALITY = 0.6;

export type PreparedImage = {
  width: number;
  height: number;
  files: { width: number; blob: Blob }[];
};

function fail(message: string): never {
  throw new ApiFailure(0, "PHOTO", message);
}

async function decode(file: File): Promise<ImageBitmap> {
  // Some browsers leave the type empty for formats their system does not name (WebKit on Windows for .webp):
  // then the file name decides, and decoding below is the real check.
  const type = file.type || (/\.(jpe?g|png|webp|avif|gif)$/i.test(file.name) ? "image/unknown" : "");
  if (!type.startsWith("image/") || type === "image/svg+xml") fail("That file is not a photo. Use JPG, PNG or WebP.");
  try {
    return await createImageBitmap(file);
  } catch {
    return fail("This photo can't be opened. Try a JPG, PNG or WebP.");
  }
}

function pickWidths(wanted: readonly number[], sourceWidth: number): number[] {
  const known = [...new Set(wanted)].filter((w) => (MEDIA_WIDTHS as readonly number[]).includes(w)).sort((a, b) => a - b);
  let widths = known.filter((w) => w <= sourceWidth && w <= MAX_SIDE);
  if (widths.length < 2) {
    // A small original: use the largest standard sizes it can fill without upscaling.
    widths = MEDIA_WIDTHS.filter((w) => w <= sourceWidth).slice(-2);
  }
  // Below 800 px wide the server accepts a single size; under 480 is too small.
  if (widths.length === 0) fail("This photo is too small. Use one at least 480 pixels wide.");
  return widths.slice(-MAX_FILES);
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

// Safari cannot encode WebP from a canvas (it quietly returns a PNG). There the
// photo is encoded with libwebp compiled to WebAssembly (@jsquash/webp, from
// Google's Squoosh), loaded only when needed.
let nativeWebp: Promise<boolean> | null = null;
function canvasMakesWebp(): Promise<boolean> {
  if (!nativeWebp) {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 2;
    nativeWebp = canvasBlob(probe, 0.8).then((blob) => blob?.type === "image/webp");
  }
  return nativeWebp;
}

async function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  if (await canvasMakesWebp()) return canvasBlob(canvas, quality);
  const context = canvas.getContext("2d");
  if (!context) return null;
  try {
    const { default: encodeWebp } = await import("@jsquash/webp/encode");
    const data = await encodeWebp(context.getImageData(0, 0, canvas.width, canvas.height), { quality: Math.round(quality * 100) });
    return new Blob([data], { type: "image/webp" });
  } catch {
    return null;
  }
}

async function encodeUnderLimit(canvas: HTMLCanvasElement): Promise<Blob> {
  for (let quality = START_QUALITY; quality >= LOWEST_QUALITY - 0.001; quality -= 0.06) {
    const blob = await encode(canvas, quality);
    if (!blob || blob.type !== "image/webp") fail("This browser can't prepare photos. Try again, or use another browser.");
    if (blob.size <= MAX_FILE_BYTES) return blob;
  }
  return fail("This photo is too detailed to upload. Try a smaller one.");
}

/** Resizes one picture into the sizes wanted. Largest first, each from the one before it, for clean edges. */
export async function prepareImage(file: File, wanted: readonly number[]): Promise<PreparedImage> {
  const bitmap = await decode(file);
  try {
    const widths = pickWidths(wanted, bitmap.width).sort((a, b) => b - a);
    const files: PreparedImage["files"] = [];
    let source: CanvasImageSource = bitmap;
    for (const width of widths) {
      const height = Math.max(1, Math.round((bitmap.height * width) / bitmap.width));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) fail("This browser can't prepare photos. Use Chrome, Edge or Firefox.");
      context.imageSmoothingQuality = "high";
      context.drawImage(source, 0, 0, width, height);
      files.push({ width, blob: await encodeUnderLimit(canvas) });
      source = canvas;
    }
    const largest = widths[0];
    return {
      width: largest,
      height: Math.max(1, Math.round((bitmap.height * largest) / bitmap.width)),
      files: files.reverse(),
    };
  } finally {
    bitmap.close();
  }
}

/** Sends the prepared sizes in one request, reporting progress from 0 to 1. */
export function uploadImage(
  prepared: PreparedImage,
  meta: { label?: string; alt?: string },
  onProgress: (fraction: number) => void,
): Promise<MediaAsset> {
  const form = new FormData();
  form.set("meta", JSON.stringify({ ...meta, width: prepared.width, height: prepared.height }));
  for (const { width, blob } of prepared.files) form.set(`w${width}`, blob, `w${width}.webp`);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/admin/media");
    request.setRequestHeader("X-CSRF-Token", getCsrf());
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onerror = () => reject(failureFrom(0, "", null));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(JSON.parse(request.responseText) as MediaAsset);
        } catch {
          reject(failureFrom(500, "", null));
        }
      } else {
        reject(failureFrom(request.status, request.responseText, request.getResponseHeader("Retry-After")));
      }
    };
    request.send(form);
  });
}
