// Draws the stand-in textures for the interactive room on the Home page:
//   tiles -> public/demo/tex-<name>-320.webp  (seamless, repeat in the room)
//   rugs  -> public/demo/rug-<name>-1000.webp (a whole rug, seen from above)
// Each texture is a flat colour or pattern (drawn as SVG) with a woven grain
// laid over it. The grain is SVG noise made seamless by blending shifted
// copies (see seamless()), so tiles repeat with no visible edge. Entries
// are merged into public/demo/sizes.json.
//
// These are stand-ins only. The client's real fabrics replace them: a
// straight-on photo of a fabric (cut square) or a top-down rug photo works
// the same way.
//
// Usage: node scripts/stock/make-textures.mjs

import { readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "../..");
const outDir = path.join(root, "public/demo");
const S = 512;

// ---------------------------------------------------------------- grain

// Makes a grayscale image repeat with no seam: four copies (as is, shifted
// half a tile across, down, and both) are mixed with weights that reach
// zero exactly where each copy has its own seam. Weights are scaled so the
// mix keeps the same contrast as the original.
function seamless(px, w, h) {
  let mean = 0;
  for (const v of px) mean += v;
  mean /= px.length;
  const out = new Float32Array(px.length);
  const at = (x, y) => px[((y + h) % h) * w + ((x + w) % w)] - mean;
  for (let y = 0; y < h; y++) {
    const wy = Math.sin((Math.PI * y) / h) ** 2;
    for (let x = 0; x < w; x++) {
      const wx = Math.sin((Math.PI * x) / w) ** 2;
      const k = [wx * wy, (1 - wx) * wy, wx * (1 - wy), (1 - wx) * (1 - wy)];
      const norm = Math.sqrt(k.reduce((s, v) => s + v * v, 0));
      out[y * w + x] =
        (k[0] * at(x, y) + k[1] * at(x + w / 2, y) + k[2] * at(x, y + h / 2) + k[3] * at(x + w / 2, y + h / 2)) / norm;
    }
  }
  return out;
}

