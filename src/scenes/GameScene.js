// The level itself: tilemap, entities, collisions, camera, power-ups, deaths,
// checkpoints, the flagpole finale. UI overlays live in HUDScene.
import { TILE, VIEW_W, VIEW_H, ROWS, PHYS, RULES, SCORE } from '../constants.js';
import { buildLevel } from '../level.js';
import { T } from './BootScene.js';
import { Player } from '../entities/Player.js';
import { Enemy } from '../entities/Enemy.js';
import { Item, Football, EnemyShot } from '../entities/Items.js';
import { audio } from '../audio.js';
import { input, setThrowVisible } from '../controls.js';
import { loadHighScore, saveHighScore } from '../storage.js';

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  init(data) {
    const r = this.registry;
    if (data.fresh || r.get('lives') === undefined) {
      r.set({ lives: RULES.startLives, score: 0, coins: 0, time: RULES.startTime, buff: false, checkpoint: null, highScore: loadHighScore() });
    } else {
      r.set({ time: RULES.startTime, buff: false });
    }
    this.paused = false;
    this.phase = 'play'; // play | tear | dying | finale | won | gameover
    this.pauseDepth = 0;
  }

  create() {
    if (!this.scene.isActive('HUD')) this.scene.launch('HUD');
    this.hud = this.scene.get('HUD');
    this.hud.events.once('create', () => this.hud.reset());
    if (this.hud.scene.isActive()) this.hud.reset();

    const L = buildLevel(); this.level = L;
    this.levelW = L.cols * TILE; this.levelH = ROWS * TILE;
    this.groundTop = (ROWS - 2) * TILE;
    this.physics.world.resume();
    this.physics.world.setBounds(0, -400, this.levelW, this.levelH + 800);
    this.physics.world.setBoundsCollision(true, true, false, false);

    this.buildBackground();
    this.buildMap();
    this.buildParticles();
    this.buildEntities();
    this.buildPlayer();
    this.buildColliders();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.levelW, this.levelH);
    cam.scrollX = Phaser.Math.Clamp(this.player.x - 150, 0, this.levelW - VIEW_W);
    cam.fadeIn(300, 0, 0, 0);

    this.timerEvent = this.time.addEvent({ delay: 1000, loop: true, callback: this.tickTimer, callbackScope: this });
    setThrowVisible(false);
    audio.playMusic('level');
    this.prevBlockedUp = false;
    this.events.once('shutdown', () => { setThrowVisible(false); });
  }

  // ------------------------------------------------------------------ build
  buildBackground() {
    this.cameras.main.setBackgroundColor('#6fb7ff');
    this.stadium = this.add.tileSprite(0, this.groundTop + 10 - 93 * 1.7, VIEW_W / 1.7, 93, 'bg_stadium_tile').setOrigin(0).setScale(1.7).setScrollFactor(0).setDepth(-5);
    this.clouds = this.add.tileSprite(0, 6, VIEW_W, 48, 'strip_clouds').setOrigin(0).setScrollFactor(0).setDepth(-4);
    this.trees = this.add.tileSprite(0, this.groundTop - 54, VIEW_W, 54, 'strip_trees').setOrigin(0).setScrollFactor(0).setDepth(-3);
    this.bushes = this.add.tileSprite(0, this.groundTop - 32, VIEW_W, 32, 'strip_bushes').setOrigin(0).setScrollFactor(0).setDepth(-2);
  }

  buildMap() {
    const { cols, rows, grid } = this.level;
    this.map = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: cols, height: rows });
    const tileset = this.map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0);
    this.layer = this.map.createBlankLayer('main', tileset).setDepth(2);
    this.blockContent = new Map();
    const at = (c, r) => (c < 0 || c >= cols || r < 0 || r >= rows) ? ' ' : grid[r][c];
    const solid = (c, r) => '#=BXYZ?QHp'.includes(at(c, r)) && at(c, r) !== ' ';
    const oneWay = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const ch = grid[r][c]; let idx = T.EMPTY;
      switch (ch) {
        case '#': idx = solid(c, r - 1) ? T.DIRT : T.GROUND; break;
        case '=': { const l = at(c - 1, r) === '=', rt = at(c + 1, r) === '='; idx = !l && rt ? T.PLAT_L : l && !rt ? T.PLAT_R : T.PLAT_M; oneWay.push([c, r]); break; }
        case 'B': idx = T.BRICK; break;
        case 'X': idx = T.BREAKABLE; break;
        case 'Y': idx = T.BREAKABLE; this.blockContent.set(`${c},${r}`, 'trophy'); break;
        case 'Z': idx = T.BREAKABLE; this.blockContent.set(`${c},${r}`, 'wing'); break;
        case '?': idx = T.QUESTION; this.blockContent.set(`${c},${r}`, 'coin'); break;
        case 'Q': idx = T.QUESTION; this.blockContent.set(`${c},${r}`, 'beer'); break;
        case 'H': idx = T.QUESTION; this.blockContent.set(`${c},${r}`, 'heart'); break;
        case 'p': { let n = 0; while (at(c - 1 - n, r) === 'p') n++; const left = n % 2 === 0; const top = at(c, r - 1) !== 'p'; idx = top ? (left ? T.PIPE_TL : T.PIPE_TR) : (left ? T.PIPE_BL : T.PIPE_BR); break; }
        case 'L': idx = T.LADDER; break;
        default: continue;
      }
      this.layer.putTileAt(idx, c, r);
    }
    this.layer.setCollision([T.GROUND, T.DIRT, T.BRICK, T.BREAKABLE, T.QUESTION, T.USED, T.PIPE_TL, T.PIPE_TR, T.PIPE_BL, T.PIPE_BR, T.STAIR]);
    for (const [c, r] of oneWay) this.layer.getTileAt(c, r).setCollision(false, false, true, false, false);
    // ladder tops are one-way platforms so you can stand on them
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (at(c, r) === 'L' && at(c, r - 1) !== 'L') this.layer.getTileAt(c, r).setCollision(false, false, true, false, false);
    this.layer.calculateFacesWithin(0, 0, cols, rows);
  }

  buildParticles() {
    const mk = (tex, cfg) => this.add.particles(0, 0, tex, { emitting: false, ...cfg }).setDepth(12);
    this.dust = mk('px_dust', { speed: { min: 15, max: 45 }, angle: { min: 200, max: 340 }, lifespan: 320, scale: { start: 1, end: 0 }, gravityY: 150, maxAliveParticles: 40 });
    this.sparkle = mk('px_gold', { speed: { min: 30, max: 80 }, angle: { min: 0, max: 360 }, lifespan: 400, scale: { start: 1.5, end: 0 }, maxAliveParticles: 40 });
    this.debris = mk('px_brick', { speed: { min: 80, max: 160 }, angle: { min: 220, max: 320 }, lifespan: 900, gravityY: 600, rotate: { start: 0, end: 360 }, maxAliveParticles: 30 });
    this.shirt = mk('shirt_piece', { speed: { min: 60, max: 150 }, angle: { min: 200, max: 340 }, lifespan: 1000, gravityY: 300, rotate: { start: 0, end: 720 }, alpha: { start: 1, end: 0 }, maxAliveParticles: 30 });
    this.fire = mk('px_white', { speed: { min: 40, max: 120 }, angle: { min: 0, max: 360 }, lifespan: { min: 500, max: 900 }, gravityY: 60, scale: { start: 1, end: 0 }, maxAliveParticles: 120, tint: [0xff4040, 0xffe066, 0x60c0ff, 0xffffff, 0x80ff80] });
  }

  buildEntities() {
    this.enemies = this.add.group({ runChildUpdate: false });
    this.blockers = this.add.group();
    this.items = this.add.group();
    this.coins = this.physics.add.staticGroup();
    this.obstacles = this.physics.add.staticGroup();
    this.footballs = this.add.group({ classType: Football, maxSize: RULES.maxFootballs });
    this.shots = this.add.group();
    this.checkpoints = [];
    const cpIndex = (this.registry.get('checkpoint') || {}).index ?? -1;
    for (const e of this.level.entities) {
      const x = e.col * TILE + TILE / 2, y = (e.row + 1) * TILE;
      switch (e.type) {
        case 'start': this.startPos = { x, y }; break;
        case 'coin': { const c = this.coins.create(x, y - TILE / 2, 'coin'); c.body.setSize(12, 14); c.body.updateFromGameObject(); this.tweens.add({ targets: c, y: c.y - 3, duration: 500 + (e.col % 3) * 100, yoyo: true, repeat: -1, ease: 'Sine.inOut' }); break; }
        case 'trophy': case 'heart': case 'wing': this.items.add(new Item(this, x, y, e.type, false)); break;
        case 'cone': case 'hedge': { const o = this.obstacles.create(x, y, e.type === 'cone' ? 'obstacle_cone' : 'obstacle_hedge').setOrigin(0.5, 1); o.body.setSize(o.width - 4, o.height - 3).setOffset(2, 3); o.body.updateFromGameObject(); o.setDepth(6); break; }
        case 'fan': case 'dog': case 'tackler': case 'referee': case 'paparazzi': { const en = new Enemy(this, x, y, e.type); this.enemies.add(en); break; }
        case 'security': { const en = new Enemy(this, x, y, 'security'); this.blockers.add(en); break; }
        case 'checkpoint': {
          const i = this.checkpoints.length;
          const pole = this.add.image(x, y, 'cp_pole').setOrigin(0.5, 1).setDepth(3);
          const flag = this.add.image(x + 2, y - 12, 'cp_flag').setOrigin(0, 1).setDepth(3);
          const zone = this.add.zone(x, y - 24, 20, 48); this.physics.add.existing(zone, true);
          const cp = { index: i, x, y, pole, flag, zone, active: false };
          this.checkpoints.push(cp);
          if (i <= cpIndex) { cp.active = true; flag.y = y - 40; } else { flag.setAlpha(0.5).setScale(0.6); }
          break;
        }
        case 'goal': {
          this.goal = { x, y };
          this.add.image(x, y, 'pole').setOrigin(0.5, 1).setDepth(3);
          this.goalFlag = this.add.image(x + 2, y - TILE * 7 + 6, 'flag_banner').setOrigin(0, 0).setDepth(3);
          const zone = this.add.zone(x, y - TILE * 3.5, 8, TILE * 7); this.physics.add.existing(zone, true); this.goalZone = zone;
          break;
        }
        case 'castle': this.castle = this.add.image(x, y, 'castle').setOrigin(0.5, 1).setDepth(1); break;
      }
    }
  }

  buildPlayer() {
    const cp = this.registry.get('checkpoint');
    const p = cp ? { x: cp.x, y: cp.y } : this.startPos;
    this.player = new Player(this, p.x, p.y);
    this.player.setDepth(10);
    if (cp) this.player.invincible = 1.0;
  }

  buildColliders() {
    const P = this.player, ph = this.physics;
    ph.add.collider(P, this.layer);
    ph.add.collider(this.enemies, this.layer);
    ph.add.collider(this.blockers, this.layer);
    ph.add.collider(this.items, this.layer);
    ph.add.collider(this.footballs, this.layer);
    ph.add.collider(this.shots, this.layer, (s) => { if (s.kind === 'flash') s.destroy(); });
    ph.add.collider(this.enemies, this.obstacles);
    ph.add.collider(this.items, this.obstacles);
    ph.add.collider(this.footballs, this.obstacles, (f) => { this.puff(f.x, f.y); f.disable(); });
    ph.add.overlap(P, this.enemies, this.onPlayerEnemy, (p, e) => e.alive && p.state === 'normal', this);
    ph.add.collider(P, this.blockers, this.onPlayerBlocker, (p, e) => e.alive && p.state === 'normal', this);
    ph.add.collider(P, this.obstacles, this.onPlayerObstacle, undefined, this);
    ph.add.overlap(P, this.coins, (p, c) => this.collectCoin(c), undefined, this);
    ph.add.overlap(P, this.items, (p, it) => this.collectItem(it), (p, it) => it.collectable && p.state === 'normal', this);
    ph.add.overlap(P, this.shots, (p, s) => { if (p.hurt()) s.destroy(); }, undefined, this);
    ph.add.overlap(this.footballs, this.enemies, (f, e) => { if (e.alive && f.active) { f.disable(); this.puff(f.x, f.y); e.hit(true); } }, undefined, this);
    ph.add.overlap(this.footballs, this.blockers, (f, e) => { if (e.alive && f.active) { f.disable(); this.puff(f.x, f.y); e.hit(true); audio.sfx('bump'); } }, undefined, this);
    for (const cp of this.checkpoints) ph.add.overlap(P, cp.zone, () => this.activateCheckpoint(cp), () => !cp.active && P.state === 'normal', this);
    ph.add.overlap(P, this.goalZone, () => this.startFinale(), () => this.phase === 'play' && P.state === 'normal', this);
  }

  // ------------------------------------------------------------------ loop
  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    const cam = this.cameras.main;
    if (this.phase === 'play' || this.phase === 'tear') {
      this.player.update(dt, input.state);
      this.handleHeadBump();
      if (this.player.y > this.levelH + 30 && this.player.state !== 'dead') this.pitDeath();
      // keep Darren inside the camera's left edge (the camera never scrolls back)
      if (this.player.body.left < cam.scrollX) { this.player.x = cam.scrollX + PHYS.bodyW / 2; if (this.player.body.velocity.x < 0) this.player.body.setVelocityX(0); }
    } else if (this.phase === 'finale') this.updateFinale(dt);

    for (const e of this.enemies.getChildren()) e.update(dt, this.player, cam);
    for (const e of this.blockers.getChildren()) e.update(dt, this.player, cam);
    for (const it of this.items.getChildren()) it.update(dt);
    for (const f of this.footballs.getChildren()) f.update(dt);
    for (const s of this.shots.getChildren()) s.update(dt);

    // camera: smooth, slight look-ahead, never backwards
    if (this.phase !== 'dying') {
      const look = 150;
      const target = Phaser.Math.Clamp(this.player.x - look, 0, this.levelW - VIEW_W);
      let sx = cam.scrollX + (target - cam.scrollX) * Math.min(1, dt * 7);
      if (sx < cam.scrollX) sx = cam.scrollX;
      cam.scrollX = sx;
    }
    // parallax
    const sx = cam.scrollX;
    this.stadium.tilePositionX = sx * 0.12 / 1.7;
    this.clouds.tilePositionX = sx * 0.3 + time * 0.004;
    this.trees.tilePositionX = sx * 0.5;
    this.bushes.tilePositionX = sx * 0.7;
  }

  tickTimer() {
    if (this.phase !== 'play') return;
    const t = this.registry.get('time') - 1;
    this.registry.set('time', t);
    if (t === 60) { audio.sfx('whistle'); this.hud.flashTime(); }
    if (t <= 0) { this.popText(this.player.x, this.player.y - 50, 'TIME UP!', 0xff6060); this.player.die(); }
  }

  // ------------------------------------------------------------ helpers
  ladderAt(x, y) { const t = this.layer.getTileAtWorldXY(x, y); return t && t.index === T.LADDER ? t : null; }
  solidBelow(x, y) {
    const t = this.layer.getTileAtWorldXY(x, y + 1); if (t && t.collides) return true;
    return this.obstacles.getChildren().some(o => x > o.body.left && x < o.body.right && Math.abs(o.body.top - y) < 6);
  }
  squash(sprite, sx, sy) {
    this.tweens.killTweensOf(sprite); sprite.setScale(sx, sy);
    this.tweens.add({ targets: sprite, scaleX: 1, scaleY: 1, duration: 160, ease: 'Quad.out' });
  }
  landDust(s) { this.dust.explode(5, s.x, s.y); }
  puff(x, y) { this.dust.explode(6, x, y); }
  hitPause(ms) {
    this.pauseDepth++; this.physics.world.pause();
    this.time.delayedCall(ms, () => { this.pauseDepth--; if (this.pauseDepth <= 0 && this.phase !== 'tear' && this.phase !== 'dying') this.physics.world.resume(); });
  }
  popText(x, y, text, tint = 0xffffff) {
    const t = this.add.bitmapText(x, y, 'pix', text).setOrigin(0.5).setTint(tint).setDepth(20);
    this.tweens.add({ targets: t, y: y - 22, alpha: 0, duration: 800, ease: 'Quad.out', onComplete: () => t.destroy() });
    return t;
  }
  addScore(n, x, y) {
    this.registry.set('score', this.registry.get('score') + n);
    if (x !== undefined) this.popText(x, y, String(n), 0xffe066);
  }

  // ---------------------------------------------------------- blocks
  handleHeadBump() {
    const b = this.player.body;
    const hit = b.blocked.up && !this.prevBlockedUp && this.player.state === 'normal';
    this.prevBlockedUp = b.blocked.up;
    if (!hit) return;
    const y = b.top - 2;
    const bumpable = (t) => t && [T.QUESTION, T.BRICK, T.BREAKABLE].includes(t.index);
    let tile = this.layer.getTileAtWorldXY(b.center.x, y);
    if (!bumpable(tile)) { const l = this.layer.getTileAtWorldXY(b.left + 3, y), r = this.layer.getTileAtWorldXY(b.right - 3, y); tile = bumpable(l) ? l : bumpable(r) ? r : null; }
    if (tile) this.bumpBlock(tile);
  }
  bumpBlock(tile) {
    const key = `${tile.x},${tile.y}`; const content = this.blockContent.get(key);
    const wx = tile.getCenterX(), wy = tile.getTop();
    // knock any enemy standing on the block
    for (const e of this.enemies.getChildren()) if (e.alive && Math.abs(e.x - wx) < TILE && Math.abs(e.y - wy) < 6) e.hit(true);
    if (tile.index === T.BREAKABLE && this.player.buff) {
      this.layer.removeTileAt(tile.x, tile.y); this.layer.calculateFacesWithin(tile.x - 1, tile.y - 1, 3, 3);
      this.debris.explode(6, wx, wy + TILE / 2); audio.sfx('brick'); this.addScore(50);
      this.cameras.main.shake(80, 0.004);
      if (content) this.spawnFromBlock(content, wx, wy, true);
      this.blockContent.delete(key);
      return;
    }
    this.bounceTile(tile, tile.index === T.QUESTION ? T.USED : tile.index);
    if (tile.index === T.QUESTION) {
      if (content) this.spawnFromBlock(content, wx, wy, false);
      this.blockContent.delete(key);
    } else audio.sfx('bump');
  }
  bounceTile(tile, newIndex) {
    const img = this.add.image(tile.getCenterX(), tile.getCenterY(), 'tiles', `t${newIndex}`).setDepth(3);
    tile.setVisible(false); const tx = tile.x, ty = tile.y;
    this.tweens.add({ targets: img, y: img.y - 8, duration: 80, yoyo: true, ease: 'Quad.out', onComplete: () => {
      img.destroy(); const t = this.layer.putTileAt(newIndex, tx, ty); t.setVisible(true);
    } });
  }
  spawnFromBlock(content, wx, wy, broken) {
    if (content === 'coin') {
      audio.sfx('coin'); this.registry.set('coins', this.registry.get('coins') + 1); this.addScore(SCORE.coin, wx, wy - 6);
      const c = this.add.image(wx, wy, 'coin').setDepth(1);
      this.tweens.add({ targets: c, y: wy - 34, duration: 220, yoyo: true, ease: 'Quad.out', onComplete: () => { this.sparkle.explode(6, c.x, c.y); c.destroy(); } });
      return;
    }
    audio.sfx('powerupAppear');
    const it = new Item(this, wx, broken ? wy + TILE : wy, content, !broken);
    this.items.add(it);
    if (broken) { it.body.setVelocityY(-200); }
  }

  // ---------------------------------------------------------- pickups
  collectCoin(c) {
    c.destroy(); audio.sfx('coin'); this.sparkle.explode(6, c.x, c.y);
    this.registry.set('coins', this.registry.get('coins') + 1); this.addScore(SCORE.coin);
  }
  collectItem(it) {
    const { x, y, kind } = it; it.destroy();
    switch (kind) {
      case 'beer':
        if (this.player.buff) { audio.sfx('coin'); this.addScore(SCORE.beerWhileBuff, x, y - 20); }
        else this.startTear();
        break;
      case 'heart': case 'wing': this.addLife(x, y); break;
      case 'trophy': audio.sfx('trophy'); this.addScore(SCORE.trophy, x, y - 20); this.sparkle.explode(16, x, y - 10); break;
    }
  }
  addLife(x, y) {
    const lives = Math.min(RULES.maxLives, this.registry.get('lives') + 1);
    this.registry.set('lives', lives); audio.sfx('oneUp');
    this.popText(x, y - 24, lives < RULES.maxLives || this.registry.get('lives') < RULES.maxLives ? '1-UP!' : 'MAX LIVES', 0x80ff80);
  }

  // ---------------------------------------------------------- power-up
  startTear() {
    this.phase = 'tear'; this.player.state = 'tear';
    this.player.setVisible(true); this.player.invincible = 0;
    this.physics.world.pause();
    audio.sfx('beer');
    const P = this.player;
    P.anims.play('tear');
    let ripped = false;
    const onUpdate = (anim, frame) => {
      if (frame.index >= 3 && !ripped) { ripped = true; audio.sfx('rip'); this.shirt.explode(14, P.x, P.y - 24); }
    };
    P.on('animationupdate', onUpdate);
    P.once('animationcomplete-tear', () => {
      P.off('animationupdate', onUpdate);
      audio.sfx('flex'); this.cameras.main.shake(300, 0.012); this.shirt.explode(6, P.x, P.y - 24);
      this.time.delayedCall(420, () => {
        if (this.phase !== 'tear') return;
        this.phase = 'play'; P.gainBuff(); this.registry.set('buff', true); this.hud.pulseHeart();
        if (this.pauseDepth <= 0) this.physics.world.resume();
      });
    });
  }
  onShieldLost() { this.registry.set('buff', false); this.hud.pulseHeart(); this.cameras.main.shake(120, 0.006); }

  throwFootball(P) {
    if (this.footballs.countActive(true) >= RULES.maxFootballs) return false;
    let f = this.footballs.getFirstDead(false);
    if (!f) { if (this.footballs.getLength() >= RULES.maxFootballs) return false; f = new Football(this); this.footballs.add(f); }
    f.fire(P.x + P.facing * 12, P.y - 28, P.facing);
    return true;
  }
  throwFlag(ref, dir) { this.shots.add(new EnemyShot(this, ref.x + dir * 8, ref.y - ref.height + 4, 'flag', dir)); }
  cameraFlash(pap, dir) {
    audio.sfx('flash'); this.cameras.main.flash(140, 255, 255, 255, true);
    this.shots.add(new EnemyShot(this, pap.x + dir * 12, pap.y - pap.height * 0.55, 'flash', dir));
  }

  // ---------------------------------------------------------- combat
  onPlayerEnemy(P, e) {
    if (!e.alive) return;
    const stomp = P.body.velocity.y > 0 && P.body.bottom - e.body.top < 14;
    if (stomp && e.cfg.stomp) {
      e.hit(false); audio.sfx('stomp');
      P.body.setVelocityY(-(input.state.jump ? PHYS.stompBounceHold : PHYS.stompBounce)); P.jumpHeld = input.state.jump;
      this.squash(P, 1.25, 0.75); this.hitPause(60);
      return;
    }
    P.hurt();
  }
  onPlayerBlocker(P, e) {
    if (!e.alive) return;
    if (P.body.touching.down && e.body.touching.up) { P.body.setVelocityY(-PHYS.stompBounce); audio.sfx('bounce'); this.popText(e.x, e.y - e.height - 6, 'NOPE', 0xffffff); return; }
    if (P.body.touching.left || P.body.touching.right) P.hurt();
  }
  onPlayerObstacle(P, o) {
    if (P.body.touching.down && o.body.touching.up) return;
    if ((P.body.touching.left || P.body.touching.right) && P.body.bottom > o.body.top + 4) P.hurt();
  }

  // ---------------------------------------------------------- death
  pitDeath() { this.player.die(true); }
  onPlayerDied() {
    if (this.phase === 'dying') return;
    this.phase = 'dying'; this.registry.set('buff', false); this.hud.pulseHeart();
    audio.stopMusic(); audio.playMusic('death');
    this.timerEvent.paused = true;
    // freeze everything except Darren's death hop
    for (const g of [this.enemies, this.blockers, this.items, this.footballs, this.shots]) for (const c of g.getChildren()) if (c.body) c.body.moves = false;
    this.time.delayedCall(1700, () => this.afterDeath());
  }
  afterDeath() {
    const lives = this.registry.get('lives') - 1;
    this.registry.set('lives', lives);
    if (lives <= 0) {
      this.phase = 'gameover'; audio.playMusic('gameover');
      this.hud.showGameOver(() => this.scene.restart({ fresh: true }), () => this.goTitle());
    } else {
      this.hud.showRespawnCard(lives, () => this.scene.restart({ fresh: false }));
    }
  }
  goTitle() { this.scene.stop('HUD'); this.scene.start('Title'); }

  // ---------------------------------------------------------- checkpoints
  activateCheckpoint(cp) {
    cp.active = true; audio.sfx('checkpoint');
    this.registry.set('checkpoint', { index: cp.index, x: cp.x, y: cp.y });
    cp.flag.setAlpha(1);
    this.tweens.add({ targets: cp.flag, y: cp.y - 40, scaleX: 1, scaleY: 1, duration: 500, ease: 'Back.out' });
    this.popText(cp.x, cp.y - 56, 'CHECKPOINT', 0xffe066);
    this.sparkle.explode(10, cp.x, cp.y - 30);
  }

  // ---------------------------------------------------------- finale
  startFinale() {
    const P = this.player; this.phase = 'finale'; P.state = 'finale'; P.controlsEnabled = false;
    P.body.setVelocity(0, 0); P.body.allowGravity = false; P.x = this.goal.x - 9; P.setFlipX(false);
    P.anims.play(P.prefix + 'climb', true); P.anims.pause();
    const poleTop = this.goal.y - TILE * 7;
    const frac = Phaser.Math.Clamp((this.goal.y - P.y) / (TILE * 7 - 30), 0, 1);
    const pts = Phaser.Math.Clamp(SCORE.flagMin + Math.round(frac * 49) * 100, SCORE.flagMin, SCORE.flagMax);
    this.addScore(pts, P.x, P.y - 48);
    audio.stopMusic(); audio.sfx('flagpole');
    this.timerEvent.paused = true;
    this.tweens.add({ targets: P, y: this.goal.y, duration: 1100, ease: 'Sine.in' });
    this.tweens.add({ targets: this.goalFlag, y: this.goal.y - 30, duration: 1100, ease: 'Sine.in', onComplete: () => {
      this.hud.showLevelClear(); audio.playMusic('clear');
      this.time.delayedCall(900, () => { this.finaleWalk = true; P.body.allowGravity = true; P.anims.resume(); });
    } });
  }
  updateFinale(dt) {
    const P = this.player;
    if (!this.finaleWalk || this.finaleDone) return;
    P.body.setVelocityX(PHYS.walk); P.anims.play(P.prefix + 'walk', true); P.setFlipX(false);
    if (P.x >= this.castle.x - 2) {
      this.finaleDone = true; P.setVisible(false); P.body.setVelocity(0, 0); P.body.allowGravity = false;
      const bonus = this.registry.get('time') * SCORE.timeBonusPerUnit;
      this.popText(this.castle.x, this.castle.y - 100, `TIME BONUS ${bonus}`, 0xffe066); this.addScore(bonus);
      let n = 0;
      const burst = () => {
        const x = this.castle.x + Phaser.Math.Between(-90, 90), y = Phaser.Math.Between(30, 110);
        this.fire.explode(28, x, y); audio.sfx('firework'); this.cameras.main.shake(60, 0.002);
        if (++n < 7) this.time.delayedCall(420, burst);
      };
      burst();
      this.time.delayedCall(2600, () => this.win());
    }
  }
  win() {
    this.phase = 'won';
    const score = this.registry.get('score'); let hs = this.registry.get('highScore'); const isNew = score > hs;
    if (isNew) { hs = score; saveHighScore(hs); this.registry.set('highScore', hs); }
    this.hud.showWin({ score, coins: this.registry.get('coins'), time: this.registry.get('time'), highScore: hs, isNew },
      () => this.scene.restart({ fresh: true }), () => this.goTitle());
  }

  // ---------------------------------------------------------- debug / test hooks
  get debug() {
    return {
      teleport: (x, y = this.groundTop) => { this.player.setPosition(x, y); this.player.body.reset(x, y); this.cameras.main.scrollX = Phaser.Math.Clamp(x - 150, 0, this.levelW - VIEW_W); },
      spawnItem: (kind, dx = 0) => { const it = new Item(this, this.player.x + dx, this.player.y, kind, false); this.items.add(it); return it; },
      hurt: () => this.player.hurt(),
      setTime: (t) => this.registry.set('time', t),
      items: () => this.items.getChildren().map(i => i.kind),
      enemiesNear: (r = 200) => this.enemies.getChildren().filter(e => e.alive && Math.abs(e.x - this.player.x) < r).map(e => ({ kind: e.kind, x: e.x, y: e.y })),
      clearEnemies: () => { this.enemies.clear(true, true); this.blockers.clear(true, true); },
      killEnemies: (kinds) => { for (const e of this.enemies.getChildren().slice()) if (kinds.includes(e.kind)) e.destroy(); },
      blockers: () => this.blockers.getChildren().map(b => ({ x: b.x, y: b.y, alive: b.alive, hp: b.hp })),
      balls: () => this.footballs.getChildren().map(f => ({ a: f.active, x: Math.round(f.x), y: Math.round(f.y) })),
      goalX: () => this.goal.x,
      checkpointX: (i) => this.checkpoints[i].x,
    };
  }

  // ---------------------------------------------------------- pause
  togglePause() {
    if (this.phase === 'gameover' || this.phase === 'won' || this.phase === 'dying') return;
    if (!this.paused) {
      this.paused = true; this.scene.pause(); audio.pauseMusic(); this.hud.showPause();
    } else {
      this.paused = false; this.hud.hidePause(); this.scene.resume(); audio.resumeMusic();
    }
  }
}
