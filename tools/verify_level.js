#!/usr/bin/env node
// Completability check for the level in src/level.js.
//
// Builds a graph of "standing cells" (empty cell with head room whose tile below
// is solid) plus ladder cells, connects them by walking, climbing, jumping and
// dropping using the real physics constants (WITHOUT the power-up), then BFSes
// from the start. Fails if the goal flag is unreachable. Warns about coins and
// blocks that cannot be reached.
//
// The jump model is deliberately conservative: horizontal reach for a jump of
// height dy uses the parabola with jumpV / gravity, at run speed only when
// there are >= 4 tiles of runway behind the jump, otherwise walk speed. Pits
// wider than the reach are therefore reported.
import { buildLevel, SOLID_CHARS } from '../src/level.js';
import { TILE, PHYS } from '../src/constants.js';

export function verifyLevel(level = buildLevel(), { log = console.log } = {}) {
  const { cols, rows, grid, entities } = level;
  const at = (c, r) => (c < 0 || c >= cols || r < 0 || r >= rows) ? '#' : grid[r][c];
  const solid = (c, r) => SOLID_CHARS.has(at(c, r));
  const empty = (c, r) => r < 0 ? true : !solid(c, r);
  const headRoom = (c, r) => empty(c, r) && empty(c, r - 1); // Darren is < 2 tiles tall
  const standing = (c, r) => r < rows && headRoom(c, r) && solid(c, r + 1) && at(c, r) !== 'L';
  const ladder = (c, r) => at(c, r) === 'L';
  const key = (c, r) => `${c},${r}`;

  // Jump reach table: for a vertical change dy (tiles, +up) how many tiles of
  // horizontal travel are possible at a given speed.
  const g = PHYS.gravity, v = PHYS.jumpV;
  const reach = (dyTiles, speed) => {
    const dy = dyTiles * TILE; // px up
    const disc = v * v - 2 * g * dy;
    if (disc < 0) return -1;
    const t = (v + Math.sqrt(disc)) / g; // time to come back down to that height
    // jump from the near edge of the cell, land with the body just over the far edge
    const px = speed * t - PHYS.bodyW;
    return Math.floor(px / TILE) + 1;
  };
  const maxUp = Math.floor((v * v / (2 * g) - 8) / TILE); // need 8px of clearance = 3 tiles

  const runway = (c, r, dir) => { let n = 0; while (standing(c - dir * (n + 1), r) && n < 6) n++; return n; };

  const start = entities.find(e => e.type === 'start');
  const goal = entities.find(e => e.type === 'goal');
  const seen = new Set([key(start.col, start.row)]);
  const queue = [[start.col, start.row]];
  const visit = (c, r) => { const k = key(c, r); if (!seen.has(k)) { seen.add(k); queue.push([c, r]); } };

  while (queue.length) {
    const [c, r] = queue.shift();
    if (ladder(c, r)) {
      if (ladder(c, r - 1) || standing(c, r - 1)) visit(c, r - 1);
      if (ladder(c, r + 1) || standing(c, r + 1)) visit(c, r + 1);
      for (const d of [-1, 1]) if (standing(c + d, r)) visit(c + d, r);
      // top of ladder: step off onto either side one row up too
      if (!ladder(c, r - 1)) for (const d of [-1, 1]) if (standing(c + d, r - 1)) visit(c + d, r - 1);
      continue;
    }
    // walk
    for (const d of [-1, 1]) {
      if (standing(c + d, r)) visit(c + d, r);
      else if (headRoom(c + d, r)) { // walk off a ledge and fall straight down
        let rr = r; while (rr < rows - 1 && !solid(c + d, rr + 1)) rr++;
        if (rr < rows - 1 && standing(c + d, rr)) visit(c + d, rr);
        // drifting while falling: anything within the fall cone
        for (let dx = 1; dx <= 5; dx++) for (let rr2 = r; rr2 < rows; rr2++) {
          const cc = c + d * dx; if (!standing(cc, rr2)) continue;
          const t = Math.sqrt(2 * (rr2 - r) * TILE / g) + 0.05;
          if (dx * TILE <= PHYS.run * t + TILE / 2) visit(cc, rr2);
        }
      }
      if (ladder(c + d, r)) visit(c + d, r);
    }
    if (ladder(c, r - 1)) visit(c, r - 1);
    // jump: every standing cell within the envelope
    for (let dy = -rows; dy <= maxUp; dy++) {
      const rr = r - dy; if (rr < 0 || rr >= rows) continue;
      for (const d of [-1, 1]) {
        const speed = runway(c, r, d) >= 4 ? PHYS.run : PHYS.walk;
        const maxDx = Math.max(reach(dy, speed), dy > 0 ? 0 : -1);
        for (let dx = 0; dx <= maxDx; dx++) {
          const cc = c + d * dx;
          if (standing(cc, rr) || ladder(cc, rr)) {
            // crude wall check: a solid column between us at head height blocks it
            let blocked = false;
            for (let x = Math.min(c, cc) + 1; x < Math.max(c, cc); x++) if (solid(x, Math.min(r, rr) - 1) && solid(x, Math.min(r, rr))) { blocked = true; break; }
            if (!blocked) visit(cc, rr);
          }
        }
      }
    }
  }

  const problems = [];
  const warnings = [];
  const goalReached = [...seen].some(k => { const [c, r] = k.split(',').map(Number); return Math.abs(c - goal.col) <= 1 && r >= goal.row - 2; });
  if (!goalReached) problems.push('GOAL FLAG IS NOT REACHABLE');

  // find the furthest reachable column to help debugging
  let furthest = 0; for (const k of seen) furthest = Math.max(furthest, Number(k.split(',')[0]));
  log(`reachable standing cells: ${seen.size}, furthest column: ${furthest} / ${cols}, goal at ${goal.col}`);
  if (!goalReached) log(`  -> progress stops around x=${furthest * TILE}px (column ${furthest}); look at the gap just right of it`);

  // collectables / blocks reachable? (within jump height above a reachable cell, or directly standing)
  const reachableFromBelow = (c, r) => { for (let d = 0; d <= maxUp + 1; d++) for (let dx = -1; dx <= 1; dx++) if (seen.has(key(c + dx, r + d))) return true; return false; };
  for (const e of entities) if (['coin', 'trophy', 'heart', 'wing'].includes(e.type) && !reachableFromBelow(e.col, e.row)) warnings.push(`${e.type} at col ${e.col} row ${e.row} looks unreachable`);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if ('?QHXYZ'.includes(at(c, r)) && at(c, r) !== ' ' && !reachableFromBelow(c, r + 1)) warnings.push(`block '${at(c, r)}' at col ${c} row ${r} cannot be hit`);
  }
  // pits: report their widths
  const pits = [];
  for (let c = 0; c < cols; c++) if (!solid(c, rows - 1)) { let w = 0; while (c + w < cols && !solid(c + w, rows - 1)) w++; pits.push({ col: c, w }); c += w; }
  log(`pits: ${pits.map(p => `${p.w}@${p.col}`).join(' ')}`);
  for (const p of pits) if (p.w > reach(0, PHYS.run)) problems.push(`pit at col ${p.col} is ${p.w} wide, max jump is ${reach(0, PHYS.run)} tiles at run speed`);
  for (const w of warnings) log('WARN ' + w);
  for (const p of problems) log('FAIL ' + p);
  return { ok: problems.length === 0, problems, warnings, seen, furthest };
}

if (process.argv[1] && process.argv[1].endsWith('verify_level.js')) {
  const res = verifyLevel();
  console.log(res.ok ? 'LEVEL OK (completable without power-up)' : 'LEVEL HAS PROBLEMS');
  process.exit(res.ok ? 0 : 1);
}
