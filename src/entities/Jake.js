// JAKE, the final boss. He stands in front of the staircase and loops one
// big telegraphed jump: idle -> bounce -> crouch -> launch -> hang at the peak
// -> slam down -> landing -> back to idle. While he's high in the air Darren
// can run underneath him. Touching him always costs a life (the shirtless
// shield does not save you) and footballs bounce off him.
import { audio } from '../audio.js';

export const JAKE = {
  peak: 112,       // px his feet rise above the ground at the top of the jump
  idle: 900,       // ms standing still (safe window to line up)
  bounce: 260,     // ms "bounce" pose - first warning
  crouch: 380,     // ms crouch + shake - second warning
  rise: 520,       // ms launching up (ease out)
  hang: 520,       // ms hanging at the peak
  fall: 420,       // ms slamming down (ease in)
  land: 320,       // ms landing pose
  recover: 300,    // ms return-to-idle pose
};

export class Jake extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, groundY) {
    super(scene, x, groundY, 'jake_idle');
    scene.add.existing(this); scene.physics.add.existing(this);
    this.setOrigin(0.5, 1).setDepth(8); // never flipped: the art faces forward and flipping would mirror JAKE on his jersey
    this.body.setAllowGravity(false); this.body.setImmovable(true); this.body.moves = false;
    const bw = 24, bh = 44; // fair hitbox: torso and legs, not the hair or the flexed arms
    this.body.setSize(bw, bh).setOffset((this.width - bw) / 2, this.height - bh);
    this.groundY = groundY;
    this.phase = 'waiting'; // waiting | idle | bounce | crouch | rise | hang | fall | land | recover
    this.awake = false;
    // ground shadow: shrinks and fades as he rises, so you can see where he'll land
    this.shadow = scene.add.ellipse(x, groundY - 1, 34, 6, 0x06122b, 0.5).setDepth(7);
  }

  get airborne() { return this.groundY - this.y > 2; }

  update(cam) {
    if (!this.awake && this.x < cam.scrollX + cam.width + 20) { this.awake = true; this.loop(); }
    const k = Math.max(0.35, 1 - (this.groundY - this.y) / (JAKE.peak * 1.4));
    this.shadow.setScale(k, k).setAlpha(0.5 * k).setPosition(this.x, this.groundY - 1);
  }

  setPhase(phase, tex) { this.phase = phase; if (tex) this.setTexture(tex); }

  wait(ms, fn) { this.scene.time.delayedCall(ms, () => { if (this.active) fn(); }); }

  loop() {
    if (!this.active) return;
    const s = this.scene;
    this.setPhase('idle', 'jake_idle');
    this.wait(JAKE.idle, () => {
      this.setPhase('bounce', 'jake_bounce'); audio.sfx('bounce');
      this.wait(JAKE.bounce, () => {
        this.setPhase('crouch', 'jake_crouch'); audio.sfx('charge');
        s.tweens.add({ targets: this, x: { from: this.x - 1, to: this.x + 1 }, duration: 50, yoyo: true, repeat: Math.floor(JAKE.crouch / 100) - 1, onComplete: () => { this.x = Math.round(this.x); } });
        this.wait(JAKE.crouch, () => this.jump());
      });
    });
  }

  jump() {
    const s = this.scene;
    this.setPhase('rise', 'jake_jump'); audio.sfx('jump');
    s.dust.explode(6, this.x, this.groundY);
    s.tweens.add({
      targets: this, y: this.groundY - JAKE.peak, duration: JAKE.rise, ease: 'Quad.out',
      onUpdate: (tw) => { if (tw.progress > 0.6 && this.phase === 'rise') this.setPhase('rise', 'jake_peak'); },
      onComplete: () => {
        this.setPhase('hang', 'jake_peak');
        this.wait(JAKE.hang, () => {
          this.setPhase('fall', 'jake_fall');
          s.tweens.add({ targets: this, y: this.groundY, duration: JAKE.fall, ease: 'Quad.in', onComplete: () => this.land() });
        });
      },
    });
  }

  land() {
    const s = this.scene;
    this.y = this.groundY;
    this.setPhase('land', 'jake_land');
    audio.sfx('stomp'); audio.sfx('kick');
    s.cameras.main.shake(140, 0.008);
    s.dust.explode(12, this.x, this.groundY);
    this.wait(JAKE.land, () => {
      this.setPhase('recover', 'jake_return');
      this.wait(JAKE.recover, () => this.loop());
    });
  }

  /** A football hit: no damage, the ball just bounces off. */
  deflect(ball) {
    this.scene.puff(ball.x, ball.y);
    this.scene.popText(this.x, this.y - this.height - 4, 'NOPE', 0xffffff);
    audio.sfx('bump');
    this.setTint(0xffaaaa); this.wait(90, () => this.clearTint());
  }

  destroy(fromScene) { if (this.shadow) this.shadow.destroy(); super.destroy(fromScene); }
}
