// ---------------------------------------------------------------------------
// LEVEL DATA for Darren's Big Week.
//
// The level is a list of SECTIONS. Each section is 10 rows of text (row 0 is the
// top of the screen, row 9 the bottom). Sections are glued together left to
// right, so you can insert, remove or lengthen a section without touching the
// others. Every row inside one section must have the same length.
//
// LEGEND (tiles)
//   #  ground (grass on top, dirt below - picked automatically)
//   =  floating platform (left / middle / right pieces picked automatically)
//   B  brick (solid, bumps)            X  breakable brick (buff Darren breaks it)
//   Y  breakable brick hiding a TROPHY  Z  breakable brick hiding a WING (1-up)
//   ?  question block -> coin           Q  question block -> BEER (power-up)
//   H  question block -> HEART (1-up)
//   p  pipe (write two columns of 'p' per pipe; the top row gets the cap)
//   L  ladder (auto-climbs: walk into it; press JUMP to hop off)
// LEGEND (things - placed standing on the tile below them)
//   S  Darren's start      C  checkpoint flag     G  goal flagpole     K  castle
//   c  coin   t  trophy    h  heart (1-up)        w  wing (1-up)
//   f  rival fan (walks)   d  dog (patrols, chases)   k  tackling player (charges)
//   r  referee (throws flags)   z  paparazzi (camera flash)   s  security guard
//   n  traffic cone (solid, hurts from the side)   g  hedge (solid, hurts from the side)
// ---------------------------------------------------------------------------

export const SECTIONS = [
  // 1. WARM-UP: flat ground, coins, an early beer block, a few rival fans.
  [
    '                                                    ',
    '                                                    ',
    '                                                    ',
    '                                                    ',
    '                                                    ',
    '              ?   c c c   Q           c c           ',
    '                                     ======         ',
    '   S                      f       f          f   f  ',
    '####################################################',
    '####################################################',
  ],
  // 2. PLATFORMING: floating platforms, pipes, small pits, a ladder, breakable bricks with a trophy.
  [
    '                                                   H                                            ',
    '                                                                                                ',
    '                       c c                                                                      ',
    '                                                L====      c c c                                ',
    '                      =====                     L                                               ',
    '       ===                                BXYXB L          =====     Q                          ',
    '          c c      pp                           L                                               ',
    '          f        pp        d   pp         f   L     pp        f    k    f                     ',
    '#################  ######################  #########  ########  ################################',
    '#################  ######################  #########  ########  ################################',
  ],
  // 3. CHECKPOINT 1
  [
    '            ',
    '            ',
    '            ',
    '            ',
    '            ',
    '            ',
    '            ',
    '     C      ',
    '############',
    '############',
  ],
  // 4. ENEMY SECTION: dogs, tacklers, referees; another beer block.
  [
    '                                                                                    ',
    '                                                                                    ',
    '                                  c c                                               ',
    '                   r                               r                                ',
    '                 =====                           =====                              ',
    '                           c     =====       Q              h                       ',
    '                                                          =====                     ',
    '    d        k              d          k                 d       k        d         ',
    '##########  ############  ##############  ##########  ##########  ######  ##########',
    '##########  ############  ##############  ##########  ##########  ######  ##########',
  ],
  // 5. CHECKPOINT 2
  [
    '            ',
    '            ',
    '            ',
    '            ',
    '            ',
    '            ',
    '            ',
    '     C      ',
    '############',
    '############',
  ],
  // 6. GAUNTLET: beer block first, then paparazzi, security guards, cones/hedges, trickier jumps.
  [
    '                                                                                                       ',
    '                                                                                                       ',
    '                     z              c c c                        BBZBB                                 ',
    '                   =====           =======                                       c c                   ',
    '                                                   z                                                   ',
    '      Q                    ======                =====          ===             =====                  ',
    '                                                           pp                                          ',
    '  f        n   g      s        n    f        s   g         pp    s   n   g   z         n g    f        ',
    '########################  ###########################  ###########  ############   ####################',
    '########################  ###########################  ###########  ############   ####################',
  ],
  // 7. FINALE: staircase, goal flagpole, castle.
  [
    '                                                            ',
    '                                                            ',
    '                                                            ',
    '                  #                                         ',
    '                 ##                                         ',
    '                ###                                         ',
    '               ####                                         ',
    '              #####          G             K                ',
    '############################################################',
    '############################################################',
  ],
];

export const TILE_CHARS = new Set(['#', '=', 'B', 'X', 'Y', 'Z', '?', 'Q', 'H', 'p', 'L']);
export const SOLID_CHARS = new Set(['#', '=', 'B', 'X', 'Y', 'Z', '?', 'Q', 'H', 'p']);
export const ENTITY_CHARS = {
  S: 'start', C: 'checkpoint', G: 'goal', K: 'castle',
  c: 'coin', t: 'trophy', h: 'heart', w: 'wing',
  f: 'fan', d: 'dog', k: 'tackler', r: 'referee', z: 'paparazzi', s: 'security', n: 'cone', g: 'hedge',
};

/**
 * Glue the sections together and return { cols, rows, grid, entities }.
 * grid[row][col] is a tile character (or ' '), entities is a list of
 * { type, col, row } standing on the tile below (row is the cell they occupy).
 */
export function buildLevel(sections = SECTIONS) {
  const rows = sections[0].length;
  const gridRows = Array.from({ length: rows }, () => '');
  const entities = [];
  let col0 = 0;
  sections.forEach((sec, si) => {
    const w = Math.max(...sec.map(r => r.length));
    if (sec.length !== rows) throw new Error(`Section ${si} must have ${rows} rows`);
    sec.forEach((line, r) => {
      const padded = line.padEnd(w, ' ');
      let tiles = '';
      for (let c = 0; c < w; c++) {
        const ch = padded[c];
        if (TILE_CHARS.has(ch)) tiles += ch;
        else {
          tiles += ' ';
          if (ENTITY_CHARS[ch]) entities.push({ type: ENTITY_CHARS[ch], col: col0 + c, row: r });
          else if (ch !== ' ') throw new Error(`Unknown level character '${ch}' in section ${si} row ${r} col ${c}`);
        }
      }
      gridRows[r] += tiles;
    });
    col0 += w;
  });
  return { cols: col0, rows, grid: gridRows, entities };
}
