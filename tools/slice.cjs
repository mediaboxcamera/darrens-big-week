#!/usr/bin/env node
/**
 * Sprite slicer for Darren's Big Week.
 *
 * Reads the two AI-generated sheets in /assets, cleans the background, picks out
 * each sprite, normalises animation sets to a shared bottom-centre anchored frame,
 * scales everything to in-game size and writes individual PNGs to /public/sprites
 * plus a manifest and a contact sheet (tools/contact_sheet.png).
 *
 * Background removal strategy (the sheets are NOT grid aligned):
 *   1. Section header bars / box borders are erased by colour inside known rects
 *      (sprites overlap them, so a plain crop would cut sprite tops off).
 *   2. Background = flood fill from the sheet edges through "traversable" pixels
 *      (transparent OR near-white). Whites enclosed inside a sprite (eyes, socks,
 *      ref stripes, clouds) are never reached, so they survive.
 *   3. Anti-aliased halo pixels (light + semi-transparent, touching background)
 *      are stripped, then alpha is binarised for crisp pixel art.
 *   4. Connected components (8-way) are computed once per sheet. Each sprite def
 *      selects the components whose bounding box lies mostly inside its region,
 *      so detached fragments (stars, shirt pieces, thrown football) are merged and
 *      neighbouring sprites with overlapping boxes are not.
 *   5. Text labels sit in rows below the sprites and are simply outside every region.
 *
 * Usage: node tools/slice.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'sprites');
const TILE = 24;

// Colours of the header bars that sprites overlap (erased inside the rects below).
const BAR_COLORS = [[7, 63, 132], [245, 185, 50], [67, 31, 0]]; // navy, gold, dark gold edge
const SHEETS = {
  sprites: {
    file: 'assets/sheet_sprites.png',
    // rects where bar-coloured pixels are erased: [x0,y0,x1,y1]
    barRects: [[0, 0, 1125, 30], [0, 180, 600, 208], [590, 180, 1125, 208], [0, 357, 1125, 382],
      [0, 479, 1125, 503], [0, 610, 1125, 640]],
    // explicit erase rects (thin box borders that survive the alpha channel)
    eraseRects: [[0, 180, 12, 352], [584, 180, 592, 352], [0, 346, 592, 352],
      // header-bar label text (white, so colour erase misses it)
      [0, 0, 420, 31], [0, 180, 470, 208], [590, 180, 930, 208], [0, 357, 320, 383], [320, 357, 600, 383], [606, 357, 800, 383],
      [0, 479, 200, 503], [814, 479, 960, 503], [0, 610, 200, 640]],
  },
  ui: { file: 'assets/sheet_ui.png', barRects: [], eraseRects: [] },
};

// ---------------------------------------------------------------------------
// Sprite definitions. region = [x0,y0,x1,y1] on the sheet (inclusive).
// mode 'comps' (default) unions components mostly inside the region; 'crop' takes
// the raw rect. Size: height | width | scale | size:[w,h]. set = animation set.
const P = { sheet: 'sprites', set: 'player' };
const DEFS = [
  // --- Darren (normal) ---------------------------------------------------
  { name: 'darren_idle', region: [12, 20, 90, 160], ...P, refHeight: 44 },
  { name: 'darren_walk1', region: [96, 20, 178, 160], ...P },
  { name: 'darren_walk2', region: [180, 20, 262, 160], ...P },
  { name: 'darren_run1', region: [266, 20, 356, 160], ...P },
  { name: 'darren_run2', region: [360, 20, 454, 160], ...P },
  { name: 'darren_jump', region: [456, 15, 545, 160], ...P },
  { name: 'darren_airborne', region: [546, 15, 641, 160], ...P },
  { name: 'darren_throw', region: [642, 15, 800, 160], ...P },
  { name: 'darren_crouch', region: [768, 55, 870, 160], ...P },
  { name: 'darren_hurt', region: [880, 20, 978, 160], ...P },
  { name: 'darren_dead', region: [980, 95, 1115, 160], ...P },
  // --- Shirt tear animation (uses the buff scale) --------------------------
  { name: 'tear_1', region: [12, 190, 80, 345], ...P, scaleFrom: 'buff_idle' },
  { name: 'tear_2', region: [86, 190, 158, 345], ...P, scaleFrom: 'buff_idle' },
  { name: 'tear_3', region: [159, 190, 238, 345], ...P, scaleFrom: 'buff_idle' },
  { name: 'tear_4', region: [239, 190, 322, 345], ...P, scaleFrom: 'buff_idle' },
  { name: 'tear_5', region: [323, 190, 417, 345], ...P, scaleFrom: 'buff_idle' },
  { name: 'tear_6', region: [416, 190, 486, 345], ...P, scaleFrom: 'buff_idle' },
  { name: 'tear_7', region: [475, 190, 584, 345], ...P, scaleFrom: 'buff_idle' },
  // --- Darren powered up (shirtless) --------------------------------------
  { name: 'buff_idle', region: [590, 195, 664, 345], ...P, refHeight: 44 },
  { name: 'buff_walk1', region: [665, 195, 732, 345], ...P, scaleFrom: 'buff_idle' },
  { name: 'buff_walk2', region: [733, 195, 798, 345], ...P, scaleFrom: 'buff_idle' },
  { name: 'buff_run1', region: [799, 195, 872, 345], ...P, scaleFrom: 'buff_idle' },
  { name: 'buff_run2', region: [872, 195, 950, 345], ...P, scaleFrom: 'buff_idle' },
  { name: 'buff_jump', region: [949, 190, 1019, 345], ...P, scaleFrom: 'buff_idle' },
  { name: 'buff_throw', region: [1018, 190, 1120, 345], ...P, scaleFrom: 'buff_idle' },
  // --- Faces --------------------------------------------------------------
  { name: 'face_normal_1', region: [10, 385, 70, 470], sheet: 'sprites', height: 20 },
  { name: 'face_normal_2', region: [73, 385, 131, 470], sheet: 'sprites', height: 20 },
  { name: 'face_normal_3', region: [134, 385, 192, 470], sheet: 'sprites', height: 20 },
  { name: 'face_normal_4', region: [195, 385, 255, 470], sheet: 'sprites', height: 20 },
  { name: 'face_normal_5', region: [256, 385, 318, 470], sheet: 'sprites', height: 20 },
  // --- Items --------------------------------------------------------------
  { name: 'item_football', region: [625, 385, 690, 445], sheet: 'sprites', width: 16 },
  { name: 'item_beer', region: [795, 380, 845, 458], sheet: 'sprites', height: 24 },
  // --- Enemies / obstacles -------------------------------------------------
  { name: 'enemy_referee', region: [10, 503, 96, 583], sheet: 'sprites', scale: 0.36 },
  { name: 'flag_yellow', region: [95, 526, 113, 546], sheet: 'sprites', height: 9 },
  { name: 'enemy_dog', region: [110, 503, 196, 583], sheet: 'sprites', scale: 0.36 },
  { name: 'enemy_fan', region: [198, 503, 275, 583], sheet: 'sprites', scale: 0.36 },
  { name: 'enemy_tackler', region: [278, 503, 392, 583], sheet: 'sprites', scale: 0.36 },
  { name: 'obstacle_cone', region: [400, 503, 470, 583], sheet: 'sprites', height: 24 },
  { name: 'obstacle_hedge', region: [474, 503, 590, 583], sheet: 'sprites', width: 48 },
  { name: 'enemy_paparazzi', region: [598, 503, 702, 583], sheet: 'sprites', scale: 0.38 },
  { name: 'enemy_security', region: [708, 503, 798, 583], sheet: 'sprites', scale: 0.46 },
  // --- Collectibles -------------------------------------------------------
  { name: 'coin', region: [826, 503, 864, 570], sheet: 'sprites', height: 16 },
  { name: 'trophy', region: [872, 503, 929, 570], sheet: 'sprites', height: 24 },
  { name: 'heart', region: [938, 503, 988, 570], sheet: 'sprites', height: 16 },
  { name: 'wing', region: [992, 503, 1048, 570], sheet: 'sprites', height: 18 },
  // --- Tiles / level assets ----------------------------------------------
  { name: 'tile_ground', region: [10, 641, 96, 719], sheet: 'sprites', size: [TILE, TILE], opaque: true },
  { name: 'tile_platform', region: [105, 655, 173, 708], sheet: 'sprites', size: [72, 30] },
  { name: 'pipe', region: [185, 640, 241, 719], sheet: 'sprites', width: 48 },
  { name: 'block_question', region: [249, 645, 300, 698], sheet: 'sprites', size: [TILE, TILE] },
  { name: 'brick', region: [308, 660, 357, 712], sheet: 'sprites', size: [TILE, TILE] },
  { name: 'brick_breakable', region: [420, 660, 469, 712], sheet: 'sprites', size: [TILE, TILE] },
  { name: 'ladder', region: [478, 626, 517, 719], sheet: 'sprites', width: 24 },
  { name: 'goal_flag', region: [518, 624, 584, 719], sheet: 'sprites', scale: 1 },
  { name: 'flag_banner', region: [543, 628, 584, 667], sheet: 'sprites', mode: 'crop', height: 20 },
  { name: 'cloud', region: [583, 648, 662, 694], sheet: 'sprites', scale: 0.5 },
  { name: 'bush', region: [610, 655, 752, 719], sheet: 'sprites', scale: 0.5 },
  { name: 'tree', region: [752, 626, 818, 719], sheet: 'sprites', scale: 0.6 },
  { name: 'bg_stadium', region: [822, 626, 962, 719], sheet: 'sprites', scale: 1, opaque: true },
  { name: 'castle', region: [975, 620, 1105, 719], sheet: 'sprites', height: 96 },
  // --- UI sheet -----------------------------------------------------------
  { name: 'ui_logo', region: [26, 2, 1420, 445], sheet: 'ui', mode: 'crop', width: 300 },
  { name: 'ui_heart', region: [55, 578, 180, 700], sheet: 'ui', height: 14 },
  { name: 'ui_coin', region: [458, 573, 584, 702], sheet: 'ui', mode: 'crop', height: 14 },
  { name: 'ui_score_panel', region: [750, 572, 1100, 707], sheet: 'ui', width: 100, post: 'blankPanel' },
  { name: 'ui_pause', region: [1124, 579, 1261, 703], sheet: 'ui', height: 20 },
  { name: 'ui_checkpoint', region: [1278, 514, 1432, 721], sheet: 'ui', height: 48 },
  { name: 'cp_flag', region: [1338, 553, 1429, 640], sheet: 'ui', mode: 'crop', scaleFrom: 'ui_checkpoint' },
  { name: 'cp_pole', region: [1278, 514, 1432, 721], sheet: 'ui', mode: 'crop', erase: [[1338, 553, 1432, 640]], scaleFrom: 'ui_checkpoint' },
  { name: 'ui_level_clear', region: [5, 702, 528, 967], sheet: 'ui', width: 220 },
  { name: 'ui_you_win', region: [495, 717, 1016, 994], sheet: 'ui', width: 220 },
  { name: 'ui_game_over', region: [1047, 725, 1431, 1004], sheet: 'ui', width: 200 },
  { name: 'ui_name_badge', region: [36, 950, 441, 1080], sheet: 'ui', width: 160 },
];

// ---------------------------------------------------------------------------
// Raw image helpers
const idx = (W, x, y) => (y * W + x) * 4;
const near = (a, b, tol) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;

async function loadSheet(spec) {
  const { data, info } = await sharp(path.join(ROOT, spec.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  // 1. erase bar colours in bar rects + explicit erase rects
  for (const [x0, y0, x1, y1] of spec.barRects) {
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
      const i = idx(W, x, y);
      const px = [data[i], data[i + 1], data[i + 2]];
      if (BAR_COLORS.some(c => near(px, c, 30))) data[i + 3] = 0;
    }
  }
  for (const [x0, y0, x1, y1] of spec.eraseRects) {
    for (let y = y0; y < Math.min(H, y1); y++) for (let x = x0; x < Math.min(W, x1); x++) data[idx(W, x, y) + 3] = 0;
  }
  // 2. flood fill background from the edges through transparent / near-white pixels
  const bg = new Uint8Array(W * H);
  const traversable = (i) => data[i * 4 + 3] < 100 || Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) >= 236;
  const stack = [];
  const seed = (i) => { if (!bg[i] && traversable(i)) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (stack.length) {
    const p = stack.pop(); const x = p % W, y = (p / W) | 0;
    if (x > 0) seed(p - 1); if (x < W - 1) seed(p + 1); if (y > 0) seed(p - W); if (y < H - 1) seed(p + W);
  }
  // Anything fully transparent is background even if enclosed (holes between limbs etc.)
  for (let i = 0; i < W * H; i++) if (data[i * 4 + 3] < 100) bg[i] = 1;
  // 3. halo cleanup: light, semi-transparent pixels touching background -> background (2 passes)
  for (let pass = 0; pass < 2; pass++) {
    const add = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (bg[i]) continue;
      const a = data[i * 4 + 3], m = Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      if (!(m >= 200 && a < 245)) continue;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (bg[ny * W + nx]) { touches = true; break; }
      }
      if (touches) add.push(i);
    }
    for (const i of add) bg[i] = 1;
  }
  // 4. binarise alpha
  for (let i = 0; i < W * H; i++) data[i * 4 + 3] = bg[i] ? 0 : 255;
  // 5. connected components of foreground (8-way)
  const label = new Int32Array(W * H).fill(-1);
  const comps = [];
  for (let s = 0; s < W * H; s++) {
    if (bg[s] || label[s] >= 0) continue;
    const c = { id: comps.length, x0: W, y0: H, x1: 0, y1: 0, n: 0, px: [] };
    comps.push(c); label[s] = c.id; stack.push(s);
    while (stack.length) {
      const p = stack.pop(); const x = p % W, y = (p / W) | 0;
      c.n++; c.px.push(p);
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx; if (!bg[q] && label[q] < 0) { label[q] = c.id; stack.push(q); }
      }
    }
  }
  return { data, W, H, comps };
}

/** Extract a sprite as a raw RGBA buffer trimmed to content. */
function extract(sheet, def) {
  const { data, W, comps } = sheet;
  const [rx0, ry0, rx1, ry1] = def.region;
  const rw = rx1 - rx0 + 1, rh = ry1 - ry0 + 1;
  const out = Buffer.alloc(rw * rh * 4);
  if (def.mode === 'crop') {
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const si = idx(W, rx0 + x, ry0 + y), di = idx(rw, x, y);
      out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
    }
  } else {
    const minInside = def.minInside ?? 0.6, minPx = def.minComp ?? 12;
    const chosen = comps.filter(c => {
      if (c.n < minPx) return false;
      const ix = Math.max(0, Math.min(c.x1, rx1) - Math.max(c.x0, rx0) + 1);
      const iy = Math.max(0, Math.min(c.y1, ry1) - Math.max(c.y0, ry0) + 1);
      return (ix * iy) / ((c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1)) >= minInside;
    });
    if (!chosen.length) throw new Error(`No components for ${def.name}`);
    for (const c of chosen) for (const p of c.px) {
      const x = p % W, y = (p / W) | 0;
      if (x < rx0 || x > rx1 || y < ry0 || y > ry1) continue; // clip to region
      const si = p * 4, di = idx(rw, x - rx0, y - ry0);
      out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = 255;
    }
  }
  if (def.erase) for (const [x0, y0, x1, y1] of def.erase) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const lx = x - rx0, ly = y - ry0; if (lx < 0 || ly < 0 || lx >= rw || ly >= rh) continue;
      out[idx(rw, lx, ly) + 3] = 0;
    }
  }
  // trim
  let x0 = rw, y0 = rh, x1 = -1, y1 = -1;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) if (out[idx(rw, x, y) + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error(`Empty sprite ${def.name}`);
  const tw = x1 - x0 + 1, th = y1 - y0 + 1, trimmed = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) out.copy(trimmed, idx(tw, 0, y), idx(rw, x0, y0 + y), idx(rw, x0, y0 + y) + tw * 4);
  return { buf: trimmed, w: tw, h: th, sheetX: rx0 + x0, sheetY: ry0 + y0 };
}

