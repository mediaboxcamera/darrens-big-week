// localStorage helpers, always wrapped in try/catch (private mode, blocked storage, etc.)
export function loadHighScore() { try { return parseInt(localStorage.getItem('dbw_highscore') || '0', 10) || 0; } catch (e) { return 0; } }
export function saveHighScore(v) { try { localStorage.setItem('dbw_highscore', String(v)); } catch (e) { /* ignore */ } }
