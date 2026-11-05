# Puppet skins

## 2026-11-05 — Camera mode boundary correction

Ghost and Chameleon respect the selected view: **Puppet only** hides the camera, uses authored puppet art and never samples/draws Vanish textures. **Photo + puppet** explicitly enables the camera scene and Vanish background replacement/adaptation. Leaving that mode clears cached image/model buffers. This supersedes the earlier local-camera exception for puppet-only mode. Outgoing ordinary puppet pictures remain data-only.


The puppet is a 2D hand posed on the 21 MediaPipe hand landmarks. **What it looks like is data**: a skin is one JSON file in
`assets/skins/`, listed in `assets/skins/manifest.json`. The rig (`js/puppet.js`) never changes when a skin is added.

Adding a skin = drop `assets/skins/<id>.json` in, add `<id>` to `manifest.json`, add both to `SHELL` in `sw.js`, run
`node tools/stamp.mjs`. It then appears in the Profile skin picker. Nothing else in the code changes.
(`tools/make_skins.py` is only the script that drew the three built-in skins; skins can be written by hand or by any tool.)

Built in: `cartoon` (default), `robot`, `neon`, `paw`, `dragon`, `gauntlet`, `goldhand`, and batch 1: `lowpoly` (geometric), `frog`, `duck`, `toybrick`, `mechanical`, `cyberpunk`, `flaming`, `floppy` (all drawn by `tools/make_batch1.py`). The skin id travels with each picture (`skin` in the message, 1-12 lower-case
letters); the receiver draws with **its own copy** of that skin and falls back to the default if it does not have it, so a
stranger can never push a drawing or an image through a skin id.

## The file

```jsonc
{
  "format": 1,                       // always 1 for now
  "id": "cartoon",                   // 1-12 lower-case letters; must equal the file name
  "name": "Cartoon",                 // shown in the picker (24 chars)
  "author": "...", "license": "...", // free text, for credit
  "parts": { /* the 16 named parts, below */ },
  "overlays": [ /* optional extra shapes riding on a part */ ],
  "order": [ /* optional draw order, a list of part names */ ]
}
```

### Shapes

Every part, and every overlay, is a list of **shapes** drawn in order:

```json
{ "d": "M -7 0 L -7 -26 A 7 7 0 0 1 7 -26 L 7 0 A 7 7 0 0 1 -7 0 Z",
  "fill": "#f6c9a0", "stroke": "#9a5b2e", "strokeWidth": 2.5, "opacity": 1 }
```

* `d`: SVG path data (letters `MmLlHhVvCcSsQqTtAaZz`, numbers, spaces, commas; max 4000 characters; nothing else is accepted).
* `fill`, `stroke`: `#rgb` / `#rrggbb` / `#rrggbbaa` or `"none"` (default `"none"`). No `url(...)`, no names.
* `strokeWidth`: 0-40 in the part's own units (default 0, so no outline). `opacity`: 0-1 (default 1).
* Glow, shadows and gradients are deliberately not supported (slow on phones). A glow is a second, wider, translucent stroke
  underneath (see `neon.json`).
* 1-12 shapes per part.

### The 16 parts

`palm` and, for each of `thumb`, `index`, `middle`, `ring`, `pinky`, three segments `_base`, `_mid`, `_tip`.

| part | landmarks it joins | notes |
|---|---|---|
| `palm` | wrist **0**, index knuckle **5**, pinky knuckle **17** | one shape stretched (affine) over that triangle; carries `ref` |
| `thumb_base` / `_mid` / `_tip` | 1→2, 2→3, 3→4 | thumb joint chain (CMC, MCP, IP, tip) |
| `index_base` / `_mid` / `_tip` | 5→6, 6→7, 7→8 | knuckle, middle joint, upper joint, tip |
| `middle_base` / `_mid` / `_tip` | 9→10, 10→11, 11→12 | |
| `ring_base` / `_mid` / `_tip` | 13→14, 14→15, 15→16 | |
| `pinky_base` / `_mid` / `_tip` | 17→18, 18→19, 19→20 | |

(MediaPipe numbering: 0 wrist; thumb 1-4; index 5-8; middle 9-12; ring 13-16; pinky 17-20.)

### Segment parts: pivot, length, neutral pose

A segment is drawn in its **own coordinate space**:

* the **pivot is the origin (0, 0)**: the rig puts it on the first landmark of the segment;
* the segment **points straight up**, along **-y**, and ends at **(0, -length)**: the rig puts that point on the second landmark;
* `length` is the nominal length in the skin's units (any positive number). The rig stretches the shape so its end lands
  exactly on the landmark. Choose a length close to the real proportions, so a stretched shape still looks right;
