// Title: bobbing logo, subtitle, flickering TAP TO START, high score, mute.
import { VIEW_W, VIEW_H } from '../constants.js';
import { audio } from '../audio.js';
import { loadHighScore } from '../storage.js';
import { addSky, SKY_EDGE } from './BootScene.js';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    const W = VIEW_W, H = VIEW_H;
    this.cameras.main.setBackgroundColor(SKY_EDGE);
    const stadiumY = H - 24 - 93 * 1.7 + 8;
    addSky(this, stadiumY + 1);
    this.stadium = this.add.tileSprite(0, stadiumY, W / 1.7, 93, 'bg_stadium_tile').setOrigin(0, 0).setScale(1.7).setAlpha(0.9);
    this.clouds = this.add.tileSprite(0, 10, W, 48, 'strip_clouds').setOrigin(0, 0);
    this.ground = this.add.tileSprite(0, H - 24, W, 24, 'tile_ground').setOrigin(0, 0);
    this.add.rectangle(0, 0, W, H, 0x000000, 0.25).setOrigin(0);
    this.logo = this.add.image(W / 2, 62, 'ui_logo').setScale(0.95);
    this.tweens.add({ targets: this.logo, y: 66, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.add.bitmapText(W / 2, 122, 'pix', 'WEEK 7 CHAMPION EDITION').setOrigin(0.5).setTint(0xffe07a);
    this.add.image(W / 2, 150, 'darren_idle').setOrigin(0.5, 0.5); // full-body Darren, centred under the title
    this.tap = this.add.bitmapText(W / 2, 188, 'pix', 'TAP TO START').setOrigin(0.5).setScale(1.5).setTint(0xffffff);
    this.time.addEvent({ delay: 450, loop: true, callback: () => this.tap.setVisible(!this.tap.visible) });
    const hs = loadHighScore();
    this.add.bitmapText(W / 2, 212, 'pix', `HIGH SCORE ${String(hs).padStart(6, '0')}`).setOrigin(0.5).setTint(0xffe07a);
    this.add.rectangle(W, H, 92, 18, 0x0b1f44, 0.85).setOrigin(1, 1);
    this.muteBtn = this.add.bitmapText(W - 6, H - 5, 'pix', '').setOrigin(1, 1).setTint(0xffffff).setInteractive({ useHandCursor: true });
    this.muteBtn.input.hitArea.setTo(-30, -20, 90, 40);
    this.refreshMute();
    this.muteBtn.on('pointerdown', (p, lx, ly, ev) => { audio.unlock(); audio.toggleMute(); this.refreshMute(); audio.sfx('click'); ev.stopPropagation(); });
    this.game.events.on('mutechanged', this.refreshMute, this);
    this.add.bitmapText(6, H - 8, 'pix', 'ARROWS/WASD MOVE  SPACE JUMP  X THROW').setOrigin(0, 1).setTint(0xcfe3ff).setAlpha(0.8).setVisible(!(('ontouchstart' in window) || navigator.maxTouchPoints > 0));
    // the jingle can only play once audio has been unlocked by a tap (e.g. returning from the game)
    if (audio.ready) audio.playMusic('title');
    this.input.on('pointerdown', () => { audio.unlock(); this.start(); });
    this.input.keyboard.on('keydown', (e) => { if (e.code === 'KeyM') return; audio.unlock(); this.start(); });
    this.events.once('shutdown', () => this.game.events.off('mutechanged', this.refreshMute, this));
    this.started = false;
  }
  refreshMute() { this.muteBtn.setText(audio.muted ? 'SOUND: OFF' : 'SOUND: ON'); }
  start() {
    if (this.started) return; this.started = true;
    audio.sfx('coin');
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => { this.scene.start('Game', { fresh: true }); });
  }
  update(t, dt) { this.stadium.tilePositionX += dt * 0.004; this.clouds.tilePositionX += dt * 0.01; this.ground.tilePositionX += dt * 0.02; }
}