/** Resize a raw RGBA sprite, then binarise alpha for crisp pixel art. */
async function scaleSprite(sp, tw, th, opaque) {
  tw = Math.max(1, Math.round(tw)); th = Math.max(1, Math.round(th));
  const { data } = await sharp(sp.buf, { raw: { width: sp.w, height: sp.h, channels: 4 } })
    .resize(tw, th, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  // median-ish fill colour for opaque tiles = average of opaque pixels
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < tw * th; i++) if (data[i * 4 + 3] >= 128) { r += data[i * 4]; g += data[i * 4 + 1]; b += data[i * 4 + 2]; n++; }
  for (let i = 0; i < tw * th; i++) {
    if (data[i * 4 + 3] >= 128) data[i * 4 + 3] = 255;
    else if (opaque && n) { data[i * 4] = r / n; data[i * 4 + 1] = g / n; data[i * 4 + 2] = b / n; data[i * 4 + 3] = 255; }
    else { data[i * 4] = 0; data[i * 4 + 1] = 0; data[i * 4 + 2] = 0; data[i * 4 + 3] = 0; }
  }
  return { buf: data, w: tw, h: th };
}

/** Place a sprite bottom-centre inside a fixed frame. */
function frame(sp, fw, fh) {
  const out = Buffer.alloc(fw * fh * 4);
  const ox = Math.floor((fw - sp.w) / 2), oy = fh - sp.h;
  for (let y = 0; y < sp.h; y++) sp.buf.copy(out, idx(fw, ox, oy + y), idx(sp.w, 0, y), idx(sp.w, 0, y) + sp.w * 4);
  return { buf: out, w: fw, h: fh };
}

