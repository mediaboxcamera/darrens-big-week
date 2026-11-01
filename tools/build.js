#!/usr/bin/env node
// Assemble the deployable static site in /dist: index.html + css + manifest +
// icons + sprites + vendored Phaser + the ES module sources. Relative paths only.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const cp = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); };
const cpDir = (src, dst, filter = () => true) => { for (const f of fs.readdirSync(src)) { const s = path.join(src, f), d = path.join(dst, f); if (fs.statSync(s).isDirectory()) cpDir(s, d, filter); else if (filter(s)) cp(s, d); } };

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
cpDir(path.join(ROOT, 'public'), DIST, f => !f.endsWith('contact_sheet.png'));
cpDir(path.join(ROOT, 'src'), path.join(DIST, 'src'));
cp(path.join(ROOT, 'node_modules/phaser/dist/phaser.min.js'), path.join(DIST, 'vendor/phaser.min.js'));

// PWA manifest + icons (Darren's face, cropped from the full-resolution sheet)
const face = await sharp(path.join(ROOT, 'assets/sheet_sprites.png')).extract({ left: 12, top: 387, width: 58, height: 80 }).png().toBuffer();
fs.mkdirSync(path.join(DIST, 'icons'), { recursive: true });
for (const size of [180, 192, 512]) {
  const inner = Math.round(size * 0.8);
  const faceBuf = await sharp(face).resize({ height: inner, kernel: 'lanczos3' }).png().toBuffer();
  const m = await sharp(faceBuf).metadata();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#0b1f44' } })
    .composite([{ input: faceBuf, left: Math.round((size - m.width) / 2), top: Math.round((size - inner) / 2) }]).png()
    .toFile(path.join(DIST, `icons/icon-${size}.png`));
}
fs.writeFileSync(path.join(DIST, 'manifest.webmanifest'), JSON.stringify({
  name: "Darren's Big Week", short_name: 'Darren', start_url: './index.html', scope: './', display: 'fullscreen', orientation: 'any',
  background_color: '#0b1f44', theme_color: '#0b1f44',
  icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
}, null, 2));

// Link-preview card (og:image) shown when someone texts their score: logo + Darren on the grass
{
  const S = (f) => path.join(ROOT, 'public/sprites', f + '.png');
  const up = async (f, k) => { const m = await sharp(S(f)).metadata(); return { buf: await sharp(S(f)).resize(Math.round(m.width * k), Math.round(m.height * k), { kernel: 'nearest' }).png().toBuffer(), w: Math.round(m.width * k), h: Math.round(m.height * k) }; };
  const W = 1200, H = 630, groundH = 72;
  const sky = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03194f"/><stop offset="1" stop-color="#074bb5"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`);
  const logo = await up('ui_logo', 2.6), darren = await up('darren_idle', 4.4), tile = await up('tile_ground', 3);
  const layers = [{ input: logo.buf, left: Math.round((W - logo.w) / 2), top: 34 }, { input: darren.buf, left: Math.round((W - darren.w) / 2), top: H - groundH - darren.h + 6 }];
  for (let x = 0; x < W; x += tile.w) layers.push({ input: tile.buf, left: x, top: H - groundH });
  await sharp(sky).composite(layers).png().toFile(path.join(DIST, 'og-image.png'));
}
console.log('built dist/');
