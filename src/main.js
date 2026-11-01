// Entry point: Phaser config, layout, input wiring and test hooks.
import { VIEW_W, VIEW_H, PHYS } from './constants.js';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { GameScene } from './scenes/GameScene.js';
import { HUDScene } from './scenes/HUDScene.js';
import { initControls, layout, input } from './controls.js';
import { audio } from './audio.js';
import { initFullscreen } from './fullscreen.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#074bb5',
  pixelArt: true,
  roundPixels: true,
  render: { antialias: false, powerPreference: 'high-performance' },
  physics: { default: 'arcade', arcade: { gravity: { y: PHYS.gravity }, tileBias: 24, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: VIEW_W, height: VIEW_H },
  input: { activePointers: 3 },
  scene: [BootScene, TitleScene, GameScene, HUDScene],
};

// Lay out the DOM before Phaser measures its parent
layout(null);
const game = new Phaser.Game(config);

initControls({
  onAnyInput: () => audio.unlock(),
  onPause: () => { const g = game.scene.getScene('Game'); if (g && g.scene.isActive() || (g && g.paused)) g.togglePause(); },
  onMute: () => { audio.toggleMute(); game.events.emit('mutechanged', audio.muted); },
});
initFullscreen();
window.addEventListener('resize', () => layout(game));
window.addEventListener('orientationchange', () => setTimeout(() => layout(game), 50));
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => layout(game));
layout(game);
game.events.once('ready', () => layout(game));

// Pause when the tab is hidden
document.addEventListener('fullscreenchange', () => layout(game));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { const g = game.scene.getScene('Game'); if (g && g.scene.isActive() && !g.paused) g.togglePause(); }
});

// ---- test / debug hooks (used by the Playwright suite) ------------------
window.__dbw = {
  game, input, audio,
  get scene() { return game.scene.getScene('Game'); },
  get hud() { return game.scene.getScene('HUD'); },
  get player() { const s = game.scene.getScene('Game'); return s && s.player; },
  /** set virtual key state, e.g. setKeys({right:true, jump:true}) */
  setKeys(obj) { Object.assign(input.keys, obj); for (const k of Object.keys(input.state)) input.state[k] = input.touch[k] || input.keys[k]; },
  state() {
    const s = game.scene.getScene('Game'); const r = game.registry;
    return {
      active: !!(s && s.scene.isActive()), paused: !!(s && s.paused), phase: s && s.phase,
      lives: r.get('lives'), score: r.get('score'), coins: r.get('coins'), time: r.get('time'), buff: r.get('buff'),
      checkpoint: r.get('checkpoint'), player: s && s.player && s.player.body ? { x: s.player.x, y: s.player.y, state: s.player.state, buff: s.player.buff, onGround: s.player.onGround } : null,
      footballs: s && s.footballs ? s.footballs.countActive(true) : 0, hudOverlay: (() => { const h = game.scene.getScene('HUD'); return h ? h.overlay : null; })(),
      throwVisible: document.getElementById('btn-throw').classList.contains('show'),
    };
  },
};