const fill = (sp, x0, y0, x1, y1, [r, g, b]) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = idx(sp.w, x, y); sp.buf[i] = r; sp.buf[i + 1] = g; sp.buf[i + 2] = b; sp.buf[i + 3] = 255; } };
const crop = (sp, x0, y0, w, h) => { const out = Buffer.alloc(w * h * 4); for (let y = 0; y < h; y++) sp.buf.copy(out, idx(w, 0, y), idx(sp.w, x0, y0 + y), idx(sp.w, x0, y0 + y) + w * 4); return { buf: out, w, h }; };
const px = (sp, x, y, [r, g, b]) => { if (x < 0 || y < 0 || x >= sp.w || y >= sp.h) return; const i = idx(sp.w, x, y); sp.buf[i] = r; sp.buf[i + 1] = g; sp.buf[i + 2] = b; sp.buf[i + 3] = 255; };

/** Hand-drawn tiles in the sheet palette (seamless by construction). */
function drawLadderTile() {
  const sp = { buf: Buffer.alloc(TILE * TILE * 4), w: TILE, h: TILE };
  const rail = [242, 149, 62], light = [250, 190, 110], dark = [52, 17, 0], mid = [200, 100, 30];
  for (let y = 0; y < TILE; y++) {
    for (const x0 of [2, 17]) { px(sp, x0, y, dark); px(sp, x0 + 1, y, light); px(sp, x0 + 2, y, rail); px(sp, x0 + 3, y, mid); px(sp, x0 + 4, y, dark); }
  }
  for (const y0 of [4, 16]) for (let x = 7; x < 17; x++) { px(sp, x, y0, dark); px(sp, x, y0 + 1, light); px(sp, x, y0 + 2, rail); px(sp, x, y0 + 3, dark); }
  return sp;
}
function drawUsedBlock() {
  const sp = { buf: Buffer.alloc(TILE * TILE * 4), w: TILE, h: TILE };
  fill(sp, 0, 0, TILE, TILE, [150, 80, 30]);
  fill(sp, 1, 1, TILE - 1, TILE - 1, [196, 110, 40]);
  fill(sp, 3, 3, TILE - 3, TILE - 3, [170, 92, 34]);
  for (const [x, y] of [[5, 5], [16, 5], [5, 16], [16, 16]]) fill(sp, x, y, x + 3, y + 3, [120, 60, 20]);
  fill(sp, 1, 1, TILE - 1, 2, [230, 150, 70]); fill(sp, 1, 1, 2, TILE - 1, [230, 150, 70]);
  return sp;
}
function drawShirtPiece() {
  const sp = { buf: Buffer.alloc(6 * 6 * 4), w: 6, h: 6 };
  fill(sp, 1, 0, 5, 6, [20, 70, 170]); fill(sp, 0, 1, 6, 5, [20, 70, 170]); fill(sp, 2, 1, 4, 3, [60, 120, 220]);
  return sp;
}
function drawFlashBall() {
  const sp = { buf: Buffer.alloc(10 * 10 * 4), w: 10, h: 10 };
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) { const d = Math.hypot(x - 4.5, y - 4.5); if (d < 4.6) px(sp, x, y, d < 2.5 ? [255, 255, 240] : [255, 230, 120]); }
  return sp;
}

