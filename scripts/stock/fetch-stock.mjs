// Downloads the stand-in stock images and videos listed in
// scripts/stock/stock-images.json and converts them for the site:
//   images -> public/demo/<name>-<width>.webp (cropped to the given aspect)
//   swatches -> public/demo/<name>-160.webp and -320.webp (cut from an image)
//   videos -> public/demo/<name>.mp4 (540x960, H.264, no sound, short loop)
//             + public/demo/<name>-poster-<width>.webp
// Originals are cached in .stock/originals/ (not committed).
//
// Usage: npm run stock

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(readFileSync(path.join(root, "scripts/stock/stock-images.json"), "utf8"));
const outDir = path.join(root, "public/demo");
const cacheDir = path.join(root, ".stock/originals");
mkdirSync(outDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

const UA = { "User-Agent": "WhyCreativesSiteBuilder/1.0 (hello@whycreatives.in)" };

async function download(url, file) {
  if (existsSync(file)) return file;
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

function sourceUrl(item) {
  if (item.source === "pexels") {
    // Original size from the Pexels CDN, capped at 3000 px wide.
    return `https://images.pexels.com/photos/${item.id}/pexels-photo-${item.id}.jpeg?auto=compress&cs=tinysrgb&w=3000`;
  }
  return item.url;
}

const sizes = {};

for (const item of manifest.images) {
  const ext = item.source === "pexels" ? "jpg" : path.extname(new URL(item.url).pathname) || ".jpg";
  const file = await download(sourceUrl(item), path.join(cacheDir, `${item.name}${ext.startsWith(".") ? ext : "." + ext}`));
  const meta = await sharp(file).metadata();
  const [aw, ah] = item.aspect;
  // Largest crop of the requested aspect that fits the original.
  let cw = meta.width;
  let ch = Math.round((cw * ah) / aw);
  if (ch > meta.height) {
    ch = meta.height;
    cw = Math.round((ch * aw) / ah);
  }
  // "attention" lets sharp pick the most detailed area; otherwise a gravity
  // such as "centre" or "south".
  const position = item.position === "attention" ? sharp.strategy.attention : item.position;
  const cropped = await sharp(file).rotate().resize(cw, ch, { fit: "cover", position }).toBuffer();
  const made = [];
  for (const w of item.widths) {
    if (w > cw) continue;
    const h = Math.round((w * ah) / aw);
    await sharp(cropped)
      .resize(w, h)
      .webp({ quality: w >= 1600 ? 70 : 74, effort: 6 })
      .toFile(path.join(outDir, `${item.name}-${w}.webp`));
    made.push(w);
  }
  sizes[item.name] = { widths: made, aspect: item.aspect };
  console.log(`image  ${item.name.padEnd(18)} ${meta.width}x${meta.height} -> ${made.join(", ")}`);
}

for (const sw of manifest.swatches) {
  const base = manifest.images.find((i) => i.name === sw.from);
  const largest = Math.max(...sizes[base.name].widths);
  const src = path.join(outDir, `${base.name}-${largest}.webp`);
  const meta = await sharp(src).metadata();
  const [x, y, w] = sw.box;
  const side = Math.round(w * meta.width);
  const left = Math.round(x * meta.width);
  const top = Math.round(y * meta.height);
  for (const size of [160, 320]) {
    await sharp(src)
      .extract({ left, top, width: side, height: side })
      .resize(size, size)
      .webp({ quality: 78 })
      .toFile(path.join(outDir, `${sw.name}-${size}.webp`));
  }
  sizes[sw.name] = { widths: [160, 320], aspect: [1, 1] };
  console.log(`swatch ${sw.name.padEnd(18)} from ${base.name}`);
}

for (const v of manifest.videos) {
  const original = path.join(cacheDir, `${v.name}.mp4`);
  if (!existsSync(original)) {
    // Pexels' download endpoint redirects to the original file.
    const res = await fetch(`https://www.pexels.com/download/video/${v.id}/`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "manual",
    });
    const location = res.headers.get("location");
    if (!location) throw new Error(`no download location for video ${v.id} (${res.status})`);
    await download(location, original);
  }
  const out = path.join(outDir, `${v.name}.mp4`);
  // Portrait 540x960, centre-cropped, 24 fps, no audio, fast-start for web.
  execFileSync(
    ffmpegPath,
    [
      "-y", "-loglevel", "error",
      "-ss", String(v.start), "-t", String(v.seconds), "-i", original,
      "-vf", "scale=540:960:force_original_aspect_ratio=increase,crop=540:960,fps=24",
      "-an", "-c:v", "libx264", "-profile:v", "main", "-preset", "slow", "-crf", "28",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
    ],
    { stdio: "inherit" },
  );
  const posterJpg = path.join(cacheDir, `${v.name}-poster.jpg`);
  execFileSync(ffmpegPath, ["-y", "-loglevel", "error", "-ss", "0.5", "-i", out, "-frames:v", "1", "-q:v", "2", posterJpg]);
  for (const w of [270, 540]) {
    await sharp(posterJpg).resize(w, Math.round((w * 16) / 9)).webp({ quality: 74 }).toFile(path.join(outDir, `${v.name}-poster-${w}.webp`));
  }
  sizes[`${v.name}-poster`] = { widths: [270, 540], aspect: [9, 16] };
  const kb = Math.round(readFileSync(out).length / 1024);
  console.log(`video  ${v.name.padEnd(18)} -> ${kb} KB`);
}

writeFileSync(path.join(outDir, "sizes.json"), JSON.stringify(sizes, null, 2) + "\n");
console.log("done: public/demo/sizes.json written");
