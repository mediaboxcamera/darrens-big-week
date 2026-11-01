// "Text your score": builds the brag message and hands it to the phone's share
// sheet (Messages and recent group chats sit at the top on iPhone and Android).
// Fallbacks: open Messages directly via sms:, or copy to the clipboard on desktop.
import { input } from './controls.js';

export function gameUrl() {
  try { return new URL('./', location.href).href; } catch (e) { return location.href; }
}

export function formatClock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const fmtNum = (v) => Number(v || 0).toLocaleString('en-US');
const fmtPlural = (v, one, many) => `${fmtNum(v)} ${v === 1 ? one : many}`;

export function shareText(st) {
  const lines = [
    `🏆 I beat Darren's Big Week!`,
    `Score: ${fmtNum(st.score)}${st.isNew ? ' (new high score!)' : ''}`,
    `⏱️ ${formatClock(st.ms)} · 🪙 ${fmtPlural(st.coins, 'coin', 'coins')} · 💥 ${fmtPlural(st.kos, 'KO', 'KOs')} · 💀 ${fmtPlural(st.deaths, 'death', 'deaths')}`,
    `Think you can beat me? 👉 ${gameUrl()}`,
  ];
  return lines.join('\n');
}

/**
 * Must be called straight from a tap handler (share sheets need a user gesture).
 * Resolves to 'shared' | 'cancelled' | 'sms' | 'copied' | 'failed'.
 */
export async function shareScore(st) {
  const text = shareText(st);
  window.__dbwLastShare = text; // read by the tests
  if (navigator.share) {
    try { await navigator.share({ text }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; /* otherwise fall through */ }
  }
  if (input.isTouch) {
    // "sms:?&body=" opens a new message with the text filled in on both iPhone and Android
    location.href = 'sms:?&body=' + encodeURIComponent(text);
    return 'sms';
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch (e) { return 'failed'; }
}