// A grayscale noise layer, stretched to full range and then softened to
// `amount` (0-1) around mid-grey, so it can be blended with soft-light.
async function noise(w, h, { freq, octaves = 3, type = "fractalNoise", seed = 1, amount = 0.4 }, tile) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <filter id="f" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="${type}" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}"/>
      <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0 0 0 0 1"/>
    </filter>
    <rect width="${w}" height="${h}" filter="url(#f)"/>
  </svg>`;
  const raw = await sharp(Buffer.from(svg)).grayscale().raw().toBuffer();
  const px = Float32Array.from(raw);
  const field = tile ? seamless(px, w, h) : px;
  // Stretch so 1st-99th percentile spans the range, then scale by amount.
  const sorted = Float32Array.from(field).sort();
  const lo = sorted[Math.floor(sorted.length * 0.01)];
  const hi = sorted[Math.floor(sorted.length * 0.99)];
  const span = Math.max(1e-6, (hi - lo) / 2);
  const mid = (hi + lo) / 2;
  const bytes = Buffer.alloc(field.length);
  for (let i = 0; i < field.length; i++) {
    const v = Math.max(-1, Math.min(1, (field[i] - mid) / span));
    bytes[i] = Math.round(128 + v * 127 * amount);
  }
  return sharp(bytes, { raw: { width: w, height: h, channels: 1 } }).toColourspace("srgb").png().toBuffer();
}

const GRAIN = {
  linen: [
    { freq: "0.012 0.5", octaves: 2, seed: 2, amount: 0.38 },
    { freq: "0.5 0.012", octaves: 2, seed: 5, amount: 0.3 },
    { freq: "0.9", octaves: 1, seed: 9, amount: 0.2 },
  ],
  velvet: [
    { freq: "0.012", octaves: 3, seed: 4, amount: 0.24 },
    { freq: "1.1", octaves: 1, seed: 7, amount: 0.12 },
  ],
  boucle: [
    { freq: "0.11", octaves: 3, type: "turbulence", seed: 3, amount: 0.62 },
    { freq: "0.6", octaves: 1, seed: 8, amount: 0.25 },
  ],
  leather: [
    { freq: "0.045", octaves: 4, seed: 6, amount: 0.35 },
    { freq: "0.012", octaves: 2, seed: 11, amount: 0.3 },
    { freq: "0.8", octaves: 1, seed: 12, amount: 0.15 },
  ],
  tweed: [
    { freq: "0.7", octaves: 2, seed: 13, amount: 0.5 },
    { freq: "0.2", octaves: 2, seed: 14, amount: 0.3 },
  ],
  plaster: [
    { freq: "0.005", octaves: 3, seed: 15, amount: 0.25 },
    { freq: "0.06", octaves: 3, seed: 16, amount: 0.14 },
  ],
  paper: [
    { freq: "0.02", octaves: 3, seed: 17, amount: 0.14 },
    { freq: "0.8", octaves: 1, seed: 18, amount: 0.1 },
  ],
  wool: [
    { freq: "0.35", octaves: 3, seed: 19, amount: 0.42 },
    { freq: "0.03", octaves: 2, seed: 20, amount: 0.22 },
  ],
  shag: [
    { freq: "0.18", octaves: 3, type: "turbulence", seed: 21, amount: 0.7 },
    { freq: "0.015", octaves: 2, seed: 22, amount: 0.3 },
  ],
  jute: [
    { freq: "0.5 0.08", octaves: 2, seed: 23, amount: 0.45 },
    { freq: "0.03", octaves: 2, seed: 24, amount: 0.2 },
  ],
  oak: [
    { freq: "0.9 0.006", octaves: 3, seed: 25, amount: 0.55 },
    { freq: "0.05 0.004", octaves: 2, seed: 26, amount: 0.35 },
  ],
};

// ------------------------------------------------------------- patterns

// Draws `draw(x, y)` at a point and at its copies one tile over in every
// direction, so motifs that cross an edge continue on the other side.
const wrap = (x, y, draw) =>
  [-S, 0, S].flatMap((dx) => [-S, 0, S].map((dy) => draw(x + dx, y + dy))).join("");

const plain = (colour) => `<rect width="${S}" height="${S}" fill="${colour}"/>`;

const stripes = (ground, ink, { bands, width, vertical = true, thin }) => {
  let out = plain(ground);
  const step = S / bands;
  for (let i = 0; i < bands; i++) {
    const at = i * step + (step - width) / 2;
    out += vertical
      ? `<rect x="${at}" y="0" width="${width}" height="${S}" fill="${ink}"/>`
      : `<rect x="0" y="${at}" width="${S}" height="${width}" fill="${ink}"/>`;
    if (thin) {
      const t = at + width + (step - width) / 2 - thin / 2;
      out += vertical
        ? `<rect x="${t}" y="0" width="${thin}" height="${S}" fill="${ink}" opacity="0.6"/>`
        : `<rect x="0" y="${t}" width="${S}" height="${thin}" fill="${ink}" opacity="0.6"/>`;
    }
  }
  return out;
};

const check = (ground, ink, { bands, width }) => {
  const step = S / bands;
  let out = plain(ground);
  for (let i = 0; i < bands; i++) {
    const at = i * step;
    out += `<rect x="${at}" y="0" width="${width}" height="${S}" fill="${ink}" opacity="0.45"/>`;
    out += `<rect x="0" y="${at}" width="${S}" height="${width}" fill="${ink}" opacity="0.45"/>`;
    out += `<rect x="${at + step / 2}" y="0" width="3" height="${S}" fill="${ink}" opacity="0.35"/>`;
    out += `<rect x="0" y="${at + step / 2}" width="${S}" height="3" fill="${ink}" opacity="0.35"/>`;
  }
  return out;
};

// Diamond lattice with small rounds where the lines cross.
const trellis = (ground, ink, { cell = 128, line = 5 }) => {
  let out = plain(ground);
  for (let k = -S / cell; k <= (2 * S) / cell; k++) {
    const c = k * cell;
    out += `<line x1="0" y1="${c}" x2="${S}" y2="${c + S}" stroke="${ink}" stroke-width="${line}"/>`;
    out += `<line x1="0" y1="${c}" x2="${S}" y2="${c - S}" stroke="${ink}" stroke-width="${line}"/>`;
  }
  for (let x = 0; x <= S; x += cell) {
    for (let y = 0; y <= S; y += cell) {
      out += `<circle cx="${x}" cy="${y}" r="${line * 2.2}" fill="${ink}"/>`;
      out += `<circle cx="${x + cell / 2}" cy="${y + cell / 2}" r="${line * 2.2}" fill="${ink}"/>`;
      out += `<circle cx="${x + cell / 2}" cy="${y}" r="${line * 0.9}" fill="${ink}" opacity="0.7"/>`;
      out += `<circle cx="${x}" cy="${y + cell / 2}" r="${line * 0.9}" fill="${ink}" opacity="0.7"/>`;
    }
  }
  return out;
};

// A tone-on-tone medallion (damask style), half-drop repeat.
const medallion = (x, y, ink, r) => {
  const leaf = (angle) =>
    `<path transform="translate(${x} ${y}) rotate(${angle})" d="M0 ${-r * 0.18} C ${r * 0.32} ${-r * 0.42}, ${r * 0.24} ${-r * 0.86}, 0 ${-r} C ${-r * 0.24} ${-r * 0.86}, ${-r * 0.32} ${-r * 0.42}, 0 ${-r * 0.18} Z" fill="${ink}"/>`;
  const small = (angle) =>
    `<path transform="translate(${x} ${y}) rotate(${angle})" d="M0 ${-r * 0.22} C ${r * 0.16} ${-r * 0.36}, ${r * 0.14} ${-r * 0.58}, 0 ${-r * 0.66} C ${-r * 0.14} ${-r * 0.58}, ${-r * 0.16} ${-r * 0.36}, 0 ${-r * 0.22} Z" fill="${ink}" opacity="0.75"/>`;
  return (
    [0, 90, 180, 270].map(leaf).join("") +
    [45, 135, 225, 315].map(small).join("") +
    `<circle cx="${x}" cy="${y}" r="${r * 0.14}" fill="${ink}"/>` +
    `<circle cx="${x}" cy="${y}" r="${r * 1.12}" fill="none" stroke="${ink}" stroke-width="${r * 0.05}" opacity="0.6"/>`
  );
};
const damask = (ground, ink) =>
  plain(ground) +
  wrap(128, 128, (x, y) => medallion(x, y, ink, 104)) +
  wrap(384, 384, (x, y) => medallion(x, y, ink, 104)) +
  wrap(384, 128, (x, y) => `<circle cx="${x}" cy="${y}" r="10" fill="${ink}" opacity="0.8"/>`) +
  wrap(128, 384, (x, y) => `<circle cx="${x}" cy="${y}" r="10" fill="${ink}" opacity="0.8"/>`);

// Small five-petal flowers with two leaves.
const flower = (x, y, r, petal, centre, leaf, turn = 0) => {
  const petals = [0, 72, 144, 216, 288]
    .map(
      (a) =>
        `<ellipse cx="0" cy="${-r * 0.55}" rx="${r * 0.32}" ry="${r * 0.52}" fill="${petal}" transform="translate(${x} ${y}) rotate(${a + turn})"/>`,
    )
    .join("");
  const leaves = [
    `<ellipse cx="${r * 1.05}" cy="${r * 0.55}" rx="${r * 0.55}" ry="${r * 0.2}" fill="${leaf}" transform="rotate(${30 + turn} ${x} ${y}) translate(${x} ${y})"/>`,
    `<ellipse cx="${-r * 1.05}" cy="${r * 0.55}" rx="${r * 0.55}" ry="${r * 0.2}" fill="${leaf}" transform="rotate(${-30 + turn} ${x} ${y}) translate(${x} ${y})"/>`,
  ].join("");
  return leaves + petals + `<circle cx="${x}" cy="${y}" r="${r * 0.22}" fill="${centre}"/>`;
};
const floral = (ground, petal, centre, leaf, { big = 46, small = 22 } = {}) =>
  plain(ground) +
  wrap(128, 128, (x, y) => flower(x, y, big, petal, centre, leaf, 0)) +
  wrap(384, 384, (x, y) => flower(x, y, big, petal, centre, leaf, 36)) +
  wrap(384, 128, (x, y) => flower(x, y, small, leaf, centre, leaf, 18)) +
  wrap(128, 384, (x, y) => flower(x, y, small, leaf, centre, leaf, 54));

// Herringbone: columns of diagonal bands, alternating direction.
const herringbone = (ground, ink, { col = 64, band = 32 } = {}) => {
  let out = plain(ground);
  out += `<defs>
    <pattern id="a" width="${col}" height="${band * 2}" patternUnits="userSpaceOnUse">
      <path d="M0 0 L${col} ${band} L${col} ${band * 2} L0 ${band} Z" fill="${ink}"/>
    </pattern>
    <pattern id="b" width="${col}" height="${band * 2}" patternUnits="userSpaceOnUse">
      <path d="M0 ${band} L${col} 0 L${col} ${band} L0 ${band * 2} Z" fill="${ink}"/>
    </pattern>
  </defs>`;
  for (let x = 0, i = 0; x < S; x += col, i++) {
    out += `<rect x="${x}" y="0" width="${col}" height="${S}" fill="url(#${i % 2 ? "b" : "a"})"/>`;
    out += `<rect x="${x}" y="0" width="2" height="${S}" fill="${ink}" opacity="0.5"/>`;
  }
  return out;
};

// Rows of zigzags (geometric print).
const zigzag = (ground, ink, { period = 64, rows = 8, line = 7, amp = 18 } = {}) => {
  let out = plain(ground);
  for (let r = 0; r < rows; r++) {
    const y = r * (S / rows) + S / rows / 2;
    let d = `M ${-period} ${y}`;
    for (let x = -period; x <= S + period; x += period) d += ` L ${x + period / 2} ${y - amp} L ${x + period} ${y}`;
    out += `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${line}" stroke-linejoin="round"/>`;
    if (r % 2) {
      for (let x = 0; x < S; x += period) out += `<circle cx="${x + period / 2}" cy="${y + amp * 0.9}" r="4" fill="${ink}"/>`;
    }
  }
  return out;
};

