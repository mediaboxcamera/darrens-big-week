// Touch pad + keyboard + layout. The game only ever reads `input.state`.
//
// Touch: pointer events with true multitouch. Each pointer id owns the button it
// is currently over; sliding off a button releases it, sliding onto another
// presses that one, pointercancel/up always releases. That gives "no sticky
// inputs" even when a finger wanders.
export const input = {
  state: { left: false, right: false, jump: false, throw: false },
  touch: { left: false, right: false, jump: false, throw: false },
  keys: { left: false, right: false, jump: false, throw: false },
  isTouch: ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
  onPause: null, onMute: null,
};

const btnByAction = {};
const pointerOwner = new Map(); // pointerId -> action

function refresh() {
  for (const k of Object.keys(input.state)) input.state[k] = input.touch[k] || input.keys[k];
  for (const [a, b] of Object.entries(btnByAction)) b.classList.toggle('pressed', input.touch[a]);
}

function actionAt(x, y) {
  for (const [a, b] of Object.entries(btnByAction)) {
    if (a === 'throw' && !b.classList.contains('show')) continue;
    const r = b.getBoundingClientRect();
    // generous hit box: 8px halo around each button
    if (x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8) return a;
  }
  return null;
}

function recomputeTouch() {
  for (const k of Object.keys(input.touch)) input.touch[k] = false;
  for (const a of pointerOwner.values()) if (a) input.touch[a] = true;
  refresh();
}

export function initControls({ onPause, onMute, onAnyInput }) {
  input.onPause = onPause; input.onMute = onMute;
  document.body.classList.toggle('notouch', !input.isTouch);
  const controls = document.getElementById('controls');
  for (const b of controls.querySelectorAll('.btn')) btnByAction[b.dataset.action] = b;

  const down = (e) => {
    e.preventDefault(); onAnyInput && onAnyInput();
    pointerOwner.set(e.pointerId, actionAt(e.clientX, e.clientY)); recomputeTouch();
  };
  const move = (e) => {
    if (!pointerOwner.has(e.pointerId)) return;
    e.preventDefault();
    const a = actionAt(e.clientX, e.clientY);
    if (pointerOwner.get(e.pointerId) !== a) { pointerOwner.set(e.pointerId, a); recomputeTouch(); }
  };
  const up = (e) => { if (pointerOwner.has(e.pointerId)) { pointerOwner.delete(e.pointerId); recomputeTouch(); } };
  controls.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  window.addEventListener('blur', () => { pointerOwner.clear(); recomputeTouch(); });
  // kill context menus / gestures
  for (const ev of ['contextmenu', 'gesturestart', 'gesturechange', 'dblclick']) window.addEventListener(ev, e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  // keyboard
  const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyX: 'throw', KeyJ: 'throw' };
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    onAnyInput && onAnyInput();
    if (map[e.code]) { input.keys[map[e.code]] = true; refresh(); e.preventDefault(); }
    else if (e.code === 'KeyP' || e.code === 'Escape') { input.onPause && input.onPause(); }
    else if (e.code === 'KeyM') { input.onMute && input.onMute(); }
  });
  window.addEventListener('keyup', e => { if (map[e.code]) { input.keys[map[e.code]] = false; refresh(); e.preventDefault(); } });
}

/** Show / hide the THROW button with a pop animation. */
export function setThrowVisible(v) {
  const b = btnByAction.throw; if (!b) return;
  if (v) { b.classList.remove('hide'); b.classList.add('show'); }
  else if (b.classList.contains('show')) {
    b.classList.add('hide');
    setTimeout(() => { b.classList.remove('show', 'hide'); }, 180);
    // release if a finger is on it
    for (const [id, a] of pointerOwner) if (a === 'throw') pointerOwner.set(id, null);
    recomputeTouch();
  }
}

/** Size #game for the current orientation; returns the game box size. */
export function layout(game) {
  const W = window.innerWidth, H = window.innerHeight;
  const landscape = W > H * 1.15;
  document.body.classList.toggle('landscape', landscape);
  const gameEl = document.getElementById('game');
  if (landscape || !input.isTouch) {
    gameEl.style.width = '100%'; gameEl.style.height = '100%';
  } else {
    // Game Boy: viewport on top, as wide as the screen, keep 400:240; leave >= 150px for the pad
    const sat = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
    let gh = Math.round(W * 240 / 400);
    const maxH = H - 150 - sat;
    if (gh > maxH) gh = maxH;
    gameEl.style.width = '100%'; gameEl.style.height = gh + 'px';
    gameEl.style.paddingTop = sat + 'px';
  }
  if (game && game.isBooted) setTimeout(() => game.scale.refresh(), 0);
}
