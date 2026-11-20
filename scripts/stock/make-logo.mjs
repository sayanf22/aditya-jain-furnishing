// Makes the site's logo files from the client's logo picture (red "Delta",
// charcoal mark, black "Shining Your Home..." line), which comes on a photo
// of curtains.
//
//   node scripts/stock/make-logo.mjs ["path/to/logo.png"]
//
// Writes to public/brand/:
//   logo-color.webp  the logo as sent, background removed (light header)
//   logo-light.webp  dark parts turned white, red kept (header over photos)
//   logo-grey.webp   two soft greys, no colour (dark footer)
//
// How the background goes: every ink colour in the logo (red, charcoal,
// black) has a channel below about 40, while the curtains never go below
// about 145 in any channel. So how far a pixel's darkest channel sits below
// that gap gives its opacity (soft ramp, so the anti-aliased edge stays
// smooth). Colour is then set from clean values measured from the file,
// by "redness", so no curtain colour stays in the edge pixels.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const src = process.argv[2] ?? "IMG_6712.PNG";
const out = "public/brand";
mkdirSync(out, { recursive: true });

// Opacity ramp on the darkest channel: fully background at or above HI,
// fully ink at or below LO.
const HI = 135;
const LO = 50;

// Measured from the file (cores of each part).
const RED = [208, 6, 17];
const MARK = [35, 35, 34]; // the charcoal triangle mark
const TEXT = [6, 5, 5]; // "Shining Your Home..."

const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const alpha = new Uint8Array(width * height);
const red = new Float32Array(width * height);
let minX = width, minY = height, maxX = 0, maxY = 0;
for (let i = 0, p = 0; i < alpha.length; i++, p += 3) {
  const r = data[p], g = data[p + 1], b = data[p + 2];
  const m = Math.min(r, g, b);
  const a = Math.max(0, Math.min(1, (HI - m) / (HI - LO)));
  if (a <= 0) continue;
  alpha[i] = Math.round(a * 255);
  red[i] = Math.max(0, Math.min(1, (r - Math.max(g, b) - 30) / 90));
  if (a > 0.5) {
    const x = i % width, y = (i / width) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}

// The mark sits top left, the tagline across the bottom.
const isMark = (i) => {
  const x = i % width, y = (i / width) | 0;
  return x < 540 && y < 470;
};

function build(colourRed, colourMark, colourText) {
  const buf = Buffer.alloc(width * height * 4);
  for (let i = 0, q = 0; i < alpha.length; i++, q += 4) {
    if (!alpha[i]) continue;
    const t = red[i];
    const dark = isMark(i) ? colourMark : colourText;
    buf[q] = Math.round(colourRed[0] * t + dark[0] * (1 - t));
    buf[q + 1] = Math.round(colourRed[1] * t + dark[1] * (1 - t));
    buf[q + 2] = Math.round(colourRed[2] * t + dark[2] * (1 - t));
    buf[q + 3] = alpha[i];
  }
  return buf;
}

// Footer version: no colour at all. Mark in a diagonal gradient of greys,
// "Delta" (and the small D inside the mark) in light grey, tagline in a
// darker grey that still reads on the near-black footer (#0b0b0c-ish).
function buildGrey() {
  const DELTA = 232;
  const TAG = 168;
  const buf = Buffer.alloc(width * height * 4);
  const markTop = minY, markBottom = Math.min(height, 470), markLeft = minX, markRight = 540;
  for (let i = 0, q = 0; i < alpha.length; i++, q += 4) {
    if (!alpha[i]) continue;
    const x = i % width, y = (i / width) | 0;
    const t = red[i];
    let dark;
    if (isMark(i)) {
      const u = Math.max(0, Math.min(1, ((x - markLeft) / (markRight - markLeft) + (y - markTop) / (markBottom - markTop)) / 2));
      dark = 236 - u * 78; // light grey top-left to mid grey bottom-right
    } else dark = TAG;
    const v = Math.round(DELTA * t + dark * (1 - t));
    buf[q] = buf[q + 1] = buf[q + 2] = v;
    buf[q + 3] = alpha[i];
  }
  return buf;
}

const pad = 6;
const crop = {
  left: Math.max(0, minX - pad),
  top: Math.max(0, minY - pad),
  width: Math.min(width, maxX + pad + 1) - Math.max(0, minX - pad),
  height: Math.min(height, maxY + pad + 1) - Math.max(0, minY - pad),
};
const W = 600; // about 3x the widest the logo is shown (footer, about 200 px)

async function write(name, buf) {
  const file = `${out}/${name}.webp`;
  await sharp(buf, { raw: { width, height, channels: 4 } })
    .extract(crop)
    .resize({ width: W })
    .webp({ quality: 88, alphaQuality: 92, effort: 6 })
    .toFile(file);
  const m = await sharp(file).metadata();
  console.log(file, `${m.width}x${m.height}`);
}

await write("logo-color", build(RED, MARK, TEXT));
await write("logo-light", build([232, 30, 40], [255, 255, 255], [255, 255, 255]));
await write("logo-grey", buildGrey());
console.log("crop", crop);
