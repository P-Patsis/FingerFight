# Layered cosmetics and the Store

The puppet (see SKINS.md) is now a **stack of layers**. Each layer is an independent item you can equip; all of them are data
(JSON files), none needs a code change. Everything rigs to the same 16 named puppet parts.

## Layers and z-order

| layer | what it is | how it is drawn | default z |
|---|---|---|---|
| `base` | the hand: a skin file in `assets/skins/` (human, animal, sci-fi, fantasy) or a **premade whole hand** | the full 16-part skin | 0 |
| `tone` | skin colour | recolours the base's colours (no shapes) | 10 |
| `tattoo` | tattoos and scars | shapes on named parts | 20 |
| `nails` | nail polish | shapes on the `*_tip` parts | 30 |
| `ring` | rings | shapes on finger parts | 40 |
| `glove` | gloves | shapes over every part | 50 |

* One item per layer can be equipped (a ring AND a glove AND a tattoo together is normal). Equipping another item of the same
  layer replaces it.
* **Free stacking:** nothing blocks an odd combination. Layers are drawn **by z, lowest first**, each as one whole pass over the
  hand, so a glove (50) covers a ring (40) on every finger. An item may set its own `"z"` (0-100) to break the default: a ring
  with `"z": 90` is drawn over a glove. Ties are broken by the layer order above.
* The base hand is always drawn first and whole; layers never change its geometry.

Code: `js/layers.js` (the vocabulary), `js/cosmetics.js` (catalogue, `parseItem`, `resolveLoadout`), `rigPlan(lm, skin, layers)` in
`js/puppet.js` (the draw order).

## Item file (a layer item, `assets/items/<id>.json`)

```jsonc
{
  "format": 1,
  "id": "goldring",                  // 1-12 lower-case letters, unique across ALL items and base hands; equals the file name
  "name": "Gold ring",               // 24 chars, shown in the Store
  "author": "...", "license": "...",
  "layer": "ring",                   // tattoo | nails | ring | glove | tone   (a base hand is a skin file, see below)
  "category": "human",               // human | animal | scifi | fantasy | premade   (pure browsing metadata)
  "free": true,                      // false = locked until unlocked
  "unlock": { "method": "ad" },      // for a locked item: "ad" | "purchase" (+ "price": "0.99")  (label only, see "Unlocking")
  "z": 40,                           // optional, 0-100; default = the layer's z
  "parts": {                         // part name -> shapes, in the BASE HAND'S part space
    "ring_base": [ { "d": "M -7.8 -16 L 7.8 -16 L 7.8 -20 L -7.8 -20 Z", "fill": "#facc15", "stroke": "#a16207", "strokeWidth": 1.2 } ]
  },
  "particles": [ /* optional, see below */ ]
}
```

* `parts` keys are the 16 names from SKINS.md (`palm`, `index_base`, `middle_tip`, ...). Shapes use exactly the skin shape format
  (SVG path data, plain `#hex` colours, 1-12 shapes per part). **Author in the cartoon hand's proportions**: segment space has its
  pivot at (0,0), points up (-y) and ends at (0, -length); the palm is on the 0..100 grid. Other hands have nearly the same lengths,
  and the rig stretches the shapes to the real hand.
* A **tone** has no `parts`; it has `"recolor": { "#f6c9a0": "#c68642", ... }`, a map from a colour the base uses to a new colour
  (case-insensitive, up to 24 entries). The cartoon hand uses `#f6c9a0` fill, `#9a5b2e` outline, `#c98f5f` crease, `#e9b38a` nail
  line; the built-in tones remap exactly those. A tone changes a base only **where the base uses those colours**: the robot, neon
  and every premade hand have other colours and are left alone (a premade whole hand is never recoloured).
* Checked like network input (`parseItem`): unknown part, bad colour, non-path data, bad category/layer, out-of-range numbers are
  refused; the item is skipped (the console says why), the rest load.

## Base hands and premade whole hands

A base hand is a **skin file** (`assets/skins/<id>.json`, SKINS.md) with extra optional metadata at the top level:
`"category"`, `"free"`, `"unlock"`, `"particles"`, `"whole"`. Skin files without them (the first three) are human, free, no effects.

`"whole": true` marks a **premade whole hand**: one finished piece (the built-in `gauntlet` is steel plates with a glowing core;
`goldhand` is polished gold). It is the same 16-part format, so it rigs the same way and other layers (rings, nails, tattoos,
a glove) still stack on top. The only difference: a skin tone is never applied to it. Premade hands use category `premade`.

