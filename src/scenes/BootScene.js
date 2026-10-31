// Loads every sprite PNG, builds the tileset texture, animations, parallax
// strips, particle textures and the pixel font, then starts the title.
import { TILE } from '../constants.js';
import { installFont } from '../font.js';

export const SPRITES = [
  'darren_idle', 'darren_walk1', 'darren_walk2', 'darren_run1', 'darren_run2', 'darren_jump', 'darren_airborne', 'darren_throw', 'darren_crouch', 'darren_hurt', 'darren_dead',
  'tear_1', 'tear_2', 'tear_3', 'tear_4', 'tear_5', 'tear_6', 'tear_7',
  'buff_idle', 'buff_walk1', 'buff_walk2', 'buff_run1', 'buff_run2', 'buff_jump', 'buff_throw',
  'face_normal_1', 'face_normal_2', 'face_normal_3', 'face_normal_4', 'face_normal_5',
  'item_football', 'item_beer', 'flag_yellow', 'flash_ball', 'shirt_piece',
  'enemy_referee', 'enemy_dog', 'enemy_fan', 'enemy_tackler', 'obstacle_cone', 'obstacle_hedge', 'enemy_paparazzi', 'enemy_security',
  'coin', 'trophy', 'heart', 'wing',
  'tile_ground', 'tile_dirt', 'tile_platform', 'platform_l', 'platform_m', 'platform_r', 'pipe', 'pipe_top', 'pipe_body',
  'block_question', 'block_used', 'brick', 'brick_breakable', 'ladder', 'ladder_tile', 'goal_flag', 'flag_banner', 'cloud', 'bush', 'tree', 'bg_stadium', 'castle',
  'ui_logo', 'ui_heart', 'ui_coin', 'ui_score_panel', 'ui_pause', 'ui_checkpoint', 'cp_flag', 'cp_pole', 'ui_game_clear', 'ui_you_win', 'ui_game_over', 'ui_name_badge',
];

// Tile indices in the generated tileset (0 = empty)
export const T = { EMPTY: 0, GROUND: 1, DIRT: 2, BRICK: 3, BREAKABLE: 4, QUESTION: 5, USED: 6, PIPE_TL: 7, PIPE_TR: 8, PIPE_BL: 9, PIPE_BR: 10, PLAT_L: 11, PLAT_M: 12, PLAT_R: 13, LADDER: 14, STAIR: 15 };

// Night-sky colours: deep navy at the top of the screen fading into the
// stadium image's own top-row blue, so there is no visible edge.
export const SKY_TOP = '#03194f', SKY_EDGE = '#074bb5', PIT = '#06122b';

/** Full-screen dark sky behind the stadium: navy at the top, stadium blue at edgeY,
 *  and dark navy from pitY down (what shows through pits below the stadium art). */
