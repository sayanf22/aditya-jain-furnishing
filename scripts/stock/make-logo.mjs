// Makes the site's logo files from the client's logo (red "Delta" and the
// black-and-red mark, with "Shining Your Home..." under it, on a near-white
// background).
//
//   node scripts/stock/make-logo.mjs ["path/to/logo.png"]
//
// Writes to public/brand/:
//   logo-color.webp  the logo as sent, background removed (light header)
//   logo-light.webp  black parts turned white, red kept (header over photos)
//   logo-grey.webp   two soft greys, no colour (dark footer)
//
// The background is removed by "un-mixing" each pixel from white: the logo's
// colours (red, black) all have a channel near 0, so how far the darkest
// channel is from white gives the pixel's opacity, and the anti-aliased
// edges come out clean instead of with a white fringe.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const src = process.argv[2] ?? "Delta Shining Your Home Logo.png";
const out = "public/brand";
mkdirSync(out, { recursive: true });

// The background is 246-254 with a faint checker pattern; everything at or
// above BG counts as background.
const BG = 238;
const WHITE = 250;

const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const rgba = Buffer.alloc(width * height * 4);
let minX = width, minY = height, maxX = 0, maxY = 0;
for (let p = 0, q = 0; p < data.length; p += 3, q += 4) {
  const r = data[p], g = data[p + 1], b = data[p + 2];
  const m = Math.min(r, g, b);
  const a = Math.max(0, Math.min(1, (BG - m) / BG));
  if (a > 0) {
    // Undo the blend with white to get the ink's own colour.
    const un = (c) => Math.max(0, Math.min(255, Math.round((c - (1 - a) * WHITE) / a)));
    rgba[q] = un(r);
    rgba[q + 1] = un(g);
    rgba[q + 2] = un(b);
    rgba[q + 3] = Math.round(a * 255);
    if (a > 0.2) {
      const x = (p / 3) % width, y = Math.floor(p / 3 / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

// Recolour: red ink is the pixels whose red channel stands well above the
// others; the rest is the black ink.
function recolour(fnRed, fnBlack) {
  const buf = Buffer.from(rgba);
  for (let q = 0; q < buf.length; q += 4) {
    if (!buf[q + 3]) continue;
    const r = buf[q], g = buf[q + 1], b = buf[q + 2];
    const redness = Math.max(0, Math.min(1, (r - Math.max(g, b)) / 160));
    const [r1, g1, b1] = fnRed;
    const [r2, g2, b2] = fnBlack;
    buf[q] = Math.round(r1 * redness + r2 * (1 - redness));
    buf[q + 1] = Math.round(g1 * redness + g2 * (1 - redness));
    buf[q + 2] = Math.round(b1 * redness + b2 * (1 - redness));
  }
  return buf;
}

const pad = 4;
const crop = {
  left: Math.max(0, minX - pad),
  top: Math.max(0, minY - pad),
  width: Math.min(width, maxX + pad + 1) - Math.max(0, minX - pad),
  height: Math.min(height, maxY + pad + 1) - Math.max(0, minY - pad),
};
const W = 540; // about 2.5x the widest the logo is shown (footer, 220 px)

async function write(name, buf) {
  const file = `${out}/${name}.webp`;
  await sharp(buf, { raw: { width, height, channels: 4 } })
    .extract(crop)
    .resize({ width: W })
    .webp({ quality: 85, alphaQuality: 90, effort: 6 })
    .toFile(file);
  const m = await sharp(file).metadata();
  console.log(file, `${m.width}x${m.height}`);
}

// Logo red, measured from the file: about #E10101 (225, 1, 1).
await write("logo-color", recolour([225, 1, 1], [12, 12, 12]));
await write("logo-light", recolour([235, 30, 30], [255, 255, 255]));
await write("logo-grey", recolour([200, 200, 200], [150, 150, 150]));
console.log("crop", crop, "ratio", (crop.width / crop.height).toFixed(4));
