# Darren's Big Week

A single-level, Super Mario Bros-style platformer built for phones. Darren won
Week 7, so the league gets to play as him: stomp rival fans, chug a beer, tear
the shirt off, throw footballs, grab the flag, walk into the DARREN castle.

Built with Phaser 3 (vendored, no CDN), Arcade Physics, plain ES-module
JavaScript, and Web Audio synthesis (no audio files). Everything in `/dist` is
static and uses relative paths.

## Quick start

```bash
npm install          # phaser, sharp (sprite slicer), playwright (tests)
npm run build        # assembles /dist (copies src, sprites, vendored Phaser, icons, manifest)
npm start            # serves /dist at http://localhost:8080
```

Open `http://localhost:8080` on a desktop browser (arrows / WASD, Space jump, X
throw, P pause, M mute) or on a phone on the same network.

Other scripts:

| script             | what it does                                                     |
| ------------------ | ---------------------------------------------------------------- |
| `npm run slice`    | re-slices `/assets/*.png` into `/public/sprites` + contact sheet |
| `npm run verify`   | checks the level is completable without the power-up            |
| `npm test`         | builds, then runs the Playwright suite (3 emulated devices)      |
| `npm run screens`  | builds, then takes screenshots of every screen per device        |

## Deploying to Netlify Drop

1. `npm run build`
2. Open <https://app.netlify.com/drop> and drag the **`dist`** folder onto the page.
3. Netlify gives you a random `something-123.netlify.app` URL. To rename it:
   **Site configuration → Site details → Change site name** → enter
   `darrens-big-week` → the game lives at `https://darrens-big-week.netlify.app`.
4. Share the link. On iPhone, Safari **Share → Add to Home Screen** installs it
   as a fullscreen app (manifest + apple meta tags are included).

Any static host works the same way (GitHub Pages, Cloudflare Pages, S3, a USB
stick): the build only needs the files in `dist/` served as-is.

## Project layout

```
assets/          the two AI-generated sheets (sprites + UI)
tools/slice.cjs  sprite slicer -> public/sprites/*.png, manifest.json, tools/contact_sheet.png
tools/verify_level.js   level completability checker (uses the real physics constants)
tools/build.js   builds /dist         tools/serve.js   tiny static server
public/          index.html, style.css (layouts + touch pad), sprites/
src/
  main.js        Phaser config, DOM layout + input wiring, window.__dbw test hooks
  constants.js   physics / rules / score tuning (shared with the verifier)
  level.js       THE LEVEL (edit this)
  controls.js    multitouch pad, keyboard, portrait/landscape layout
  audio.js       Web Audio synth: music sequencer + every sound effect
  font.js        5x7 pixel font drawn in code (RetroFont)
  scenes/        Boot (assets, tileset, anims), Title, Game, HUD (HUD + overlays)
  entities/      Player, Enemy, Items (pickups, footballs, enemy shots)
tests/           Playwright specs (game.spec.js rules, screens.spec.js visuals)
dist/            deployable build (generated)
```

## Editing the level

`src/level.js` holds the level as a list of **sections**; each section is 10
rows of text (row 0 = top of screen, row 9 = bottom). Sections are glued left to
right, so you can insert or stretch a section without touching the others.

```
#  ground (grass/dirt picked automatically)     =  floating platform (one-way)
B  brick     X  breakable brick (needs buff)     Y  breakable brick with TROPHY
Z  breakable brick with WING (1-up)             ?  ? block -> coin
Q  ? block -> BEER (power-up)                   H  ? block -> HEART (1-up)
p  pipe (two columns of p; the top row gets the cap)
L  ladder (jump into it to climb, jump again to hop off)
S  start   C  checkpoint   G  goal flagpole   K  castle
c  coin    t  trophy       h  heart (1-up)    w  wing (1-up)
f  rival fan   d  dog   k  tackler   r  referee   z  paparazzi   s  security
n  cone (solid, hurts from the side)   g  hedge (solid, hurts from the side)
```

Things in the legend "stand" on the tile below them. After editing, run
`npm run verify`: it BFSes every standing cell with the real jump physics
(walk speed unless there are 4+ tiles of runway) and fails if the flag cannot
be reached, listing pit widths and unreachable coins/blocks. Rules of thumb that
the checker encodes: Darren jumps 3 tiles high and clears a 3-wide pit at a run;
blocks must be 3 rows above the surface you jump from.

## Controls and layout decisions

* **Portrait** = Game Boy layout: the 400x240 viewport sits on top at full width,
  a navy/gold pad fills the rest. **Landscape** = the game fills the screen and
  the pad overlays the bottom corners at 55% opacity. Re-layout is instant on
  rotate/resize; there is no rotate prompt. Non-touch devices hide the pad.
* Buttons are 70-92 CSS px with an 8 px halo. Pointer events give true
  multitouch: each finger owns the button under it, sliding off releases,
  sliding onto another button presses it, `pointercancel`/blur releases all.
* THROW pops in (CSS keyframe) only while Darren is shirtless and pops out when
  the shield is lost, he dies, or the level restarts.
* Hold a direction ~0.35 s to break into a run. Variable jump height, 100 ms
  coyote time, 100 ms jump buffer.
* **Ladder**: with only three buttons there is no "up", so you *jump into* a
  ladder to grab it; Darren then climbs automatically. Jump again to hop off.
  The ladder's top tile is a one-way platform so you can stand on it.
* The page disables scrolling, pinch/double-tap zoom, text selection, long-press
  menus and pull-to-refresh, and respects `env(safe-area-inset-*)`.