Built in: bases `cartoon` `robot` `neon` `paw` (animal) `dragon` (fantasy, locked) `gauntlet` (premade) `goldhand` (premade, locked);
tones `pale tan brown deep` `orc frost`; tattoos `tribal scar runes`; nails `rednails blacknails neonnails`; rings
`goldring silverring ruby`; gloves `whiteglove leather fingerless knight`. `tools/make_skins.py` and `tools/make_items.py` drew
them (the JSON is the asset; write yours by hand or with any tool).

## Particle effects

Any item (base or layer) may carry up to 4 emitters:

```json
"particles": [
  { "effect": "glow",   "color": "#f59e0b", "where": "palm", "rate": 2.5 },
  { "effect": "sparks", "color": "#fde047", "where": "tips", "trigger": "snap", "burst": 14 }
]
```

* `effect`: a preset from `EFFECTS` in `js/particles.js`: `sparks` (short jagged bolts: electricity), `glow` (soft halo), `embers`
  (rising dots), `glint` (twinkling star). An item names a preset; it can never carry code.
* `where`: `tips` (fingertips), `knuckles`, `palm`, `hand` (anywhere on it). `color`: `#hex`.
* `rate`: particles per second while the hand is shown (0-40). `trigger` + `burst`: a one-shot burst of that many particles when
  the named event fires; today the only event is `snap` (the moment the answer is taken). An emitter needs a rate, a burst, or both.
* Sizes and speeds follow the size of the hand on screen.

How it stays cheap: one `ParticleSystem` per camera, **hard cap of 90 live particles** (6 emitters) however many items are worn;
no gradients and no shadow blur (lines, arcs, fills); no timer or loop of its own: `update/draw` run inside the existing tracking
loop only when a new video frame was analysed, and a stalled frame is clamped; the camera is released at the snap, so nothing runs
outside a guess window. **Reduced motion** (device setting): no particles at all.

Where you see them: live on your own camera view (puppet views) and in the Store preview (which also has a Test snap button).
The pictures your opponent gets are still images, so they show a **still snapshot** of the effects (`snapshot()`: a fixed sample
plus the snap burst, drawn from a fixed seed so it is the same every time); stills are drawn even under reduced motion.

## Registering a new item

1. Layer item: write `assets/items/<id>.json`, add `<id>` to `assets/items/manifest.json` (`{"items": [...]}`).
   Base hand: write `assets/skins/<id>.json`, add `<id>` to `assets/skins/manifest.json`.
2. Add the file(s) to `SHELL` in `sw.js` and run `node tools/stamp.mjs` (tests fail if you forget either).
3. It appears in the Store by itself, filterable by its `category` and `layer`. Ids must be unique across items and hands.

## What travels to the opponent

Only ids. A picture message carries `skin` (the base hand id, as before) and an optional **`cos`**: `{ tone, tattoo, nails, ring,
glove }` with item ids (1-12 lower-case letters, only those keys, validated by `validCos`). The receiver draws with **its own copies**;
an id it does not have is simply not drawn. An older phone sends no `cos` and ignores it. Random opponents get cosmetics too (they
are drawn data, never camera pixels).

## Ownership and equipping (`js/inventory.js`)

Local only, every storage access guarded (private mode falls back to memory):
`ff-owned` (ids granted by an unlock; free items are owned without being listed), `ff-cos` (equipped layer items),
`ff-puppet` (the equipped base hand, the key the skin picker always used). Equipping requires ownership; a saved equipment that is
unknown or not owned is dropped on load. The Profile skin picker lists only owned hands; the Store lists everything.

## Unlocking: a STUB (`js/unlock.js`)

**No ad network and no payment code exists in the web app.** Locked items show "Watch ad to unlock (demo)" or "Buy 0.99 (demo)";
both go through `unlockItem(inventory, entry)`, which asks the installed **provider** and grants the item only if the provider
answers `{granted: true}`. The default provider is the stub: it grants at once. The boundary is marked in the file
(`STUB BOUNDARY`). For the native app, call `setUnlockProvider({ name, request: async entry => ({ granted, receipt }) })` once at
start-up with an AdMob rewarded-ad or Google Play Billing implementation (a real purchase must be verified server-side before it
answers granted). Nothing else changes: the Store, the inventory and the tests are already written against that interface.
Ownership is a flag on the phone: fine for a friendly game, not a security boundary.

## Store and end-screen ad slot

* **Store** (menu button, and "Open the Store" in Profile): a live preview of your puppet with everything you wear (with a Test snap
  button), filter chips for category and item type, and a card per item: the item on the puppet, name, tags, Owned / Locked /
  Equipped, and one button (Equip / Take off / unlock). Locked cards are greyed.
* **Ad slot:** the result screen ends with an empty `#adSlot` div (min-height 50px, 320px wide, at the bottom) that only reserves
  space for a native banner. No ad code, no script, no image.