// Basket weave for a natural blind: alternating blocks of fine lines.
const basket = (ground, ink, { cell = 32 } = {}) => {
  let out = plain(ground);
  for (let i = 0; i < S / cell; i++) {
    for (let j = 0; j < S / cell; j++) {
      const x = i * cell;
      const y = j * cell;
      for (let k = 3; k < cell; k += 7) {
        out += (i + j) % 2
          ? `<rect x="${x + k}" y="${y + 1}" width="3" height="${cell - 2}" fill="${ink}" opacity="0.55"/>`
          : `<rect x="${x + 1}" y="${y + k}" width="${cell - 2}" height="3" fill="${ink}" opacity="0.55"/>`;
      }
    }
  }
  return out;
};

// Oak floor boards running towards the viewer, joints staggered.
const oak = () => {
  const tones = ["#b88a5c", "#a67a50", "#c49a6a", "#ad8156"];
  const joints = [140, 380, 60, 300];
  let out = "";
  tones.forEach((t, i) => {
    const x = i * 128;
    out += `<rect x="${x}" y="0" width="128" height="${S}" fill="${t}"/>`;
    out += `<rect x="${x}" y="0" width="2" height="${S}" fill="#5a3f27" opacity="0.55"/>`;
    out += `<rect x="${x}" y="${joints[i]}" width="128" height="2" fill="#5a3f27" opacity="0.45"/>`;
  });
  return out;
};

