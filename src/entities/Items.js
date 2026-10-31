// Pickups (beer, heart, wing, trophy), coins, footballs and enemy projectiles.
import { PHYS, SCORE } from '../constants.js';

export class Item extends Phaser.Physics.Arcade.Sprite {
  /** kind: beer | heart | wing | trophy. Emerges from a block then (beer) slides. */
  constructor(scene, x, y, kind, emerge = true) {
    super(scene, x, y, kind === 'beer' ? 'item_beer' : kind);
    scene.add.existing(this); scene.physics.add.existing(this);
    this.kind = kind; this.setOrigin(0.5, 1).setDepth(7);
    this.body.setSize(this.width - 2, this.height - 2).setOffset(1, 2);
    this.collectable = !emerge;
    if (emerge) { // rise out of the block (y = block top), hidden behind the tile layer until out
      this.setDepth(1); this.body.enable = false; this.y = y + this.height;
      scene.tweens.add({ targets: this, y, duration: 450, ease: 'Sine.out', onComplete: () => { this.setDepth(7); this.body.enable = true; this.collectable = true; this.start(); } });
    } else this.start();
  }
  get speed() { return this.kind === 'beer' ? 60 : this.kind === 'trophy' ? 0 : 45; } // beer + 1-ups slide (mushroom style)
  start() {
    this.body.allowGravity = true;
    if (this.speed) { this.body.setVelocityX(this.speed); this.body.setBounceX(1); }
    else this.body.setVelocityX(0);
  }
  update() {
    if (!this.collectable || !this.body) return;
    const v = this.speed;
    if (v) { if (this.body.blocked.left) this.body.setVelocityX(v); else if (this.body.blocked.right) this.body.setVelocityX(-v); else if (Math.abs(this.body.velocity.x) < v - 5) this.body.setVelocityX(v * Math.sign(this.body.velocity.x || 1)); }
    if (this.y > this.scene.levelH + 60) this.destroy();
  }
}

export class Football extends Phaser.Physics.Arcade.Sprite {
  constructor(scene) {
    super(scene, 0, 0, 'item_football');
    scene.add.existing(this); scene.physics.add.existing(this);
    this.setDepth(9); this.body.setSize(12, 10).setOffset(2, 2); this.body.setBounce(0, 0);
    this.disable();
  }
  fire(x, y, dir) {
    this.enableBody(true, x, y, true, true); this.setActive(true).setVisible(true);
    this.body.setVelocity(dir * PHYS.footballV, -60); this.body.setAllowGravity(true); this.body.setAngularVelocity(dir * 600); this.life = 2.2;
  }
  disable() { this.disableBody(true, true); this.setActive(false).setVisible(false); }
  update(dt) {
    if (!this.active) return;
    this.life -= dt;
    if (this.body.blocked.down) this.body.setVelocityY(-PHYS.footballBounce);
    if (this.body.blocked.left || this.body.blocked.right || this.life <= 0 || this.y > this.scene.levelH + 40) { this.scene.puff(this.x, this.y); this.disable(); }
  }
}

/** Referee flag / camera flash blob. */
export class EnemyShot extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, kind, dir) {
    super(scene, x, y, kind === 'flag' ? 'flag_yellow' : 'flash_ball');
    scene.add.existing(this); scene.physics.add.existing(this);
    this.kind = kind; this.setDepth(9); this.life = kind === 'flag' ? 3 : 3.5;
    if (kind === 'flag') { this.body.setVelocity(dir * 110, -230); this.body.setAngularVelocity(dir * 400); this.body.setSize(8, 8); }
    else { this.body.setAllowGravity(false); this.body.setVelocity(dir * 70, 0); this.body.setCircle(5); }
  }
  update(dt) {
    this.life -= dt;
    if (this.kind === 'flash') this.setAlpha(0.6 + 0.4 * Math.sin(this.life * 25));
    if (this.life <= 0 || this.y > this.scene.levelH + 40 || (this.kind === 'flag' && this.body.blocked.down)) this.destroy();
  }
}
