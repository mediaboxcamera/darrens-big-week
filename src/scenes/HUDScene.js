// HUD (heart, lives, coins, timer, score, pause) + all overlay screens:
// pause menu, respawn card, level clear banner, win stats, game over.
import { VIEW_W, VIEW_H } from '../constants.js';
import { audio } from '../audio.js';
import { shareScore, formatClock } from '../share.js';

const GOLD = 0xffe07a, WHITE = 0xffffff;

export class HUDScene extends Phaser.Scene {
  constructor() { super('HUD'); }
  create() {
    const W = VIEW_W;
    this.overlay = null; this.overlayObjs = [];
    // heart (red / blue)
    this.heart = this.add.image(12, 10, 'ui_heart').setDepth(1);
    // lives
    this.face = this.add.image(32, 10, 'face_normal_1').setDisplaySize(14, 14).setDepth(1);
    this.livesText = this.add.bitmapText(42, 6, 'pix', '×3').setTint(WHITE).setDepth(1);
    // coins
    this.add.image(78, 10, 'ui_coin').setDepth(1);
    this.coinText = this.add.bitmapText(88, 6, 'pix', '×0').setTint(WHITE).setDepth(1);
    // timer
    this.timeLabel = this.add.bitmapText(140, 2, 'pix', 'TIME').setTint(GOLD).setDepth(1);
    this.timeText = this.add.bitmapText(140, 11, 'pix', '400').setTint(WHITE).setDepth(1);
    // score panel: the digits are centred in the blank area right of the crown.
    // Their position is derived from the panel's own size so they always stay inside.
    this.panel = this.add.image(W - 80, 14, 'ui_score_panel').setScale(0.75).setDepth(1);
    const pw = this.panel.displayWidth, src = this.panel.width;
    const innerL = 26 / 100 * src, innerR = (src - 7) / 100 * src; // blank area in the 100px-wide art
    const cx = this.panel.x - pw / 2 + ((innerL + innerR) / 2) * (pw / src);
    this.scoreText = this.add.bitmapText(Math.round(cx), Math.round(this.panel.y), 'pix', '000000').setOrigin(0.5, 0.5).setTint(GOLD).setDepth(1);
    // pause button (big invisible hit area)
    this.pauseBtn = this.add.image(W - 14, 12, 'ui_pause').setScale(0.8).setDepth(1).setInteractive({ useHandCursor: true });
    this.pauseBtn.input.hitArea.setTo(-14, -14, 50, 50);
    this.pauseBtn.on('pointerdown', (p, lx, ly, ev) => { ev.stopPropagation(); audio.sfx('click'); this.game.scene.getScene('Game').togglePause(); });
    this.textShadow();
    this.registry.events.on('changedata', this.onData, this);
    this.events.once('shutdown', () => this.registry.events.off('changedata', this.onData, this));
    this.refresh();
  }
  /** 1px navy drop shadow under the free-floating HUD text so it stays readable over clouds. */
  textShadow() {
    for (const t of [this.livesText, this.coinText, this.timeLabel, this.timeText]) {
      const sh = this.add.bitmapText(t.x + 1, t.y + 1, 'pix', t.text).setOrigin(t.originX, t.originY).setTint(0x06122b).setDepth(0.9);
      const orig = t.setText.bind(t);
      t.setText = (v) => { sh.setText(v); return orig(v); };
      t.shadow = sh;
    }
  }
  onData(parent, key) { this.refresh(key); }
  refresh() {
    const r = this.registry;
    this.livesText.setText('×' + (r.get('lives') ?? 3));
    this.coinText.setText('×' + (r.get('coins') ?? 0));
    this.timeText.setText(String(r.get('time') ?? 0));
    this.scoreText.setText(String(r.get('score') ?? 0).padStart(6, '0'));
    const blue = !!r.get('buff');
    if (this.heart.texture.key !== (blue ? 'ui_heart_blue' : 'ui_heart')) this.heart.setTexture(blue ? 'ui_heart_blue' : 'ui_heart');
  }
  pulseHeart() { this.refresh(); this.tweens.add({ targets: this.heart, scaleX: 1.7, scaleY: 1.7, duration: 120, yoyo: true, ease: 'Quad.out' }); }
  flashTime() { this.tweens.add({ targets: [this.timeText, this.timeText.shadow], alpha: 0.2, duration: 150, yoyo: true, repeat: 5 }); }

