// Landscape = full screen on phones.
// Android Chrome (and any browser with the Fullscreen API): the first tap after
// turning the phone sideways hides the browser bars; turning it back upright
// leaves full screen. Browsers only allow full screen from a tap, so it can't
// happen at the exact moment of rotation.
// iPhone Safari has no Fullscreen API for pages; there the only way to lose the
// bars is to launch from the Home Screen (the manifest asks for full screen).
import { input } from './controls.js';

const fsRoot = document.documentElement;
export const canFullscreen = !!(fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen);
export const isStandalone = (() => {
  try { return navigator.standalone === true || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches; } catch (e) { return false; }
})();
/** True when the only route to full screen is "Add to Home Screen" (iPhone Safari). */
export const needsHomeScreenTip = input.isTouch && !canFullscreen && !isStandalone;

const fsCurrent = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const fsIsLandscape = () => window.innerWidth > window.innerHeight * 1.15;

function fsEnter() {
  if (!canFullscreen || fsCurrent() || !fsIsLandscape()) return;
  try {
    const p = fsRoot.requestFullscreen ? fsRoot.requestFullscreen({ navigationUI: 'hide' }) : fsRoot.webkitRequestFullscreen();
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* not allowed right now; the next tap tries again */ }
}
function fsExit() {
  if (!fsCurrent()) return;
  try {
    const p = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen();
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* ignore */ }
}
function fsOnRotate() { if (fsIsLandscape()) fsEnter(); else fsExit(); }

export function initFullscreen() {
  if (!input.isTouch || !canFullscreen || isStandalone) return;
  // pointerup / touchend count as a user tap for the Fullscreen API (pointerdown on touch does not)
  for (const ev of ['pointerup', 'touchend']) window.addEventListener(ev, fsEnter, { capture: true, passive: true });
  window.addEventListener('orientationchange', () => setTimeout(fsOnRotate, 80));
  if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', fsOnRotate);
  window.addEventListener('resize', () => { if (!fsIsLandscape()) fsExit(); });
}