// --------------------------------------------------------------- rugs

const RW = 1320;
const RH = 800;
const rugFrame = (outer, inner, line, { band = 64, gap = 18 } = {}) =>
  `<rect width="${RW}" height="${RH}" fill="${outer}"/>` +
  `<rect x="${band}" y="${band}" width="${RW - band * 2}" height="${RH - band * 2}" fill="${inner}"/>` +
  `<rect x="${band - gap / 2}" y="${band - gap / 2}" width="${RW - band * 2 + gap}" height="${RH - band * 2 + gap}" fill="none" stroke="${line}" stroke-width="5"/>` +
  `<rect x="${gap}" y="${gap}" width="${RW - gap * 2}" height="${RH - gap * 2}" fill="none" stroke="${line}" stroke-width="3" opacity="0.8"/>`;

const diamond = (cx, cy, w, h, fill, extra = "") =>
  `<path d="M${cx} ${cy - h / 2} L${cx + w / 2} ${cy} L${cx} ${cy + h / 2} L${cx - w / 2} ${cy} Z" fill="${fill}" ${extra}/>`;

const rugs = {
  "rug-classic-red": {
    grain: "wool",
    svg: () => {
      let out = rugFrame("#22304a", "#8c2f2a", "#d4b26c", { band: 78 });
      // Small motifs across the field.
      for (let x = 150; x < RW - 120; x += 72) {
        for (let y = 150; y < RH - 120; y += 72) out += diamond(x, y, 22, 22, "#a8473b");
      }
      out += diamond(RW / 2, RH / 2, 520, 400, "#22304a");
      out += diamond(RW / 2, RH / 2, 440, 330, "#d4b26c");
      out += diamond(RW / 2, RH / 2, 380, 280, "#8c2f2a");
      out += diamond(RW / 2, RH / 2, 160, 120, "#22304a");
      out += diamond(RW / 2, RH / 2, 70, 52, "#d4b26c");
      for (const [cx, cy] of [[78, 78], [RW - 78, 78], [78, RH - 78], [RW - 78, RH - 78]]) {
        out += `<circle cx="${cx}" cy="${cy}" r="10" fill="#d4b26c"/>`;
      }
      for (let x = 120; x < RW - 80; x += 60) {
        out += diamond(x, 39, 18, 18, "#d4b26c");
        out += diamond(x, RH - 39, 18, 18, "#d4b26c");
      }
      return out;
    },
  },
  "rug-jute": {
    grain: "jute",
    svg: () => {
      let out = rugFrame("#9e8155", "#c3a575", "#8a6e46", { band: 54, gap: 14 });
      for (let y = 80; y < RH - 60; y += 26) {
        let d = `M 60 ${y}`;
        for (let x = 60; x < RW - 60; x += 26) d += ` L ${x + 13} ${y - 9} L ${x + 26} ${y}`;
        out += `<path d="${d}" fill="none" stroke="#a88a5e" stroke-width="5" opacity="0.8"/>`;
      }
      return out;
    },
  },
  "rug-grey-geometric": {
    grain: "wool",
    svg: () => {
      let out = rugFrame("#6f6a64", "#d5d0c8", "#d5d0c8", { band: 58, gap: 16 });
      out += `<clipPath id="field"><rect x="58" y="58" width="${RW - 116}" height="${RH - 116}"/></clipPath><g clip-path="url(#field)">`;
      for (let k = -12; k < 30; k++) {
        const c = k * 90;
        out += `<line x1="0" y1="${c}" x2="${RW}" y2="${c + RW}" stroke="#77716a" stroke-width="9"/>`;
        out += `<line x1="0" y1="${c}" x2="${RW}" y2="${c - RW}" stroke="#77716a" stroke-width="9"/>`;
      }
      out += "</g>";
      return out;
    },
  },
  "rug-ivory-shag": {
    grain: "shag",
    svg: () => rugFrame("#dcd3c3", "#ebe4d7", "#d2c8b6", { band: 40, gap: 12 }),
  },
};