  /** Called by GameScene.create on every (re)start. */
  reset() { this.clearOverlay(); this.refresh(); }

  // ---------------------------------------------------------- overlays
  clearOverlay() { for (const o of this.overlayObjs) o.destroy(); this.overlayObjs = []; this.overlay = null; }
  dim(alpha = 0.7, color = 0x000000) { const r = this.add.rectangle(0, 0, VIEW_W, VIEW_H, color, alpha).setOrigin(0).setDepth(50).setInteractive(); this.overlayObjs.push(r); return r; }
  text(x, y, str, tint = WHITE, scale = 1, origin = 0.5) { const t = this.add.bitmapText(x, y, 'pix', str).setOrigin(origin).setTint(tint).setScale(scale).setDepth(52); this.overlayObjs.push(t); return t; }
  button(x, y, w, h, label, cb, style = {}) {
    const fill = style.fill ?? 0x15306a, press = style.press ?? 0x2a4f9e;
    const bg = this.add.rectangle(x, y, w, h, fill, 1).setStrokeStyle(2, style.stroke ?? 0xf2c230).setDepth(51).setInteractive({ useHandCursor: true });
    const t = this.add.bitmapText(x, y, 'pix', label).setOrigin(0.5).setTint(style.text ?? GOLD).setScale(style.scale ?? 1).setDepth(52);
    bg.on('pointerdown', (p, lx, ly, ev) => { ev.stopPropagation(); bg.setFillStyle(press); });
    // the callback runs inside the tap's touchend, which is what lets it open the phone's share sheet
    bg.on('pointerup', (p, lx, ly, ev) => { ev.stopPropagation(); bg.setFillStyle(fill); audio.sfx('click'); cb(); });
    bg.on('pointerout', () => bg.setFillStyle(fill));
    this.overlayObjs.push(bg, t); return { bg, t };
  }
  image(x, y, key, depth = 52) { const i = this.add.image(x, y, key).setDepth(depth); this.overlayObjs.push(i); return i; }

  showPause() {
    this.clearOverlay(); this.overlay = 'pause';
    this.dim(0.7);
    this.text(VIEW_W / 2, 52, 'PAUSED', GOLD, 2);
    const game = this.game.scene.getScene('Game');
    this.button(VIEW_W / 2, 100, 150, 26, 'RESUME', () => game.togglePause());
    this.button(VIEW_W / 2, 136, 150, 26, 'RESTART LEVEL', () => { game.paused = false; game.scene.resume(); this.clearOverlay(); game.scene.restart({ fresh: true }); });
    const m = this.button(VIEW_W / 2, 172, 150, 26, audio.muted ? 'SOUND: OFF' : 'SOUND: ON', () => { audio.toggleMute(); m.t.setText(audio.muted ? 'SOUND: OFF' : 'SOUND: ON'); });
    this.text(VIEW_W / 2, 212, 'P / ESC TO RESUME', 0xcfe3ff).setAlpha(0.7);
  }
  hidePause() { if (this.overlay === 'pause') this.clearOverlay(); }

  showRespawnCard(lives, cb) {
    this.clearOverlay(); this.overlay = 'respawn';
    this.dim(1);
    this.image(VIEW_W / 2, 86, 'ui_name_badge').setScale(0.9);
    this.image(VIEW_W / 2 - 22, 130, 'face_normal_1').setScale(1.3);
    this.text(VIEW_W / 2 + 4, 130, `× ${lives}`, WHITE, 2, 0.5).setOrigin(0, 0.5);
    this.text(VIEW_W / 2, 170, lives === 1 ? 'LAST LIFE!' : 'GET BACK OUT THERE', GOLD);
    this.time.delayedCall(1500, () => { this.clearOverlay(); cb(); });
  }

