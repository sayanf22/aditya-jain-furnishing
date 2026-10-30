// Builds .stock/review.png: a labelled sheet of converted files in public/demo
// so crops and swatches can be checked visually.
// Usage: node scripts/stock/review-sheet.mjs [name ...]   (names without .webp)
import { readdirSync } from "node:fs";
import sharp from "sharp";

let files = process.argv.slice(2);
if (files.length === 0) {
  // Smallest width of every image, swatch and poster.
  const all = readdirSync("public/demo").filter((f) => f.endsWith(".webp"));
  const byBase = new Map();
  for (const f of all) {
    const m = f.match(/^(.*)-(\d+)\.webp$/);
    if (!m) continue;
    const prev = byBase.get(m[1]);
    if (!prev || Number(m[2]) < prev.w) byBase.set(m[1], { w: Number(m[2]), f: f.slice(0, -5) });
  }
  files = [...byBase.values()].map((v) => v.f).sort();
}

const W = 300;
const H = 240;
const C = 6;
const tiles = [];
for (const f of files) {
  const img = await sharp(`public/demo/${f}.webp`).resize(W, H, { fit: "contain", background: "#eeeeee" }).toBuffer();
  const label = Buffer.from(
    `<svg width="${W}" height="22"><rect width="${W}" height="22" fill="black" opacity="0.7"/><text x="5" y="16" font-size="13" font-family="Arial" fill="white">${f}</text></svg>`,
  );
  tiles.push(await sharp(img).composite([{ input: label, top: 0, left: 0 }]).png().toBuffer());
}
await sharp({ create: { width: C * W, height: Math.ceil(tiles.length / C) * H, channels: 3, background: "#ffffff" } })
  .composite(tiles.map((input, i) => ({ input, left: (i % C) * W, top: Math.floor(i / C) * H })))
  .png()
  .toFile(".stock/review.png");
console.log(`wrote .stock/review.png (${tiles.length} tiles)`);
