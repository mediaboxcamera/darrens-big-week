// Debug helper: find connected non-white components in a sheet and draw numbered boxes.
// Usage: node tools/detect_debug.js assets/sheet_sprites.png out.png
const sharp = require('sharp');
const [,, inPath, outPath] = process.argv;
(async () => {
  const { data, info } = await sharp(inPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const nonWhite = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = data[i*4], g = data[i*4+1], b = data[i*4+2];
    if (data[i*4+3] >= 100 && Math.min(r, g, b) < 235) nonWhite[i] = 1;
  }
  // connected components 8-conn
  const label = new Int32Array(W * H).fill(-1);
  const comps = [];
  const stack = [];
  for (let s = 0; s < W * H; s++) {
    if (!nonWhite[s] || label[s] >= 0) continue;
    const id = comps.length;
    const c = { id, x0: W, y0: H, x1: 0, y1: 0, n: 0 };
    comps.push(c);
    stack.push(s); label[s] = id;
    while (stack.length) {
      const p = stack.pop();
      const x = p % W, y = (p / W) | 0;
      c.n++;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (nonWhite[q] && label[q] < 0) { label[q] = id; stack.push(q); }
      }
    }
  }
  const big = comps.filter(c => c.n >= 40).sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  big.forEach((c, i) => {
    c.idx = i;
    svg += `<rect x="${c.x0}" y="${c.y0}" width="${c.x1-c.x0+1}" height="${c.y1-c.y0+1}" fill="none" stroke="magenta" stroke-width="1"/>`;
    svg += `<text x="${c.x0}" y="${c.y0+9}" font-size="9" fill="red" font-family="monospace">${i}</text>`;
  });
  svg += '</svg>';
  await sharp(inPath).composite([{ input: Buffer.from(svg) }]).png().toFile(outPath);
  for (const c of big) console.log(`${c.idx}\t${c.x0},${c.y0}-${c.x1},${c.y1}\tw${c.x1-c.x0+1} h${c.y1-c.y0+1}\tn${c.n}`);
})();
