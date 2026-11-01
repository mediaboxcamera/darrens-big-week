// Landscape full screen + texting your score from the win screen.
import { test, expect } from '@playwright/test';
import { openGame, state, keys, dbg, waitState } from './helpers.js';

/** Tap a point given in game coordinates (400x240) with a real touch. */
async function tapGame(page, gx, gy) {
  const r = await page.evaluate(() => { const b = window.__dbw.game.canvas.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  await page.touchscreen.tap(r.x + gx * r.w / 400, r.y + gy * r.h / 240);
}

async function reachWin(page) {
  const gx = await dbg(page, 'goalX');
  await dbg(page, 'teleport', gx - 36);
  await keys(page, { right: true });
  await waitState(page, "s.phase === 'finale'", 8000);
  await keys(page, { right: false });
  await waitState(page, "s.hudOverlay === 'win' && s.phase === 'won'", 20000);
  await page.waitForTimeout(800);
}

test.describe('share + full screen', () => {
  test('beating the game: TEXT YOUR SCORE opens the share sheet with score and stats', async ({ page }) => {
    await page.addInitScript(() => { window.__shared = []; navigator.share = async (d) => { window.__shared.push(d); }; });
    const errors = await openGame(page);
    // knock one enemy out so the KO stat is non-zero
    await page.evaluate(() => window.__dbw.scene.enemies.getChildren().find(e => e.alive && e.kind !== 'security').hit(true));
    await reachWin(page);
    const score = (await state(page)).score;
    await tapGame(page, 200, 170);
    await page.waitForFunction(() => window.__shared.length === 1, null, { timeout: 3000 });
    const text = await page.evaluate(() => window.__shared[0].text);
    expect(text).toContain("I beat Darren's Big Week!");
    expect(text).toContain(`Score: ${score.toLocaleString('en-US')}`);
    expect(text).toContain('new high score!');
    expect(text).toMatch(/1 KO\b/);
    expect(text).toContain('0 deaths');
    expect(text).toMatch(/⏱️ \d+:\d\d/);
    expect(text).toContain('http://localhost:8080/');
    // the other buttons still work
    await tapGame(page, 140, 208);
    await waitState(page, "s.phase === 'play'", 8000);
    expect((await state(page)).score).toBe(0);
    expect(errors).toEqual([]);
  });

  test('no share sheet on a phone: falls back to a Messages link', async ({ page }) => {
    await page.addInitScript(() => { delete Navigator.prototype.share; });
    await openGame(page);
    await reachWin(page);
    // the sms: navigation is blocked here; just make sure it was attempted with the body filled in
    const req = page.waitForRequest(() => true, { timeout: 100 }).catch(() => null);
    const nav = page.evaluate(() => new Promise((res) => { window.addEventListener('beforeunload', () => res('nav')); setTimeout(() => res('none'), 1500); }));
    await tapGame(page, 200, 170);
    await nav; await req;
    expect(await page.evaluate(() => window.__dbwLastShare)).toContain("I beat Darren's Big Week!");
  });

  test('turning the phone sideways goes full screen on the next tap; upright leaves it', async ({ page }) => {
    test.skip(test.info().project.name !== 'android', 'Android Chrome is the browser with a page Fullscreen API');
    await openGame(page);
    const fs = () => page.evaluate(() => !!document.fullscreenElement);
    await page.touchscreen.tap(200, 600);           // portrait tap: stays in the browser
    expect(await fs()).toBe(false);
    await page.setViewportSize({ width: 851, height: 393 });
    await page.waitForTimeout(300);
    await page.touchscreen.tap(420, 150);
    await page.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 3000 });
    expect(await page.evaluate(() => document.body.classList.contains('landscape'))).toBe(true);
    // the test browser can't resize a full-screen window, so report an upright size to the page
    await page.evaluate(() => { Object.defineProperty(window, 'innerWidth', { value: 393, configurable: true }); Object.defineProperty(window, 'innerHeight', { value: 851, configurable: true }); window.dispatchEvent(new Event('resize')); });
    await page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 3000 });
    expect((await state(page)).active).toBe(true);
  });

  test('iPhone Safari (no Fullscreen API): title shows the Home Screen tip', async ({ page }) => {
    await page.addInitScript(() => { delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen; });
    await openGame(page, { start: false });
    const tip = await page.evaluate(() => window.__dbw.game.scene.getScene('Title').children.list.some(o => o.text === 'FULL SCREEN: SHARE > ADD TO HOME SCREEN'));
    expect(tip).toBe(true);
  });

  test('Chrome / Android: no Home Screen tip on the title', async ({ page }) => {
    await openGame(page, { start: false });
    const tip = await page.evaluate(() => window.__dbw.game.scene.getScene('Title').children.list.some(o => /HOME SCREEN/.test(o.text || '')));
    expect(tip).toBe(false);
  });
});