  showGameOver(onRestart, onTitle) {
    this.clearOverlay(); this.overlay = 'gameover';
    const bg = this.dim(0.85);
    const img = this.image(VIEW_W / 2, -80, 'ui_game_over').setScale(0.9);
    this.tweens.add({ targets: img, y: 86, duration: 700, ease: 'Bounce.out' });
    const tap = this.text(VIEW_W / 2, 176, 'TAP TO START OVER', WHITE, 1.4).setAlpha(0);
    this.time.delayedCall(1200, () => {
      if (this.overlay !== 'gameover') return;
      this.time.addEvent({ delay: 450, loop: true, callback: () => tap.setAlpha(tap.alpha ? 0 : 1) });
      bg.once('pointerup', () => { audio.sfx('click'); this.clearOverlay(); onRestart(); });
      this.button(VIEW_W / 2, 212, 104, 22, 'HOME SCREEN', () => { this.clearOverlay(); onTitle(); });
    });
  }

  showLevelClear() {
    this.clearOverlay(); this.overlay = 'clear';
    const img = this.image(VIEW_W / 2, -70, 'ui_game_clear').setScale(0.85);
    this.tweens.add({ targets: img, y: 64, duration: 700, ease: 'Back.out' });
  }

  showWin(stats, onAgain, onTitle) {
    this.clearOverlay(); this.overlay = 'win';
    this.dim(0.8, 0x06122b);
    const W = VIEW_W;
    const img = this.image(W / 2, -70, 'ui_you_win').setScale(0.6);
    this.tweens.add({ targets: img, y: 40, duration: 700, ease: 'Back.out' });
    this.text(W / 2, 85, 'WEEK 7 CHAMPION', GOLD, 1.5);
    const pad = (s, n = 6) => String(s).padStart(n, '0');
    // two columns of stats: label left-aligned, value right-aligned
    const cols = [
      [['SCORE', pad(stats.score)], ['COINS', String(stats.coins)], ['KOS', String(stats.kos ?? 0)]],
      [['TIME', formatClock(stats.ms ?? 0)], ['DEATHS', String(stats.deaths ?? 0)], ['BEST', pad(stats.highScore)]],
    ];
    cols.forEach((rows, c) => rows.forEach(([k, v], i) => {
      const x0 = c ? W / 2 + 14 : W / 2 - 160, x1 = c ? W / 2 + 160 : W / 2 - 14, y = 104 + i * 12;
      this.text(x0, y, k, 0xcfe3ff, 1, 0).setOrigin(0, 0.5);
      this.text(x1, y, v, c === 1 && i === 2 && stats.isNew ? 0x80ff80 : WHITE, 1, 1).setOrigin(1, 0.5);
    }));
    if (stats.isNew) {
      const nh = this.text(W / 2, 145, 'NEW HIGH SCORE!', 0x80ff80);
      this.tweens.add({ targets: nh, alpha: 0.35, duration: 380, yoyo: true, repeat: -1 });
    }
    // the competitive bit: send the score to the league chat
    const share = this.button(W / 2, 170, 236, 26, 'TEXT YOUR SCORE', () => {
      shareScore(stats).then((res) => {
        if (this.overlay !== 'win') return;
        const msg = { copied: 'COPIED - PASTE IT IN A TEXT', failed: 'SHARE NOT AVAILABLE' }[res];
        if (msg) { share.t.setText(msg).setScale(1); this.time.delayedCall(2200, () => this.overlay === 'win' && share.t.setText('TEXT YOUR SCORE').setScale(1.5)); }
      });
    }, { fill: 0xf2c230, press: 0xffe07a, stroke: 0xffffff, text: 0x0b1f44, scale: 1.5 });
    this.tweens.add({ targets: share.bg, scaleX: 1.04, scaleY: 1.1, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.button(W / 2 - 60, 208, 112, 22, 'PLAY AGAIN', () => { this.clearOverlay(); onAgain(); });
    this.button(W / 2 + 60, 208, 112, 22, 'HOME SCREEN', () => { this.clearOverlay(); onTitle(); });
  }
}