* the x axis is the width. The rig scales the width with the size of the hand (palm width on screen / palm width of the
  skin's `palm.ref`), so fingers keep their thickness while their length follows the real finger;
* a rounded end ("capsule") that extends a little **below** the pivot and rounds the top covers the joints neatly. Segments
  of one finger overlap at the joint; with an outline this gives the knuckle line.

```
        (0,-length)  <- lands on the second landmark
            ▲
            │   y goes UP the finger (-y)
 (0,0) pivot ●  <- lands on the first landmark
```

### The palm

The palm is drawn in its own space with three reference points, `ref`, saying where the three palm landmarks sit **in that
space**:

```json
"palm": { "ref": { "wrist": [50, 100], "index": [20, 38], "pinky": [80, 46] }, "shapes": [ ... ] }
```

The rig maps `wrist→landmark 0`, `index→landmark 5`, `pinky→landmark 17` exactly (a stretch, rotation and, for the other hand
or the back camera, a mirror image), and the whole palm shape follows. The three points must not be in a line.

**Neutral pose expected by the built-in skins** (draw yours the same way): a hand seen from the palm side with the **thumb on
the left**, fingers pointing up (-y), the palm about 60 units across the knuckles (index point to pinky point), the wrist at
the bottom, the knuckle line near the top of the palm so the finger bases (their pivots, at the knuckle landmarks) sit on its
upper edge. The palm outline should reach slightly past the three reference points so it covers the gap to the wrist and the
thumb base.

### `use`: share a shape

A part may be `{ "use": "index_base" }` instead of a definition, to share another part's shape and length (one finger drawn
once, reused for all 15 segments). Aliases may chain up to 4 deep; a loop is refused.

### `overlays`: shapes riding on one of the skin's own parts (cosmetic layers are separate items, see COSMETICS.md)

```json
"overlays": [ { "part": "ring_base", "shapes": [ { "d": "M -8 -10 L 8 -10", "stroke": "#fbbf24", "strokeWidth": 3 } ] } ]
```

An overlay is drawn **right after its part, in that part's transform** (so it follows the finger). Several overlays may name
the same part. Because overlays are just more shapes on named parts, a ring, a glove, a nail or a tattoo needs no change to the
rig; it will be an extra layer on top of a skin when cosmetics exist.

### `order`

A list of part names, drawn first to last. Default: `palm`, then `thumb_*`, then each finger base to tip. A skin may reorder
(for example fingers behind the palm).

### Alternate hand shapes (animal paws, gloves)

Use the same 16 part names with different shapes and lengths. The rig only needs the names, the pivots, the lengths and the
palm reference points. A paw with fewer visible fingers simply gives zero-width shapes to the parts it does not need.

## How it is checked

`parseSkin` (js/puppet.js) refuses a skin that has a missing part, a bad id, a non-positive length, non-path `d` data, a colour
that is not a plain `#hex`, or palm points in a line. A skin that fails is skipped (the console says why) and the rest still
load. `tests/puppet.test.js` checks the shipped skins and the rig: every segment starts on its landmark and ends on the next
one, the palm is pinned to its three landmarks, a mirrored hand flips the palm, and a hand that cannot be posed draws nothing.

## Cosmetics, the Store, ads and payments

Skins are now the **base-hand layer** of a stack of cosmetics (tone, tattoos, nails, rings, gloves, premade whole hands, particle
effects), with a Store, a local inventory and a stubbed unlock path: see **COSMETICS.md**. A skin file may carry the extra optional
metadata described there (`category`, `free`, `unlock`, `whole`, `particles`); the rig and everything above are unchanged.
Real ads and payments are NOT built: the unlock path is a marked stub (`js/unlock.js`) for the future native app.

**Built-in hands added since:** `lowpoly` (Geometric, generated from a detail level 1-5), `frog`, `duck` (web membrane between the fingers), `toybrick`, `mechanical`, `cyberpunk`, `flaming`, `floppy` (hotdog fingers), `gridmesh` (wireframe), `painting` (generated from a seed), `bone`, `burnbone`, `sand`, `eyes`, `inksketch`, `hook`.

## Optional rig fields (2026-11-02)
A skin may also carry `web` (a membrane between neighbouring fingers), `extend` (fingers drawn past the tip) and `sand` (a crumbling sand hand). They are validated like everything else (`parseWeb`, `parseExtend`, `parseSand` in js/puppet.js) and described in COSMETICS.md ("Rig extensions"). The 16 parts and the neutral pose are unchanged; the old per-finger web "fins" are gone.

