import { test, expect } from '@playwright/test';
import { openGame, state, keys, dbg, waitState, waitForRespawn, touchDown, touchUp, touchMoveTo } from './helpers.js';

test.describe('Darren\'s Big Week - gameplay rules', () => {
  test('no console errors on load and start', async ({ page }) => {
    const errors = await openGame(page);
    await page.waitForTimeout(1000);
    expect(errors).toEqual([]);
  });

  test('movement, jumping and collecting a coin', async ({ page }) => {
    await openGame(page);
    const s0 = await state(page);
    await keys(page, { right: true });
    await page.waitForTimeout(600);
    await keys(page, { right: false });
    const s1 = await state(page);
    expect(s1.player.x).toBeGreaterThan(s0.player.x + 30);
    // jump: leaves the ground then lands again
    await keys(page, { jump: true });
    await page.waitForTimeout(150);
    const mid = await state(page);
    expect(mid.player.y).toBeLessThan(s1.player.y - 20);
    await keys(page, { jump: false });
    await waitState(page, 's.player.onGround');
    // coin: stand under a coin (section 1, column 18 row 5) and jump
    await dbg(page, 'teleport', 18 * 24 + 12);
    await page.waitForTimeout(200);
    const before = (await state(page)).coins;
    await keys(page, { jump: true }); await page.waitForTimeout(500); await keys(page, { jump: false });
    await waitState(page, `s.coins === ${before + 1}`);
    expect((await state(page)).score).toBeGreaterThan(0);
  });

  test('beer -> shirt tear, blue heart, THROW button, throwing works', async ({ page }) => {
    await openGame(page);
    // the first ? block with a beer is in section 1 (column 26, row 5): bump it from below
    await dbg(page, 'clearEnemies');
    await dbg(page, 'teleport', 26 * 24 + 12);
    await page.waitForTimeout(200);
    await keys(page, { jump: true }); await page.waitForTimeout(400); await keys(page, { jump: false });
    await page.waitForFunction(() => window.__dbw.scene.debug.items().includes('beer'), null, { timeout: 5000 });
    // it pops out, slides off the block to the right; chase it down -> shirt tear freeze
    await page.waitForTimeout(1000);
    await keys(page, { right: true });
    await waitState(page, "s.phase === 'tear'", 8000);
    await keys(page, { right: false });
    expect((await state(page)).throwVisible).toBe(false);
    await waitState(page, 's.buff === true && s.phase === "play"', 8000);
    const s = await state(page);
    expect(s.buff).toBe(true); expect(s.player.buff).toBe(true); expect(s.throwVisible).toBe(true);
    // heart texture is blue
    expect(await page.evaluate(() => window.__dbw.hud.heart.texture.key)).toBe('ui_heart_blue');
    // throw via the real touch button
    await touchDown(page, 'btn-throw', 7);
    await page.waitForTimeout(100);
    expect((await state(page)).footballs).toBe(1);
    await touchUp(page, 7);
    await touchDown(page, 'btn-throw', 7); await page.waitForTimeout(100); await touchUp(page, 7);
    await touchDown(page, 'btn-throw', 7); await page.waitForTimeout(100); await touchUp(page, 7);
    expect((await state(page)).footballs).toBeLessThanOrEqual(2);
    // beer while already buff = +1000
    const score = (await state(page)).score;
    await dbg(page, 'spawnItem', 'beer');
    await waitState(page, `s.score >= ${score + 1000}`);
  });

  test('hit while shirtless -> red heart, shirt back on, THROW hidden, no life lost', async ({ page }) => {
    await openGame(page);
    await dbg(page, 'spawnItem', 'beer');
    await waitState(page, 's.buff === true && s.phase === "play"', 8000);
    const lives = (await state(page)).lives;
    await dbg(page, 'hurt');
    await page.waitForTimeout(300);
    const s = await state(page);
    expect(s.buff).toBe(false); expect(s.player.buff).toBe(false); expect(s.throwVisible).toBe(false);
    expect(s.lives).toBe(lives); expect(s.player.state).toBe('normal');
    expect(await page.evaluate(() => window.__dbw.hud.heart.texture.key)).toBe('ui_heart');
    // invincibility: a second hit right away does nothing
    await dbg(page, 'hurt');
    await page.waitForTimeout(100);
    expect((await state(page)).player.state).toBe('normal');
  });

  test('hit while shirted -> lose a life and respawn at the right checkpoint', async ({ page }) => {
    await openGame(page);
    const cpX = await dbg(page, 'checkpointX', 0);
    await dbg(page, 'teleport', cpX - 30);
    await keys(page, { right: true });
    await waitState(page, 's.checkpoint && s.checkpoint.index === 0');
    await keys(page, { right: false });
    await page.waitForTimeout(200);
    const lives = (await state(page)).lives;
    await dbg(page, 'hurt');
    await waitState(page, "s.phase === 'dying'");
    await waitState(page, "s.hudOverlay === 'respawn'", 5000);
    await waitForRespawn(page, lives);
    const s = await state(page);
    expect(s.lives).toBe(lives - 1);
    expect(Math.abs(s.player.x - cpX)).toBeLessThan(2);
    expect(s.checkpoint.index).toBe(0);
    expect(s.time).toBeGreaterThanOrEqual(398); // timer reset on respawn
  });

  test('pit fall while shirtless still costs a life', async ({ page }) => {
    await openGame(page);
    await dbg(page, 'spawnItem', 'beer');
    await waitState(page, 's.buff === true && s.phase === "play"', 8000);
    const lives = (await state(page)).lives;
    // first pit: columns 69-70
    await dbg(page, 'teleport', 69 * 24 + 24, 100);
    await waitForRespawn(page, lives);
    const s = await state(page);
    expect(s.lives).toBe(lives - 1);
    expect(s.buff).toBe(false);
    expect(s.player.x).toBeCloseTo(84, 0); // no checkpoint yet -> level start
  });

  test('losing all lives -> game over -> full restart from the beginning', async ({ page }) => {
    await openGame(page);
    const cpX = await dbg(page, 'checkpointX', 1);
    await dbg(page, 'teleport', cpX - 30);
    await keys(page, { right: true });
    await waitState(page, 's.checkpoint && s.checkpoint.index === 1');
    await keys(page, { right: false });
    await page.evaluate(() => window.__dbw.game.registry.set('score', 1234));
    for (let lives = 3; lives > 1; lives--) {
      await dbg(page, 'hurt');
      await waitForRespawn(page, lives);
      expect(Math.abs((await state(page)).player.x - cpX)).toBeLessThan(2);
    }
    await dbg(page, 'hurt');
    await waitState(page, "s.hudOverlay === 'gameover' && s.lives === 0", 8000);
    await page.waitForTimeout(1500);
    // next tap restarts everything
    await page.touchscreen.tap(100, 100);
    await waitState(page, "s.phase === 'play' && s.lives === 3 && s.hudOverlay === null", 8000);
    const s = await state(page);
    expect(s.lives).toBe(3); expect(s.checkpoint).toBe(null); expect(s.score).toBe(0); expect(s.coins).toBe(0);
    expect(s.time).toBeGreaterThanOrEqual(398);
    expect(s.player.x).toBeCloseTo(84, 0);
  });

  test('1-up pickups add a life (max 5)', async ({ page }) => {
    await openGame(page);
    const lives = (await state(page)).lives;
    await dbg(page, 'spawnItem', 'heart');
    await waitState(page, `s.lives === ${lives + 1}`);
    await dbg(page, 'spawnItem', 'wing');
    await waitState(page, `s.lives === ${lives + 2}`);
    await dbg(page, 'spawnItem', 'heart'); await page.waitForTimeout(300);
    await dbg(page, 'spawnItem', 'heart'); await page.waitForTimeout(300);
    expect((await state(page)).lives).toBe(5);
  });

  test('timer running out costs a life', async ({ page }) => {
    await openGame(page);
    const lives = (await state(page)).lives;
    await dbg(page, 'setTime', 1);
    await waitForRespawn(page, lives, 15000);
    expect((await state(page)).lives).toBe(lives - 1);
  });

  test('touch pad: multitouch move + jump, sliding off releases', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch layout only');
    await openGame(page);
    const x0 = (await state(page)).player.x;
    await touchDown(page, 'btn-right', 1);
    await page.waitForTimeout(300);
    await touchDown(page, 'btn-jump', 2);
    await page.waitForTimeout(200);
    const s = await state(page);
    expect(s.player.onGround).toBe(false);
    expect(s.player.x).toBeGreaterThan(x0 + 10);
    // slide the "right" finger off its button -> stops
    await touchMoveTo(page, 1, 5, 5);
    await touchUp(page, 2);
    await page.waitForTimeout(600);
    const vx = await page.evaluate(() => window.__dbw.player.body.velocity.x);
    expect(Math.abs(vx)).toBeLessThan(1);
    expect(await page.evaluate(() => document.getElementById('btn-right').classList.contains('pressed'))).toBe(false);
    await touchUp(page, 1);
  });

  test('pause and resume', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.__dbw.scene.togglePause());
    await page.waitForTimeout(200);
    let s = await state(page);
    expect(s.paused).toBe(true); expect(s.hudOverlay).toBe('pause');
    await page.evaluate(() => window.__dbw.scene.togglePause());
    await page.waitForTimeout(200);
    s = await state(page);
    expect(s.paused).toBe(false); expect(s.hudOverlay).toBe(null);
  });

  test('reaching the flag -> level clear -> win screen with stats', async ({ page }) => {
    await openGame(page);
    const gx = await dbg(page, 'goalX');
    await dbg(page, 'teleport', gx - 36);
    await keys(page, { right: true });
    await waitState(page, "s.phase === 'finale'", 8000);
    await keys(page, { right: false });
    await waitState(page, "s.hudOverlay === 'clear'", 8000);
    await waitState(page, "s.hudOverlay === 'win' && s.phase === 'won'", 20000);
    const s = await state(page);
    expect(s.score).toBeGreaterThan(100);
    expect(await page.evaluate(() => parseInt(localStorage.getItem('dbw_highscore'), 10))).toBe(s.score);
  });

  test('Jake: running under him while he is airborne gets you to the steps', async ({ page }) => {
    await openGame(page);
    const j0 = await dbg(page, 'jake');
    // stand ~3.5 tiles left of Jake and wait for him to wake up and launch
    await dbg(page, 'teleport', j0.x - 84);
    await page.waitForFunction(() => window.__dbw.scene.debug.jake().phase === 'rise', null, { timeout: 15000 });
    await keys(page, { right: true });
    await page.waitForFunction((jx) => window.__dbw.state().player.x > jx + 60 || window.__dbw.state().phase !== 'play', j0.x, { timeout: 6000 });
    await keys(page, { right: false });
    const s = await state(page);
    expect(s.phase).toBe('play');
    expect(s.player.x).toBeGreaterThan(j0.x + 60);
    expect(s.lives).toBe(3);
  });

  test('Jake: touching him costs a life even when shirtless', async ({ page }) => {
    await openGame(page);
    await dbg(page, 'spawnItem', 'beer');
    await waitState(page, 's.buff === true && s.phase === "play"', 8000);
    const j0 = await dbg(page, 'jake');
    await dbg(page, 'teleport', j0.x - 60);
    await page.waitForFunction(() => window.__dbw.scene.debug.jake().phase === 'idle', null, { timeout: 15000 });
    await keys(page, { right: true });
    await waitState(page, "s.phase === 'dying'", 6000);
    await keys(page, { right: false });
    await waitForRespawn(page, 3);
    expect((await state(page)).lives).toBe(2);
  });

  test('Jake: footballs bounce off him', async ({ page }) => {
    await openGame(page);
    const j0 = await dbg(page, 'jake');
    await dbg(page, 'teleport', j0.x - 110);
    await page.waitForFunction(() => window.__dbw.scene.debug.jake().phase === 'idle', null, { timeout: 15000 });
    await dbg(page, 'footballAt', j0.x - 40, j0.groundY - 24, 1);
    await page.waitForTimeout(600);
    const j1 = await dbg(page, 'jake');
    expect(j1).not.toBeNull();
    expect((await state(page)).footballs).toBe(0);
    expect((await state(page)).score).toBe(0);
  });

  test('flagpole: a high jump off the top step cannot sail over the pole', async ({ page }) => {
    await openGame(page);
    const gx = await dbg(page, 'goalX');
    // stand on the top step (column 377, surface y = 72) and do a full, held running jump
    await dbg(page, 'teleport', 377 * 24 + 12, 72);
    await page.waitForTimeout(300);
    const s0 = (await state(page)).score;
    await keys(page, { right: true, jump: true });
    await waitState(page, "s.phase === 'finale'", 5000);
    await keys(page, { right: false, jump: false });
    const s = await state(page);
    expect(s.player.x).toBeLessThanOrEqual(gx);        // stopped at the pole, not past it
    expect(s.score - s0).toBe(5000);                   // top-of-pole score
    await page.waitForTimeout(1300);                   // slide finished: he's at the bottom
    expect((await state(page)).player.y).toBeGreaterThan(180);
  });
});
