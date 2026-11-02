// Draws a 10% grid with labels over demo images, to read hotspot positions.
// Usage: node scripts/stock/grid-sheet.mjs out.png name-width ...
import sharp from "sharp";

const [out, ...names] = process.argv.slice(2);
const tiles = [];
const W = 720;
for (const n of names) {
  const img = await sharp(`public/demo/${n}.webp`).resize({ width: W }).toBuffer();
  const { height: H } = await sharp(img).metadata();
  let lines = "";
  for (let i = 1; i < 10; i++) {
    const x = (W * i) / 10;
    const y = (H * i) / 10;
    lines += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="yellow" stroke-width="1" opacity="0.8"/>`;
    lines += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="yellow" stroke-width="1" opacity="0.8"/>`;
    lines += `<text x="${x + 2}" y="14" font-size="13" fill="yellow" font-family="Arial">${i * 10}</text>`;
    lines += `<text x="2" y="${y - 3}" font-size="13" fill="yellow" font-family="Arial">${i * 10}</text>`;
  }
  const svg = Buffer.from(`<svg width="${W}" height="${H}">${lines}<text x="8" y="${H - 10}" font-size="16" fill="white" font-family="Arial">${n}</text></svg>`);
  tiles.push({ buf: await sharp(img).composite([{ input: svg }]).png().toBuffer(), H });
}
const total = tiles.reduce((a, t) => a + t.H, 0);
let top = 0;
await sharp({ create: { width: W, height: total, channels: 3, background: "#000" } })
  .composite(tiles.map((t) => { const o = { input: t.buf, left: 0, top }; top += t.H; return o; }))
  .png()
  .toFile(out);
console.log(`wrote ${out}`);