export function addSky(scene, edgeY, pitY = 240, depth = -6) {
  const key = `sky_${Math.round(edgeY)}_${Math.round(pitY)}`;
  if (!scene.textures.exists(key)) {
    const c = scene.textures.createCanvas(key, 4, 240); const ctx = c.getContext();
    const g = ctx.createLinearGradient(0, 0, 0, Math.max(1, edgeY));
    g.addColorStop(0, SKY_TOP); g.addColorStop(1, SKY_EDGE);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 4, Math.max(1, edgeY));
    ctx.fillStyle = SKY_EDGE; ctx.fillRect(0, Math.max(1, edgeY), 4, 240 - edgeY);
    ctx.fillStyle = PIT; ctx.fillRect(0, pitY, 4, 240 - pitY);
    c.refresh();
  }
  return scene.add.image(0, 0, key).setOrigin(0).setDisplaySize(scene.scale.width, 240).setScrollFactor(0).setDepth(depth);
}

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    const w = this.scale.width, h = this.scale.height;
    const bar = this.add.rectangle(w / 2, h / 2, 200, 10, 0x15306a).setStrokeStyle(1, 0xf2c230);
    const fill = this.add.rectangle(w / 2 - 99, h / 2, 1, 8, 0xf2c230).setOrigin(0, 0.5);
    this.load.on('progress', p => { fill.width = Math.max(1, 198 * p); });
    for (const s of SPRITES) this.load.image(s, `sprites/${s}.png`);
    this.load.on('loaderror', f => console.error('Failed to load', f && f.src));
  }
  create() {
    installFont(this, 'pix');
    this.buildTileset();
    this.buildAnimations();
    this.buildParallax();
    this.buildParticleTextures();
    this.buildBlueHeart();
    this.scene.start('Title');
  }

  /** One 24px tileset texture assembled from the individual tile sprites. */
  buildTileset() {
    const order = [null, 'tile_ground', 'tile_dirt', 'brick', 'brick_breakable', 'block_question', 'block_used', ['pipe_top', 0], ['pipe_top', 1], ['pipe_body', 0], ['pipe_body', 1], 'platform_l', 'platform_m', 'platform_r', 'ladder_tile', 'tile_dirt'];
    const canvas = this.textures.createCanvas('tiles', TILE * order.length, TILE);
    const ctx = canvas.getContext();
    order.forEach((o, i) => {
      if (!o) return;
      const key = Array.isArray(o) ? o[0] : o, half = Array.isArray(o) ? o[1] : null;
      const src = this.textures.get(key).getSourceImage();
      if (half === null) ctx.drawImage(src, 0, 0, TILE, TILE, i * TILE, 0, TILE, TILE);
      else ctx.drawImage(src, half * TILE, 0, TILE, TILE, i * TILE, 0, TILE, TILE);
    });
    // stair block: darker dirt with an outline so the staircase reads as solid blocks
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(15 * TILE, 0, TILE, 1); ctx.fillRect(15 * TILE, 0, 1, TILE);
    canvas.refresh();
    const tex = this.textures.get('tiles');
    for (let i = 0; i < order.length; i++) tex.add(`t${i}`, 0, i * TILE, 0, TILE, TILE);
  }

  buildAnimations() {
    const mk = (key, frames, frameRate = 8, repeat = -1) => this.anims.create({ key, frames: frames.map(f => ({ key: f })), frameRate, repeat });
    mk('d_idle', ['darren_idle']); mk('d_walk', ['darren_walk1', 'darren_walk2'], 7); mk('d_run', ['darren_run1', 'darren_run2'], 11);
    mk('d_jump', ['darren_jump']); mk('d_fall', ['darren_airborne']); mk('d_hurt', ['darren_hurt']); mk('d_dead', ['darren_dead']); mk('d_climb', ['darren_jump', 'darren_airborne'], 5);
    mk('b_idle', ['buff_idle']); mk('b_walk', ['buff_walk1', 'buff_walk2'], 7); mk('b_run', ['buff_run1', 'buff_run2'], 11);
    mk('b_jump', ['buff_jump']); mk('b_fall', ['buff_jump']); mk('b_throw', ['buff_throw'], 1, 0); mk('b_hurt', ['darren_hurt']); mk('b_dead', ['darren_dead']); mk('b_climb', ['buff_jump', 'buff_idle'], 5);
    mk('tear', ['tear_1', 'tear_2', 'tear_3', 'tear_4', 'tear_5', 'tear_6', 'tear_7'], 8, 0);
    mk('coin_spin', ['coin'], 1);
  }

  /** Wide strips of clouds / bushes / trees for TileSprite parallax layers. */
  buildParallax() {
    const strip = (key, items, w, h) => {
      const canvas = this.textures.createCanvas(key, w, h); const ctx = canvas.getContext();
      for (const [img, x, y, flip] of items) {
        const src = this.textures.get(img).getSourceImage();
        if (flip) { ctx.save(); ctx.translate(x + src.width, y); ctx.scale(-1, 1); ctx.drawImage(src, 0, 0); ctx.restore(); }
        else ctx.drawImage(src, x, y);
      }
      canvas.refresh();
    };
    strip('strip_clouds', [['cloud', 20, 4], ['cloud', 150, 22, true], ['cloud', 260, 0], ['cloud', 380, 18]], 480, 48);
    strip('strip_bushes', [['bush', 10, 0], ['bush', 200, 0, true], ['bush', 330, 0]], 480, 32);
    strip('strip_trees', [['tree', 60, 0], ['tree', 250, 0, true], ['tree', 400, 0]], 560, 54);
    // seamless stadium: the image followed by its mirror image. The outer 3px
    // columns of the slice are a grey border, so trim them to avoid a seam line.
    const st = this.textures.get('bg_stadium').getSourceImage();
    const T3 = 3, sw = st.width - T3 * 2;
    const c = this.textures.createCanvas('bg_stadium_tile', sw * 2, st.height); const cx = c.getContext();
    cx.drawImage(st, T3, 0, sw, st.height, 0, 0, sw, st.height);
    cx.save(); cx.translate(sw * 2, 0); cx.scale(-1, 1); cx.drawImage(st, T3, 0, sw, st.height, 0, 0, sw, st.height); cx.restore();
    c.refresh();
  }

  buildParticleTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff); g.fillRect(0, 0, 3, 3); g.generateTexture('px_white', 3, 3); g.clear();
    g.fillStyle(0xffe066); g.fillRect(0, 0, 2, 2); g.generateTexture('px_gold', 2, 2); g.clear();
    g.fillStyle(0xc0c0c0); g.fillCircle(2, 2, 2); g.generateTexture('px_dust', 4, 4); g.clear();
    g.fillStyle(0xb5562a); g.fillRect(0, 0, 5, 5); g.fillStyle(0x7a3410); g.fillRect(0, 4, 5, 1); g.generateTexture('px_brick', 5, 5); g.clear();
    g.fillStyle(0xffffff); g.fillRect(0, 0, 1, 1); g.generateTexture('px_1', 1, 1); g.clear();
    // flag pole: 4px wide gold pole with a ball on top, 7 tiles tall
    const poleH = TILE * 7;
    g.fillStyle(0x3a3a3a); g.fillRect(0, 6, 5, poleH - 6); g.fillStyle(0xd8d8d8); g.fillRect(1, 6, 2, poleH - 6);
    g.fillStyle(0xf2c230); g.fillCircle(2.5, 4, 4); g.fillStyle(0xffe07a); g.fillCircle(1.5, 3, 1.5);
    g.generateTexture('pole', 5, poleH); g.clear();
    // invisible 1x1 for zones
    g.destroy();
  }

  /** The powered-up heart: swap red for blue in the heart art. */
  buildBlueHeart() {
    const src = this.textures.get('ui_heart').getSourceImage();
    const c = this.textures.createCanvas('ui_heart_blue', src.width, src.height); const ctx = c.getContext();
    ctx.drawImage(src, 0, 0);
    const id = ctx.getImageData(0, 0, src.width, src.height); const d = id.data;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] && d[i] > d[i + 2] + 40) { const r = d[i]; d[i] = Math.round(d[i + 2] * 0.3); d[i + 1] = Math.round(d[i + 1] * 0.6 + 60); d[i + 2] = r; } }
    ctx.putImageData(id, 0, 0); c.refresh();
  }
}