Also optional (Part A-C): `extend.physics`, overlay `dynamic`, shape `anim`; see COSMETICS.md "Parts A-C". The `chrome` hand was removed.

### Rendering fixes (2026-11-04)

Idle shape animation now continues on slow live-camera frames; reduced motion still freezes it and slow-frame spring physics stays disabled. Geometric detail also changes recoloured geometry because its cache follows source-skin identity. Frog/Duck thumb webs are generated from landmarks only when the thumb is outside the palm, with shallow reach and a palm-boundary guard. Burning Bone combines clean Bone geometry, static flames on every part, and Flaming's capped emitters. Sand uses 84 shared swarm grains; see COSMETICS.md for timing and caps. The static preview no longer rotates between faces.

### Follow-up controls and web root

Painting can be rerolled by clicking its owned tile or large preview, or closing a tracked hand into a fist (150 ms debounce and reopen latch). Its current `sd` remains the snapshot seed. Flaming/Burning Bone have a saved fire-intensity slider, default 7/10, and optional validated `fi` in pictures. All web gaps start at the finger base; thumb/index specifically use CMC (1) and MCP (5), with tucked-thumb/palm-edge guards. See COSMETICS.md for bounds and review notes.

### Material detail and live Sand

The final `tools/make_visual_pass.py` authoring pass adds ordinary validated paths/animations for metal shine, glove folds, nail/ring highlights and Sand shading. Run it after other generators. Its `detail` shape marker is ignored by the runtime; no new rig parts or network fields are required. Live idle strength is a local 0–10 preference (Hand category); snapshots remain still and reduced motion wins. Sand now uses momentum-driven world-space grain state and per-part rolling dissolve/reform, within the existing particle caps. See COSMETICS.md and the generated static `artifacts/material-review.svg` review sheet.

### Shape facing and Paw claws (2026-11-05)

An individual shape may optionally carry `side: back | palm | both` (validated; absent is both). The rig filters it only for known facing, retaining the original shape arrays otherwise. Cartoon's built-in nail lines use back-only shapes. Raw camera handedness labels are now used directly after phone feedback showed the previous inversion. Paw's pale claws moved to ordinary dynamic tip overlays, extending with each finger and retracting on curl; the asset generator preserves this design. No new rig parts or counting landmarks.

### Nails, Comic/Elemental and Vanish expansion

New hand ids: `comic`, `elemental`, `chameleon`, `ghost`; new item `knuckleclaws`. Comic callouts use existing count/state data, not pose scoring. Elemental is generated from checked `el` (water/fire/earth/air). Optional checked `nl` is the 0–10 Nails length preference; length 5 remains the authored default. Item `nailAnchor` (finite -100..100) and checked `fit` points support palm-mounted/oversized blades without changing the 16-part rig. Optional `extend.spread` (0–1) gives Hotdog varied stable bends; springs remain local/drawing-only.

Chameleon/Ghost reuse the user's Vanish background/mask engine locally with a hand-landmark mask, 160 px/10 Hz limits and buffer cleanup. No new segmentation model or pixel-bearing game field. Opponent stills use authored vector art. Read COSMETICS.md for wire bounds, privacy scope, generation order and device review; `artifacts/expansion-review.svg` is a static review, not a camera test.


## Reactive effects update (2026-11-05)

Comic has no resting labels. Stable finger extension or fast hand movement produces a large, short-lived screen-space burst; up to two, 0.9 s lifetime, 0.65 s cooldown. Generic words include POW/BOOM/ZAP/WHAM/BAM/WHOOSH/WOW/CRASH/KAPOW/SWISH. Optional validated `cb` picture metadata is an array (max 2) of `{s,x,y}`; `s` is a known word or 0–10, `x/y` are integers 0–1000. No arbitrary text/paths. Reduced motion suppresses live bursts.

Elemental uses external splashes, flame jets, air streams and Earth rocks/sand with timed collapse/reassembly. `setElement` selects runtime world effects; Earth uses validated optional `sand.chunks` and the existing 84-grain/90-total/6-emitter budget. Store/live camera update particles before drawing the body and its dissolve alpha. Ordinary peer stills remain static.

Ghost/Chameleon local camera views display the camera scene beneath Vanish compositing and draw only accessories over it. Ghost replaces known masked pixels exactly with learned background; move the hand aside first to reveal/learn the room. Chameleon sweeps over roughly three seconds into coarse triangular quantized background colours, with slow ongoing adaptation. No tinted puppet body. Masks come from existing 21 landmarks. Sample <=10 Hz, 320 px long edge with adaptive 240/160 fallback. Ordinary peer messages never carry these pixels; safe authored still art remains. Phone edge/timing/FPS review is still required.