// ------------------------------------------------------------ the list

const tiles = {
  // Wallpaper
  "tex-wall-sage-trellis": { grain: "paper", svg: () => trellis("#cfd3c3", "#b1b9a2", { cell: 128, line: 5 }) },
  "tex-wall-ivory-damask": { grain: "paper", svg: () => damask("#ece5d8", "#ddd2bf") },
  "tex-wall-terracotta-stripe": { grain: "paper", svg: () => stripes("#ecdccf", "#d3a891", { bands: 2, width: 96, thin: 8 }) },
  "tex-wall-navy-floral": { grain: "paper", svg: () => floral("#2f3a4c", "#c9a86c", "#e7d6ae", "#6f8a76", { big: 40, small: 20 }) },
  "tex-wall-plaster": { grain: "plaster", svg: () => plain("#e8e0d3") },
  // Curtains
  "tex-cur-ivory-linen": { grain: "linen", svg: () => plain("#ebe4d4") },
  "tex-cur-sage-linen": { grain: "linen", svg: () => plain("#a8b399") },
  "tex-cur-rust-velvet": { grain: "velvet", svg: () => plain("#8e4a34") },
  "tex-cur-navy-velvet": { grain: "velvet", svg: () => plain("#2c3651") },
  "tex-cur-grey-stripe": { grain: "linen", svg: () => stripes("#dedad2", "#9ba1a6", { bands: 4, width: 14, thin: 4 }) },
  // Blind
  "tex-bl-natural-weave": { grain: "jute", svg: () => basket("#cdb791", "#a88f63") },
  "tex-bl-white-linen": { grain: "linen", svg: () => plain("#f1ede4") },
  "tex-bl-charcoal-linen": { grain: "linen", svg: () => plain("#4b4a48") },
  "tex-bl-mustard": { grain: "linen", svg: () => plain("#c79d3f") },
  // Sofa
  "tex-sofa-green-velvet": { grain: "velvet", svg: () => plain("#3e5a45") },
  "tex-sofa-grey-weave": { grain: "tweed", svg: () => plain("#8f908c") },
  "tex-sofa-ivory-boucle": { grain: "boucle", svg: () => plain("#e5ddcf") },
  "tex-sofa-tan-leather": { grain: "leather", svg: () => plain("#a76a3e") },
  "tex-sofa-blue-linen": { grain: "linen", svg: () => plain("#5d7187") },
  // Armchair
  "tex-arm-mustard-velvet": { grain: "velvet", svg: () => plain("#bf8e2f") },
  "tex-arm-floral-print": { grain: "linen", svg: () => floral("#efe6d5", "#c0674c", "#e8c26a", "#7f9672") },
  "tex-arm-grey-herringbone": { grain: "tweed", svg: () => herringbone("#a29f99", "#7e7b75") },
  "tex-arm-blush-linen": { grain: "linen", svg: () => plain("#d9b3a5") },
  // Cushions
  "tex-cush-terracotta": { grain: "linen", svg: () => plain("#b5603f") },
  "tex-cush-geometric": { grain: "linen", svg: () => zigzag("#ece5d6", "#2c2a28") },
  "tex-cush-stripe": { grain: "linen", svg: () => stripes("#e9e0cf", "#3e4a5c", { bands: 4, width: 30, vertical: false }) },
  "tex-cush-olive-velvet": { grain: "velvet", svg: () => plain("#6c6a38") },
  "tex-cush-check": { grain: "tweed", svg: () => check("#d6c4a9", "#8b6d4b", { bands: 4, width: 22 }) },
  // Floor (not changeable: the room's wooden floor)
  "tex-floor-oak": { grain: "oak", svg: () => oak() },
};

