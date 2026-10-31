// Shared tuning constants. Everything in the game reads from here so the level
// verifier (tools/verify_level.js) and the game can never disagree.
export const TILE = 24;
export const VIEW_W = 400;
export const VIEW_H = 240;
export const ROWS = 10; // level height in tiles (== VIEW_H / TILE, no vertical scroll)

export const PHYS = {
  gravity: 1000,     // px/s^2
  jumpV: 400,        // initial jump velocity (px/s). Max height = jumpV^2 / (2*gravity) = 80px
  jumpCut: 0.45,     // multiply upward velocity by this when jump is released early
  walk: 90,          // px/s
  run: 160,          // px/s after holding a direction for runDelay seconds
  runDelay: 0.35,    // seconds
  accel: 700,        // ground acceleration px/s^2
  skid: 1400,        // deceleration when reversing / no input on ground
  airAccel: 450,
  coyote: 0.1,       // seconds after leaving a ledge you may still jump
  buffer: 0.1,       // seconds a jump press is remembered before landing
  stompBounce: 260,
  stompBounceHold: 400,
  bodyW: 18,
  bodyH: 38,
  climb: 70,         // ladder climb speed
  footballV: 230,
  footballBounce: 220,
};

export const RULES = {
  startLives: 3,
  maxLives: 5,
  startTime: 400,    // HUD timer, 1 unit per second
  invincibleAfterHit: 1.5,
  maxFootballs: 2,
  securityHits: 3,
};

export const SCORE = {
  coin: 100, trophy: 1000, beerWhileBuff: 1000, stomp: 200, football: 200, security: 500,
  flagMin: 100, flagMax: 5000, timeBonusPerUnit: 5, oneUp: 0,
};
