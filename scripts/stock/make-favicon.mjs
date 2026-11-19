// Makes the browser-tab and home-screen icons from the Delta mark (the
// triangle with the red D) in public/brand/logo-color.webp, on a white
// rounded badge so the charcoal triangle shows on dark tabs too.
//
//   node scripts/stock/make-favicon.mjs        (run make-logo.mjs first)
//
// Writes app/favicon.ico (16, 32 and 48 px, PNG inside), app/icon.png (192 px)
// and app/apple-icon.png (180 px). Next.js picks all three up by file name.
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const logo = "public/brand/logo-color.webp";
const { data, info } = await sharp(logo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;

// The mark is the part left of the "D" of Delta: find the first column
// gap (no ink at all) after the mark starts, and cut there.
const colInk = new Array(width).fill(0);
for (let y = 0; y < Math.floor(height * 0.72); y++) {
  for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 40) colInk[x]++;
}
let start = colInk.findIndex((n) => n > 0);
let end = start;
while (end < width && colInk[end] > 0) end++;
// The "e" of Delta's swoosh can touch the mark; keep only the first run.
const rows = [];
for (let y = 0; y < Math.floor(height * 0.72); y++) {
  let any = false;
  for (let x = start; x < end; x++) if (data[(y * width + x) * 4 + 3] > 40) any = true;
  if (any) rows.push(y);
}
const crop = { left: start, top: rows[0], width: end - start, height: rows[rows.length - 1] - rows[0] + 1 };
console.log("mark", crop);

async function badge(size) {
  const pad = Math.round(size * 0.16);
  const inner = size - pad * 2;
  const mark = await sharp(logo).extract(crop).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="#ffffff"/></svg>`);
  return sharp(bg).composite([{ input: mark, top: pad, left: pad }]).png().toBuffer();
}

// .ico with PNG images inside (supported by every current browser).
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map(badge));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const o = 6 + 16 * i;
  head[o] = s;
  head[o + 1] = s;
  head.writeUInt16LE(1, o + 4);
  head.writeUInt16LE(32, o + 6);
  head.writeUInt32LE(pngs[i].length, o + 8);
  head.writeUInt32LE(offset, o + 12);
  offset += pngs[i].length;
});
writeFileSync("app/favicon.ico", Buffer.concat([head, ...pngs]));
writeFileSync("app/icon.png", await badge(192));
writeFileSync("app/apple-icon.png", await badge(180));
console.log("wrote app/favicon.ico, app/icon.png, app/apple-icon.png");
