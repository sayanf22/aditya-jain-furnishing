// Downloads the stand-in stock images listed in scripts/stock/stock-images.json
// and converts them for the site:
//   images   -> public/demo/<name>-<width>.webp (cropped to the given aspect)
//   swatches -> public/demo/<name>-160.webp and -320.webp (cut from an image)
// Originals are cached in .stock/originals/ (not committed). The site uses
// no video. The interactive room's textures come from make-textures.mjs;
// their sizes.json entries are kept.
//
// Usage: npm run stock

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
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

// Keep the room textures, which scripts/stock/make-textures.mjs adds.
const sizesFile = path.join(outDir, "sizes.json");
const previous = existsSync(sizesFile) ? JSON.parse(readFileSync(sizesFile, "utf8")) : {};
const sizes = Object.fromEntries(Object.entries(previous).filter(([name]) => /^(tex|rug)-/.test(name)));

for (const item of manifest.images) {
  const ext = item.source === "pexels" ? ".jpg" : path.extname(new URL(item.url).pathname) || ".jpg";
  const file = await download(sourceUrl(item), path.join(cacheDir, `${item.name}${ext}`));
  const meta = await sharp(file).metadata();
  if (item.aspect === "original") {
    // Gallery photos keep their whole frame: resized, never cropped.
    const upright = await sharp(file).rotate().toBuffer();
    const { width: ow, height: oh } = await sharp(upright).metadata();
    const made = [];
    for (const w of item.widths) {
      if (w > ow) continue;
      await sharp(upright)
        .resize(w)
        .webp({ quality: 74, effort: 6 })
        .toFile(path.join(outDir, `${item.name}-${w}.webp`));
      made.push(w);
    }
    sizes[item.name] = { widths: made, aspect: [ow, oh] };
    console.log(`image  ${item.name.padEnd(18)} ${ow}x${oh} (uncropped) -> ${made.join(", ")}`);
    continue;
  }
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

writeFileSync(sizesFile, JSON.stringify(sizes, null, 2) + "\n");
console.log("done: public/demo/sizes.json written");
