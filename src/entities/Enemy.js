// Enemies share one class with per-kind behaviour in update().
import { TILE, PHYS, RULES, SCORE } from '../constants.js';
import { audio } from '../audio.js';

const KIND = {
  fan:       { tex: 'enemy_fan', speed: 35, faceRight: true, stomp: true, score: 200 },
  dog:       { tex: 'enemy_dog', speed: 45, faceRight: true, stomp: true, score: 200, chase: 120 },
  tackler:   { tex: 'enemy_tackler', speed: 0, faceRight: false, stomp: true, score: 300, charge: 230 },
  referee:   { tex: 'enemy_referee', speed: 0, faceRight: false, stomp: true, score: 300 },
  paparazzi: { tex: 'enemy_paparazzi', speed: 0, faceRight: false, stomp: true, score: 300 },
  security:  { tex: 'enemy_security', speed: 0, faceRight: true, stomp: false, score: SCORE.security, hp: RULES.securityHits },
};

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, kind) {
    const k = KIND[kind];
    super(scene, x, y, k.tex);
    scene.add.existing(this); scene.physics.add.existing(this);
    this.kind = kind; this.cfg = k; this.setOrigin(0.5, 1).setDepth(8);
    this.body.setSize(Math.max(10, this.width - 8), this.height - 2).setOffset(4, 2);
    this.dir = -1; this.alive = true; this.active_ = false; this.timer = 1.2 + Math.random();
    this.hp = k.hp || 1; this.charging = 0; this.chasing = false; this.homeX = x; this.windup = 0;
    this.body.setVelocityX(0); this.body.moves = false; // frozen until on screen
    if (kind === 'security') { this.body.setImmovable(true); this.body.allowGravity = true; }
  }
  faceDir(d) { this.setFlipX(this.cfg.faceRight ? d < 0 : d > 0); }

  update(dt, player, cam) {
    if (!this.alive) return;
    if (!this.active_) {
      if (this.x < cam.scrollX + cam.width + 40 && this.x > cam.scrollX - 60) { this.active_ = true; this.body.moves = true; this.body.setVelocityX(this.dir * this.cfg.speed); this.faceDir(this.dir); }
      return;
    }
    if (this.y > this.scene.levelH + 60) { this.destroy(); return; }
    const b = this.body, dx = player.x - this.x, dy = player.y - this.y;
    switch (this.kind) {
      case 'fan':
        if (b.blocked.left) this.dir = 1; else if (b.blocked.right) this.dir = -1;
        b.setVelocityX(this.dir * this.cfg.speed); this.faceDir(this.dir);
        break;
      case 'dog': {
        const near = Math.abs(dx) < this.cfg.chase && Math.abs(dy) < 40 && player.state === 'normal';
        if (near && !this.chasing) { this.chasing = true; audio.sfx('bark'); this.scene.popText(this.x, this.y - this.height - 4, '!', 0xffffff); }
        if (!near) this.chasing = false;
        if (this.chasing) this.dir = Math.sign(dx) || 1;
        else { // patrol, turn at walls and ledges
          if (b.blocked.left) this.dir = 1; else if (b.blocked.right) this.dir = -1;
          if (b.blocked.down && !this.scene.solidBelow(this.x + this.dir * 14, this.y + 2)) this.dir *= -1;
        }
        b.setVelocityX(this.dir * (this.chasing ? this.cfg.speed * 2.4 : this.cfg.speed)); this.faceDir(this.dir);
        break;
      }
      case 'tackler':
        if (this.charging > 0) {
          this.charging -= dt; b.setVelocityX(this.dir * this.cfg.charge);
          if (b.blocked.left || b.blocked.right || this.charging <= 0) { this.charging = 0; b.setVelocityX(0); this.timer = 1.4; }
        } else if (this.windup > 0) {
          this.windup -= dt; b.setVelocityX(0);
          this.setScale(1 + Math.sin(this.windup * 40) * 0.06, 1);
          if (this.windup <= 0) { this.setScale(1); this.charging = 1.1; audio.sfx('charge'); }
        } else {
          this.timer -= dt; b.setVelocityX(0);
          if (this.timer <= 0 && Math.abs(dx) < 170 && Math.abs(dy) < 30 && player.state === 'normal') { this.dir = Math.sign(dx) || -1; this.faceDir(this.dir); this.windup = 0.4; this.scene.popText(this.x, this.y - this.height - 4, '!', 0xff4040); }
        }
        break;
      case 'referee':
        this.timer -= dt; this.faceDir(Math.sign(dx) || -1);
        if (this.timer <= 0 && Math.abs(dx) < 220) {
          this.timer = 2.6;
          audio.sfx('whistle'); this.setTint(0xffff80); this.scene.popText(this.x, this.y - this.height - 4, '!', 0xffe066);
          this.scene.time.delayedCall(450, () => { if (this.alive) { this.clearTint(); this.scene.throwFlag(this, Math.sign(dx) || -1); } });
        }
        break;
      case 'paparazzi':
        this.timer -= dt; this.faceDir(Math.sign(dx) || -1);
        if (this.timer <= 0 && Math.abs(dx) < 240) {
          this.timer = 3.2;
          this.setTint(0xff8080); this.scene.popText(this.x, this.y - this.height - 4, '!', 0xffffff);
          this.scene.time.delayedCall(500, () => { if (this.alive) { this.clearTint(); this.scene.cameraFlash(this, Math.sign(dx) || -1); } });
        }
        break;
      case 'security':
        this.faceDir(Math.sign(dx) || 1);
        break;
    }
  }

  /** Stomped or hit by a football. Returns true if it died. */
  hit(byFootball = false) {
    if (!this.alive) return false;
    if (this.kind === 'security') {
      if (!byFootball) return false;
      this.hp--; this.setTint(0xff6060); this.scene.time.delayedCall(120, () => this.alive && this.clearTint());
      this.scene.popText(this.x, this.y - this.height - 6, `${this.hp}`, 0xffffff);
      if (this.hp > 0) return false;
    }
    this.alive = false;
    this.scene.stats.kos++;
    this.body.checkCollision.none = true; this.body.setImmovable(false); this.body.allowGravity = true; this.body.moves = true;
    this.setFlipY(true).setVelocity(byFootball ? Math.sign(this.x - this.scene.player.x) * 90 : (Math.random() - 0.5) * 60, -220);
    this.setDepth(9);
    this.scene.addScore(this.cfg.score, this.x, this.y - this.height);
    this.scene.time.delayedCall(1500, () => this.destroy());
    return true;
  }
}