// ---------------------------------------------------------------- build

// Drawn at full size, saved smaller: a tile covers about 100-160 px of the
// room on screen, so 320 px is sharp on 2x screens and keeps files small.
const TILE_OUT = 320;
const RUG_OUT = 1000;

async function render(name, w, h, svgBody, grainName, outW, tile) {
  const base = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${svgBody}</svg>`))
    .png()
    .toBuffer();
  const layers = [];
  for (const g of GRAIN[grainName]) layers.push({ input: await noise(w, h, g, tile), blend: "soft-light" });
  const file = path.join(outDir, `${name}-${outW}.webp`);
  const flat = await sharp(base).composite(layers).png().toBuffer();
  await sharp(flat)
    .resize(outW, null, { kernel: "lanczos3" })
    .webp({ quality: 74, effort: 6, smartSubsample: true })
    .toFile(file);
  return file;
}

const sizesFile = path.join(outDir, "sizes.json");
const sizes = JSON.parse(readFileSync(sizesFile, "utf8"));

// Remove files from an earlier run at another size.
for (const f of readdirSync(outDir)) {
  if (/^(tex|rug)-.*\.webp$/.test(f)) unlinkSync(path.join(outDir, f));
}

for (const [name, t] of Object.entries(tiles)) {
  await render(name, S, S, t.svg(), t.grain, TILE_OUT, true);
  sizes[name] = { widths: [TILE_OUT], aspect: [1, 1] };
  console.log(`tile ${name}`);
}
for (const [name, r] of Object.entries(rugs)) {
  await render(name, RW, RH, r.svg(), r.grain, RUG_OUT, false);
  sizes[name] = { widths: [RUG_OUT], aspect: [RW, RH] };
  console.log(`rug  ${name}`);
}

writeFileSync(sizesFile, JSON.stringify(sizes, null, 2) + "\n");
console.log("done: public/demo/sizes.json updated");