// ---------------------------------------------------------------------------
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const sheets = {};
  for (const [k, spec] of Object.entries(SHEETS)) { sheets[k] = await loadSheet(spec); console.log(`${k}: ${sheets[k].comps.length} components`); }

  // Pass 1: extract native-res sprites
  const native = {};
  for (const def of DEFS) native[def.name] = extract(sheets[def.sheet], def);

  // Pass 2: work out scale factors (sets share scale via refHeight / scaleFrom)
  const scaleOf = {};
  for (const def of DEFS) {
    const sp = native[def.name];
    if (def.refHeight) scaleOf[def.name] = def.refHeight / sp.h;
    else if (def.scale) scaleOf[def.name] = def.scale;
    else if (def.height) scaleOf[def.name] = def.height / sp.h;
    else if (def.width) scaleOf[def.name] = def.width / sp.w;
  }
  for (const def of DEFS) if (def.scaleFrom) scaleOf[def.name] = scaleOf[def.scaleFrom];
  for (const def of DEFS) if (def.set === 'player' && !scaleOf[def.name]) scaleOf[def.name] = scaleOf.darren_idle;

  // Pass 3: scale
  const scaled = {};
  for (const def of DEFS) {
    const sp = native[def.name];
    const s = scaleOf[def.name];
    const [tw, th] = def.size ? def.size : [sp.w * s, sp.h * s];
    scaled[def.name] = await scaleSprite(sp, tw, th, def.opaque);
  }

  // Pass 4: normalise animation sets to a shared frame (bottom-centre anchor)
  const manifest = { tile: TILE, sprites: {}, frames: {} };
  const playerDefs = DEFS.filter(d => d.set === 'player');
  const fw = Math.max(...playerDefs.map(d => scaled[d.name].w)), fh = Math.max(...playerDefs.map(d => scaled[d.name].h));
  for (const d of playerDefs) scaled[d.name] = frame(scaled[d.name], fw, fh);
  manifest.frames.player = { w: fw, h: fh, anchor: 'bottom-center' };

  // Pass 5: post-processing + derived tiles
  const out = {};
  for (const def of DEFS) out[def.name] = scaled[def.name];
  { // blank the score panel interior so the game can draw live digits on it
    const p = out.ui_score_panel; fill(p, 26, 6, p.w - 7, p.h - 7, [18, 18, 20]);
  }
  { // ground: top = grass tile, dirt tile from the lower part of the native sprite
    const g = native.tile_ground;
    out.tile_dirt = await scaleSprite(crop(g, 10, Math.round(g.h * 0.42), g.w - 20, Math.round(g.h * 0.5)), TILE, TILE, true);
  }
  { // pipe: cap + body slices (48 wide)
    const p = out.pipe; out.pipe_top = crop(p, 0, 0, p.w, TILE);
    out.pipe_body = crop(p, 0, Math.min(p.h - TILE, 30), p.w, TILE);
    // make the body fully opaque columns (rim already in the art)
  }
  { // platform: left / middle / right 24px pieces
    const p = out.tile_platform; out.platform_l = crop(p, 0, 0, TILE, p.h); out.platform_m = crop(p, TILE, 0, TILE, p.h); out.platform_r = crop(p, p.w - TILE, 0, TILE, p.h);
  }
  out.ladder_tile = drawLadderTile();
  out.block_used = drawUsedBlock();
  out.shirt_piece = drawShirtPiece();
  out.flash_ball = drawFlashBall();

  // Pass 6: write PNGs + manifest
  for (const [name, sp] of Object.entries(out)) {
    await sharp(sp.buf, { raw: { width: sp.w, height: sp.h, channels: 4 } }).png().toFile(path.join(OUT, `${name}.png`));
    manifest.sprites[name] = { w: sp.w, h: sp.h };
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`wrote ${Object.keys(out).length} sprites to public/sprites`);

  // Pass 7: contact sheet (checkerboard, 2x nearest, labelled)
  await contactSheet(out);
}

