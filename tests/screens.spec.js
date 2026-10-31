// Visual pass: screenshots of every screen on each emulated device, plus a
// zero-console-error assertion. Images land in tests/screenshots/<project>/.
import { test, expect } from '@playwright/test';
import { openGame, state, keys, dbg, waitState, touchDown, touchUp } from './helpers.js';

test('screens', async ({ page }, info) => {
  const dir = `tests/screenshots/${info.project.name}`;
  const shot = (name) => page.screenshot({ path: `${dir}/${name}.png` });
  const errors = await openGame(page, { start: false });
  await page.waitForTimeout(600);
  await shot('01_title');
  await page.evaluate(() => window.__dbw.game.scene.getScene('Title').start());
  await waitState(page, "s.active && s.phase === 'play'", 10000);
  await page.waitForTimeout(500);
  await shot('02_gameplay_red_heart');
  // controls pressed state
  await touchDown(page, 'btn-right', 1);
  await page.waitForTimeout(250);
  await shot('03_controls_pressed');
  await touchUp(page, 1);
  // powered up
  await dbg(page, 'spawnItem', 'beer');
  await waitState(page, "s.phase === 'tear'", 5000);
  await page.waitForTimeout(500);
  await shot('04_shirt_tear');
  await waitState(page, 's.buff === true && s.phase === "play"', 8000);
  await page.waitForTimeout(400);
  await shot('05_gameplay_blue_heart_throw_button');
  // enemies in view (section 2 dog around column 29)
  await dbg(page, 'teleport', 29 * 24 - 120);
  await page.waitForTimeout(700);
  await shot('06_enemies');
  // pause
  await page.evaluate(() => window.__dbw.scene.togglePause());
  await page.waitForTimeout(300);
  await shot('07_pause');
  await page.evaluate(() => window.__dbw.scene.togglePause());
  // lose shield -> red heart again, then die -> respawn card
  await dbg(page, 'hurt');
  await page.waitForTimeout(1700);
  await dbg(page, 'hurt');
  await waitState(page, "s.hudOverlay === 'respawn'", 6000);
  await page.waitForTimeout(400);
  await shot('08_respawn_card');
  await waitState(page, "s.phase === 'play' && s.hudOverlay === null && s.lives === 2", 10000);
  // win
  const gx = await dbg(page, 'goalX');
  await dbg(page, 'teleport', gx - 36);
  await keys(page, { right: true });
  await waitState(page, "s.phase === 'finale'", 8000);
  await keys(page, { right: false });
  await page.waitForTimeout(1400);
  await shot('09_game_clear');
  await waitState(page, "s.hudOverlay === 'win'", 20000);
  await page.waitForTimeout(900);
  await shot('10_win');
  // game over
  await page.evaluate(() => window.__dbw.game.registry.set('lives', 1));
  await page.evaluate(() => window.__dbw.hud.overlayObjs.find(o => o.type === 'Rectangle' && o.input && o.width > 300)); // noop
  await page.evaluate(() => { const g = window.__dbw.scene; g.phase = 'play'; g.player.state = 'normal'; g.player.setVisible(true); g.physics.world.resume(); g.debug.hurt(); });
  await waitState(page, "s.hudOverlay === 'gameover'", 8000);
  await page.waitForTimeout(1800);
  await shot('11_game_over');
  expect(errors).toEqual([]);
});
