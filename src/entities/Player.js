// Darren. Mario-style acceleration/momentum, variable jump, coyote time, jump
// buffering, hold-to-run, ladders, stomping, power-up state and death.
import { PHYS, RULES, TILE } from '../constants.js';
import { audio } from '../audio.js';
import { setThrowVisible } from '../controls.js';

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'darren_idle');
    scene.add.existing(this); scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    const fw = this.width, fh = this.height;
    this.body.setSize(PHYS.bodyW, PHYS.bodyH).setOffset((fw - PHYS.bodyW) / 2, fh - PHYS.bodyH);
    this.body.setMaxVelocity(400, 700);
    this.setDepth(10);
    this.state = 'normal';      // normal | tear | dead | finale
    this.buff = false;
    this.facing = 1;
    this.holdTime = 0;          // how long a direction has been held (hold -> run)
    this.coyote = 0; this.jumpBuffer = 0; this.jumpHeld = false; this.wasOnGround = false;
    this.invincible = 0; this.flicker = 0;
    this.onLadder = false; this.ladderCooldown = 0;
    this.throwCooldown = 0; this.throwPose = 0;
    this.prevJump = false; this.prevThrow = false;
    this.controlsEnabled = true;
    this.anims.play('d_idle');
  }

  get onGround() { return !!this.body && (this.body.blocked.down || this.body.touching.down); }
  get prefix() { return this.buff ? 'b_' : 'd_'; }

  update(dt, inp) {
    if (this.state === 'dead') return;
    if (this.state === 'tear') { this.body.setVelocity(0, 0); return; }
    if (this.invincible > 0) {
      this.invincible -= dt; this.flicker += dt;
      this.setVisible(Math.floor(this.flicker * 16) % 2 === 0);
      if (this.invincible <= 0) this.setVisible(true);
    }
    if (this.throwCooldown > 0) this.throwCooldown -= dt;
    if (this.throwPose > 0) this.throwPose -= dt;
    if (this.ladderCooldown > 0) this.ladderCooldown -= dt;

    const left = this.controlsEnabled && inp.left, right = this.controlsEnabled && inp.right;
    const jump = this.controlsEnabled && inp.jump, thr = this.controlsEnabled && inp.throw;
    const jumpPressed = jump && !this.prevJump, throwPressed = thr && !this.prevThrow;
    this.prevJump = jump; this.prevThrow = thr;
    const onGround = this.onGround;
    const body = this.body;

    // ---- ladders -------------------------------------------------------
    const ladderTile = this.scene.ladderAt(this.x, this.y - PHYS.bodyH / 2);
    if (ladderTile && !this.onLadder && this.ladderCooldown <= 0 && !onGround && body.velocity.y >= 0 || (ladderTile && !this.onLadder && this.ladderCooldown <= 0 && onGround && (left || right))) {
      this.onLadder = true; body.allowGravity = false;
    }
    if (this.onLadder) {
      if (!ladderTile) { // reached the top or walked off: back to normal physics
        this.onLadder = false; body.allowGravity = true;
      } else {
        this.x = ladderTile.getCenterX() + (this.x - ladderTile.getCenterX()) * 0.6; // ease toward ladder centre
        body.setVelocityY(-PHYS.climb);
        body.setVelocityX(left ? -PHYS.walk * 0.6 : right ? PHYS.walk * 0.6 : 0);
        if (jumpPressed) { this.onLadder = false; body.allowGravity = true; this.ladderCooldown = 0.35; body.setVelocityY(-PHYS.jumpV * 0.8); this.jumpHeld = true; audio.sfx('jump'); }
        this.anims.play(this.prefix + 'climb', true);
        return;
      }
    }

    // ---- horizontal movement ------------------------------------------------
    const dir = left && !right ? -1 : right && !left ? 1 : 0;
    if (dir !== 0 && dir === Math.sign(body.velocity.x || dir)) this.holdTime += dt; else this.holdTime = 0;
    const running = this.holdTime >= PHYS.runDelay;
    const target = dir * (running ? PHYS.run : PHYS.walk);
    const accel = onGround ? PHYS.accel : PHYS.airAccel;
    let vx = body.velocity.x;
    if (dir !== 0) {
      if (Math.sign(vx) !== dir && vx !== 0 && onGround) vx += dir * PHYS.skid * dt; // skid when reversing
      else if (Math.abs(vx) < Math.abs(target)) vx = Phaser.Math.Clamp(vx + dir * accel * dt, -Math.abs(target), Math.abs(target));
      else vx = Phaser.Math.Linear(vx, target, 0.08);
      this.facing = dir;
    } else if (onGround) {
      vx = Math.abs(vx) <= PHYS.skid * dt ? 0 : vx - Math.sign(vx) * PHYS.skid * dt;
    } else {
      vx *= (1 - 0.6 * dt);
    }
    body.setVelocityX(vx);
    this.setFlipX(this.facing < 0);

    // ---- jumping -----------------------------------------------------------
    if (onGround) this.coyote = PHYS.coyote; else this.coyote -= dt;
    if (jumpPressed) this.jumpBuffer = PHYS.buffer; else this.jumpBuffer -= dt;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.jumpBuffer = 0; this.coyote = 0; this.jumpHeld = true;
      body.setVelocityY(-PHYS.jumpV);
      audio.sfx('jump');
      this.scene.squash(this, 0.8, 1.2);
    }
    if (!jump && this.jumpHeld && body.velocity.y < 0) { body.setVelocityY(body.velocity.y * PHYS.jumpCut); this.jumpHeld = false; }
    if (body.velocity.y >= 0) this.jumpHeld = false;

    // landing
    if (onGround && !this.wasOnGround) { this.scene.landDust(this); this.scene.squash(this, 1.2, 0.8); }
    this.wasOnGround = onGround;

    // ---- throwing ------------------------------------------------------------
    if (throwPressed && this.buff && this.throwCooldown <= 0) {
      if (this.scene.throwFootball(this)) { this.throwCooldown = 0.25; this.throwPose = 0.2; audio.sfx('throw'); }
    }

    // ---- animation ---------------------------------------------------------------
    const p = this.prefix;
    if (this.throwPose > 0 && this.buff) this.anims.play('b_throw', true);
    else if (!onGround) this.anims.play(p + (body.velocity.y < 0 ? 'jump' : 'fall'), true);
    else if (Math.abs(vx) > 8) this.anims.play(p + (running && Math.abs(vx) > PHYS.walk + 10 ? 'run' : 'walk'), true);
    else this.anims.play(p + 'idle', true);
  }

  /** Called when an enemy / hazard touches Darren. */
  hurt() {
    if (this.state !== 'normal' || this.invincible > 0) return false;
    if (this.buff) { this.loseShield(); return true; }
    this.die(); return true;
  }

  loseShield() {
    this.buff = false;
    this.invincible = RULES.invincibleAfterHit; this.flicker = 0;
    this.anims.play('d_idle', true);
    audio.sfx('shieldBreak');
    setThrowVisible(false);
    this.scene.onShieldLost();
  }

  gainBuff() { // called at the end of the tear animation
    this.buff = true; this.state = 'normal';
    setThrowVisible(true);
    this.anims.play('b_idle', true);
  }

  die(silent = false) {
    if (this.state === 'dead') return;
    this.state = 'dead'; this.buff = false; this.onLadder = false;
    setThrowVisible(false); this.setVisible(true);
    this.anims.play('d_dead', true);
    this.body.checkCollision.none = true; this.body.allowGravity = true;
    this.body.setVelocity(0, silent ? 0 : -380);
    if (silent) this.body.allowGravity = false;
    this.scene.onPlayerDied();
  }
}
