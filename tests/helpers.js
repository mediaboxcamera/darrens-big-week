// Shared helpers for the Playwright suites. They drive the game through the
// window.__dbw hooks (state + virtual keys) and real DOM touch buttons.
export async function openGame(page, { start = true } = {}) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('/index.html');
  await page.waitForFunction(() => window.__dbw && window.__dbw.game.scene.isActive('Title'), null, { timeout: 20000 });
  await page.waitForTimeout(300);
  if (start) {
    await page.evaluate(() => window.__dbw.game.scene.getScene('Title').start());
    await page.waitForFunction(() => window.__dbw.state().active && window.__dbw.state().phase === 'play', null, { timeout: 10000 });
    await page.waitForTimeout(400);
  }
  return errors;
}
export const state = (page) => page.evaluate(() => window.__dbw.state());
export const keys = (page, k) => page.evaluate((k) => window.__dbw.setKeys(k), k);
export const dbg = (page, fn, ...args) => page.evaluate(([fn, args]) => window.__dbw.scene.debug[fn](...args), [fn, args]);
export const waitState = (page, pred, timeout = 15000) => page.waitForFunction((src) => (new Function('s', 'return ' + src))(window.__dbw.state()), pred, { timeout });
export async function waitForRespawn(page, prevLives, timeout = 12000) {
  // death animation (1.7s) + respawn card (1.5s) + scene restart
  await page.waitForFunction((pl) => { const s = window.__dbw.state(); return s.lives === pl - 1 && s.phase === 'play' && s.hudOverlay === null && s.player && s.player.state === 'normal'; }, prevLives, { timeout });
  await page.waitForTimeout(300);
}
/** Press a touch button via pointer events on the DOM (true multitouch ids). */
export async function touchDown(page, id, pointerId) {
  await page.evaluate(([id, pid]) => {
    const b = document.getElementById(id); const r = b.getBoundingClientRect();
    const ev = new PointerEvent('pointerdown', { pointerId: pid, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, isPrimary: pid === 1 });
    b.dispatchEvent(ev);
  }, [id, pointerId]);
}
export async function touchUp(page, pointerId) {
  await page.evaluate((pid) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: pid, pointerType: 'touch', bubbles: true })), pointerId);
}
export async function touchMoveTo(page, pointerId, x, y) {
  await page.evaluate(([pid, x, y]) => window.dispatchEvent(new PointerEvent('pointermove', { pointerId: pid, pointerType: 'touch', clientX: x, clientY: y, bubbles: true })), [pointerId, x, y]);
}