* Audio unlocks on the first touch/key. The game auto-pauses when the tab is
  hidden. Mute (M key, title button, pause menu) persists in `localStorage`.

## Game rules as implemented

* One heart: red while shirted, blue while shirtless (the heart art is
  recoloured at boot). It pulses on every change.
* Hit while shirted = instant death (dead sprite hop, death jingle, -1 life,
  respawn card, respawn at the last checkpoint). Hit while shirtless = shirt
  back on, THROW hidden, 1.5 s invincibility flicker, no life lost. Pits and the
  timer always cost a life.
* 3 lives, max 5. Heart/wing items give +1. There are three in the level: a
  heart block up the ladder, a heart on a platform in the enemy section, and a
  wing hidden in a breakable brick near the end (needs the power-up).
* Beer pops out of `Q` blocks mushroom-style and slides. Collecting it freezes
  the game for the shirt-tear animation (shirt pieces, flex pose, screen
  shake), then Darren uses the buff sprite set and can throw up to 2 bouncing
  footballs and break breakable bricks from below. Beer while already buff =
  +1000.
* Enemies: fan walks; dog patrols (turns at ledges) and chases within 120 px;
  tackler winds up (shakes) then charges; referee whistles, then throws an
  arcing flag; paparazzi blinks red, then a white screen flash plus a slow
  flash-ball projectile; security guard blocks, bounces Darren off harmlessly
  ("NOPE"), dies to 3 footballs; cones/hedges are solid on top, hurt on the
  sides. Enemies only wake up when near the camera.
* Checkpoints raise their flag; respawning rebuilds the level (enemies, coins,
  blocks restored) and resets the timer to 400. Game over restarts everything.
* Scoring: coin 100, stomp 200-300, security 500, trophy 1000, buff-beer 1000,
  flagpole 100-5000 by grab height, time bonus 5 x seconds left. High score is
  saved in `localStorage` (try/catch everywhere).
* Camera: smooth with look-ahead, never scrolls backwards; Darren cannot walk
  off the left edge of the screen.

## Sprite pipeline decisions

The pasted sheets turned out to carry a real alpha channel (the "white" was
transparent) but the section header bars and box borders were baked in, labels
sat under every sprite, and nothing was grid aligned. `tools/slice.cjs`:

1. Erases header bars by colour inside known rectangles (sprites overlap them,
   so a straight crop would cut heads off) and erases label text rectangles.
2. Flood-fills the background from the sheet edges through transparent or
   near-white pixels, so enclosed whites (eyes, socks, ref stripes, clouds)
   survive, then strips anti-aliased halo pixels and binarises alpha.
3. Computes 8-way connected components once per sheet. Each sprite definition
   picks the components whose bounding box lies mostly (>=60%) inside its
   region, which merges detached fragments (stars over HURT, shirt pieces, the
   thrown football in THROW) while ignoring neighbours with overlapping boxes.
4. Scales every sprite to in-game size (24 px tiles, Darren ~44 px tall) with
   Lanczos, re-binarises alpha, and pads the whole player set (normal, buff and
   tear frames) to one shared 54x58 frame with a bottom-centre anchor.
5. Derives tiles in code: `tile_dirt` from the lower part of the ground tile,
   pipe cap/body slices, platform left/middle/right pieces, a seamless
   hand-drawn `ladder_tile`, `block_used`, `shirt_piece`, `flash_ball`. The
   stadium backdrop is mirrored at boot to tile seamlessly.
6. Blanks the baked "SCORE 000000" inside the score panel so live digits can be
   drawn on it; crops the coin out of the "x99" counter; splits the checkpoint
   into pole and flag so the flag can raise; drops the "Single Level Demo"
   ribbon from the logo.

Skipped on purpose: Rams helmet, star, dumbbell and shirt items; powered-up
faces (not needed). Open `tools/contact_sheet.png` to see every export.

## Testing

`npm test` builds and runs `tests/game.spec.js` on three Chromium device
emulations (iPhone 13 portrait, iPhone 13 landscape, Pixel 5). It drives the
game through `window.__dbw` (state snapshot, virtual keys, debug teleport/spawn)
and through real pointer events on the DOM pad, and asserts:

* zero console errors; movement, jumping, coin pickup;
* beer -> tear -> blue heart -> THROW button -> throwing (max 2 balls) -> +1000 for a second beer;
* hit while shirtless -> red heart, shirt on, THROW hidden, no life lost, invincibility;
* hit while shirted -> -1 life, respawn at the right checkpoint, timer reset;
* pit while shirtless -> still -1 life; timer running out -> -1 life;
* 3 deaths -> game over -> tap -> full restart (3 lives, no checkpoint, score 0);
* heart and wing give +1 life, capped at 5; pause/resume; flag -> level clear -> win screen + high score saved;
* multitouch pad: move + jump at once, sliding a finger off releases the button.

`npm run screens` writes `tests/screenshots/<device>/*.png` for the title, HUD in
red and blue heart states, pad with/without THROW, pause, respawn card, level
clear, win and game over screens.

Note: Playwright 1.52 hung on Node 24's ES-module loader, so the project pins
Playwright 1.64+. The iPhone presets default to WebKit; the config forces
Chromium so only one browser download is needed.

## Audio

All sound is generated at runtime: an original 8-bar chiptune loop (square lead,
triangle bass, noise drums) for the level, a title jingle, level-clear fanfare,
death jingle and game-over sting, plus ~25 SFX (jump, stomp, coin, bump, brick,
power-up appear, beer chug + rip, flex, shield break, throw, 1-up, flash,
whistle, checkpoint, flagpole, trophy, fireworks...). Nothing imitates Nintendo
or NFL music.