async function contactSheet(out) {
  const SCALE = 2, PAD = 8, LABEL = 12, MAXW = 1500;
  const items = Object.entries(out).map(([name, sp]) => ({ name, sp, cw: Math.max(sp.w * SCALE, name.length * 6) + PAD, ch: sp.h * SCALE + LABEL + PAD }));
  // flow layout
  let x = PAD, y = PAD, rowH = 0, W = 0; const placed = [];
  for (const it of items) {
    if (x + it.cw > MAXW) { x = PAD; y += rowH; rowH = 0; }
    placed.push({ ...it, x, y }); x += it.cw; rowH = Math.max(rowH, it.ch); W = Math.max(W, x);
  }
  const H = y + rowH + PAD; W += PAD;
  const buf = Buffer.alloc(W * H * 4);
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) { const i = idx(W, xx, yy); const c = ((xx >> 3) + (yy >> 3)) & 1 ? 190 : 150; buf[i] = c; buf[i + 1] = c; buf[i + 2] = c; buf[i + 3] = 255; }
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (const it of placed) {
    const { sp } = it;
    for (let yy = 0; yy < sp.h * SCALE; yy++) for (let xx = 0; xx < sp.w * SCALE; xx++) {
      const si = idx(sp.w, xx / SCALE | 0, yy / SCALE | 0); if (!sp.buf[si + 3]) continue;
      const di = idx(W, it.x + xx, it.y + yy); buf[di] = sp.buf[si]; buf[di + 1] = sp.buf[si + 1]; buf[di + 2] = sp.buf[si + 2]; buf[di + 3] = 255;
    }
    svg += `<rect x="${it.x - 0.5}" y="${it.y - 0.5}" width="${sp.w * SCALE + 1}" height="${sp.h * SCALE + 1}" fill="none" stroke="#f0f" stroke-width="1"/>`;
    svg += `<text x="${it.x}" y="${it.y + sp.h * SCALE + 10}" font-size="9" font-family="monospace" fill="#000">${it.name} ${sp.w}x${sp.h}</text>`;
  }
  svg += '</svg>';
  await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).composite([{ input: Buffer.from(svg) }]).png().toFile(path.join(__dirname, 'contact_sheet.png'));
  console.log(`contact sheet ${W}x${H} -> tools/contact_sheet.png`);
}

main().catch(e => { console.error(e); process.exit(1); });
