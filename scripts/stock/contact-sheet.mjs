// Builds a labelled contact sheet of Pexels photos so stock images can be
// picked visually. Usage: node scripts/stock/contact-sheet.mjs out.png id1 id2 ...
import sharp from "sharp";

const [out, ...ids] = process.argv.slice(2);
const W = 300;
const H = 220;
const COLS = 5;

const tiles = [];
for (const id of ids) {
  const url = `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=600`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(String(res.status));
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    const img = await sharp(buf).resize(W, H, { fit: "cover" }).toBuffer();
    const label = Buffer.from(
      `<svg width="${W}" height="26"><rect width="${W}" height="26" fill="black" opacity="0.7"/><text x="6" y="18" font-size="15" font-family="Arial" fill="white">${id} (${meta.width}x${meta.height})</text></svg>`,
    );
    tiles.push(await sharp(img).composite([{ input: label, top: 0, left: 0 }]).toBuffer());
  } catch (e) {
    const err = Buffer.from(
      `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#600"/><text x="10" y="30" font-size="16" fill="white">${id} failed ${e.message}</text></svg>`,
    );
    tiles.push(await sharp(err).png().toBuffer());
  }
}

const rows = Math.ceil(tiles.length / COLS);
await sharp({
  create: { width: COLS * W, height: rows * H, channels: 3, background: "#fff" },
})
  .composite(tiles.map((input, i) => ({ input, left: (i % COLS) * W, top: Math.floor(i / COLS) * H })))
  .png()
  .toFile(out);
console.log(`wrote ${out} with ${tiles.length} tiles`);
