# Puppet skins

The puppet is a 2D hand posed on the 21 MediaPipe hand landmarks. **What it looks like is data**: a skin is one JSON file in
`assets/skins/`, listed in `assets/skins/manifest.json`. The rig (`js/puppet.js`) never changes when a skin is added.

Adding a skin = drop `assets/skins/<id>.json` in, add `<id>` to `manifest.json`, add both to `SHELL` in `sw.js`, run
`node tools/stamp.mjs`. It then appears in the Profile skin picker. Nothing else in the code changes.
(`tools/make_skins.py` is only the script that drew the three built-in skins; skins can be written by hand or by any tool.)

Built in: `cartoon` (default), `robot`, `neon`, `paw`, `dragon`, `gauntlet`, `goldhand`. The skin id travels with each picture (`skin` in the message, 1-12 lower-case
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
