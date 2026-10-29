# Layered cosmetics and the Store

The puppet (see SKINS.md) is a **base hand plus a stack of worn items**. Every item is data (a JSON file), none needs a code change,
and everything rigs to the same 16 named puppet parts.

## The stack: tap order decides what is on top

* **Tap an item to wear it, tap it again to take it off.** (Store and Profile; there are no Equip / Take off buttons.)
* What you wear is an **ordered list**. A newly worn item goes on the **top**, so the order you tapped in is the draw order: tap a Glove,
  then a Ring and the ring is drawn over the glove; tap another Ring and it stacks over that.
* **Several items of the same type are allowed** (multiple rings, several tattoos...). Each item can be worn once; tapping it again
  removes that one. At most **12** items (`MAX_STACK`).
* The **base hand** is the bottom layer and single-select: tapping another hand swaps it; tapping the worn hand keeps it (the hand is
  always there). The **skin tone** is single too (a hand has one skin colour): a new tone replaces the old one.
* **Free stacking:** nothing is blocked. There is no fixed z per type any more; the list order is the only rule.
* **Manual reorder:** the "Wearing" card lists the stack, top first, with **▲ ▼ arrows** (move over / under its neighbour) and ✕ (take
  off). Arrows were chosen over drag-and-drop because they are big tap targets that work reliably on a touch phone (drag handles inside a
  scrolling page fight the scroll). Reordering redraws the preview, the live try-on and what the opponent sees at once. A skin tone and an
  effect draw no shapes, so their position does not matter visually.

| item type (`layer`) | what it is | drawn as |
|---|---|---|
| `base` | the hand: a skin file in `assets/skins/` or a **premade whole hand** | the full 16-part skin, always first |
| `tone` | skin colour (ONE item + colour picker) | recolours the base's skin colours; not a stack layer |
| `tattoo` | tattoos and scars | shapes on named parts |
| `nails` | nail polish (ONE item + colour picker) | shapes on the `*_tip` parts |
| `ring` | rings | shapes on finger parts |
| `glove` | gloves | shapes over every part |
| `effect` | particle effects (colour picker each) | particles only, no shapes |

The type is only metadata for browsing/filtering (and for what the Store shows). Code: `js/layers.js` (vocabulary, `parseTint`,
`roleColor`), `js/cosmetics.js` (catalogue, `parseItem`, `resolveLoadout`, stack helpers), `js/inventory.js` (the worn stack),
`rigPlan(lm, skin, layers)` in `js/puppet.js` (one whole pass per item, in list order).

## Colour pickers

Items that differ only by colour are ONE item with a **tint**. Collapsed: `pale tan brown deep orc frost` -> **`skintone`**;
`rednails blacknails neonnails` -> **`nailpolish`**. Tattoos (`tribal scar runes`), the hands **neon** (glow) and **dragon** (scales) and
every **effect** have a picker too. Rings, gloves and the other hands do not.

```jsonc
"tint": {
  "default": "#dc2626",                              // the colour it is drawn in until the player picks one
  "map": { "#dc2626": "main", "#7f1d1d": "dark" },   // colours used in this file -> role. main = the picked colour, dark / mid = darker, light = lighter
  "swatches": ["#dc2626", "#f97316", ...]            // the quick colours in the picker (up to 16); the player can also pick any colour
}
```

The same tint also recolours the item's own particle colours. For a **tone**, the map lists the *base hand's* colours (the cartoon hand's
`#f6c9a0 #9a5b2e #c98f5f #e9b38a`) and the item itself has no shapes; it changes a base only where the base uses those colours (robot, neon,
paw and every premade hand keep their own; a premade whole hand is never recoloured).

* **Stored:** `ff-stack` = `[{"id": "nailpolish", "c": "#22d3ee"}, ...]` (`c` only when picked); the base hand's colour is `ff-bcolor`.
* **Sent:** in a picture message as `lay` (the worn list, in order) and `bc` (base colour), see "What travels".
* **Validated everywhere:** only a lower/upper-case `#rrggbb` is accepted (`cleanColor`); `red`, `#fff`, `url(...)`, `rgb(...)`, longer
  strings, numbers: refused, the old colour stays. A colour only sticks to an item that has a picker. Drawing derives every other colour
  from the one picked, so no colour string from outside ever reaches the canvas except as a checked `#rrggbb`.

## Item file (a layer item, `assets/items/<id>.json`)

```jsonc
{
  "format": 1,
  "id": "goldring",                  // 1-12 lower-case letters, unique across ALL items and base hands; equals the file name
  "name": "Gold ring",               // 24 chars, shown in the Store
  "author": "...", "license": "...",
  "layer": "ring",                   // tattoo | nails | ring | glove | tone | effect   (a base hand is a skin file, see below)
  "category": "human",               // human | animal | scifi | fantasy | premade   (pure browsing metadata)
  "free": true,                      // false = locked until unlocked
  "unlock": { "method": "ad" },      // for a locked item: "ad" | "purchase" (+ "price": "0.99")  (label only, see "Unlocking")
  "tint": { ... },                   // optional colour picker, see above (required for a tone)
  "parts": {                         // part name -> shapes, in the BASE HAND'S part space (not for a tone or an effect)
    "ring_base": [ { "d": "M -7.8 -16 L 7.8 -16 L 7.8 -20 L -7.8 -20 Z", "fill": "#facc15", "stroke": "#a16207", "strokeWidth": 1.2 } ]
  },
  "particles": [ /* optional (required for an effect), see below */ ]
}
```

* `parts` keys are the 16 names from SKINS.md (`palm`, `index_base`, `middle_tip`, ...). Shapes use exactly the skin shape format
  (SVG path data, plain `#hex` colours, 1-12 shapes per part). **Author in the cartoon hand's proportions**: segment space has its
  pivot at (0,0), points up (-y) and ends at (0, -length); the palm is on the 0..100 grid. Other hands have nearly the same lengths,
  and the rig stretches the shapes to the real hand.
* Checked like network input (`parseItem`): unknown part, bad colour, non-path data, bad category/layer/tint, out-of-range numbers are
  refused; the item is skipped (the console says why), the rest load. (The old `z` and `recolor` fields are gone; unknown fields are ignored.)

## Base hands and premade whole hands

A base hand is a **skin file** (`assets/skins/<id>.json`, SKINS.md) with extra optional metadata at the top level:
`"category"`, `"free"`, `"unlock"`, `"particles"`, `"whole"`. Skin files without them (the first three) are human, free, no effects.

`"whole": true` marks a **premade whole hand**: one finished piece (the built-in `gauntlet` is steel plates with a glowing core;
`goldhand` is polished gold). It is the same 16-part format, so it rigs the same way and other items (rings, nails, tattoos,
a glove) still stack on top. The only difference: a skin tone is never applied to it. Premade hands use category `premade`.

Built in: bases `cartoon` `robot` `neon` (glow colour) `paw` (animal) `dragon` (fantasy, locked, scale colour) `gauntlet` (premade)
`goldhand` (premade, locked); `skintone`; tattoos `tribal scar runes`; `nailpolish`; rings `goldring silverring ruby`; gloves
`whiteglove leather fingerless knight`; effects `sparkles bubbles glow embers` (free) and `electric` (locked). `tools/make_skins.py` and `tools/make_items.py` drew
them (the JSON is the asset; write yours by hand or with any tool).

## Particle effects

Any item (base, layer or **effect**) may carry up to 4 emitters. An item of type `effect` is nothing but its emitters, equipped like any item
(tap, stack, reorder) with its own colour picker; the worn effects add their emitters to the hand's and to the other items'.

```json
"particles": [
  { "effect": "glow",   "color": "#f59e0b", "where": "palm", "rate": 2.5 },
  { "effect": "sparks", "color": "#fde047", "where": "tips", "trigger": "snap", "burst": 14 }
]
```

* `effect`: a preset from `EFFECTS` in `js/particles.js`: `sparks` (short jagged bolts: electricity), `glow` (soft halo), `embers`
  (rising dots), `glint` (twinkling star), `bubbles` (rings that drift up). An item names a preset; it can never carry code.
* `where`: `tips` (fingertips), `knuckles`, `palm`, `hand` (anywhere on it). `color`: `#hex`.
* `rate`: particles per second while the hand is shown (0-40). `trigger` + `burst`: a one-shot burst of that many particles when
  the named event fires; today the only event is `snap` (the moment the answer is taken). An emitter needs a rate, a burst, or both.
* Sizes and speeds follow the size of the hand on screen.

How it stays cheap: one `ParticleSystem` per camera, **hard cap of 90 live particles** (6 emitters) however many items are worn;
no gradients and no shadow blur (lines, arcs, fills); no timer or loop of its own: `update/draw` run inside the existing tracking
loop only when a new video frame was analysed, and a stalled frame is clamped; the camera is released at the snap, so nothing runs
outside a guess window. **Reduced motion** (device setting): no particles at all.

Where you see them: live on your own camera view (puppet views), in the Store / Profile preview and in the live try-on (below).
The pictures your opponent gets are still images, so they show a **still snapshot** of the effects (`snapshot()`: a fixed sample
plus the snap burst, drawn from a fixed seed so it is the same every time); stills are drawn even under reduced motion.

## Registering a new item

1. Layer item: write `assets/items/<id>.json`, add `<id>` to `assets/items/manifest.json` (`{"items": [...]}`).
   Base hand: write `assets/skins/<id>.json`, add `<id>` to `assets/skins/manifest.json`.
2. Add the file(s) to `SHELL` in `sw.js` and run `node tools/stamp.mjs` (tests fail if you forget either).
3. It appears in the Store by itself, filterable by its `category` and `layer`. Ids must be unique across items and hands.

## What travels to the opponent

Only ids and plain colours. A picture message carries `skin` (the base hand id, as before) and optionally **`lay`**: the worn list in
order, at most 12 entries `{ "id": "goldring" }` or `{ "id": "nailpolish", "c": "#22d3ee" }`, and **`bc`**: the base hand's colour
(`#rrggbb`). `validLay` / `validBc` (js/logic.js) refuse anything else (extra keys, ids that are not 1-12 lower-case letters, colours that
are not exactly `#rrggbb`, longer lists), and a refused picture is dropped like any bad message. The receiver draws with **its own
copies**, in that order; an id it does not have is simply not drawn. Random opponents get cosmetics too (drawn data, never camera pixels).
Compatibility: the first version sent `cos` (`{tone, tattoo, nails, ring, glove}` ids); it is still accepted (`validCos`) and drawn
(old colour items map to `skintone` / `nailpolish` + their colour, `LEGACY_ITEMS`), but this version sends `lay` only, so an old phone
shows no cosmetics from a new one until it updates (the site updates itself).

## Ownership and what is worn (`js/inventory.js`)

Local only, every storage access guarded (private mode falls back to memory): `ff-owned` (ids granted by an unlock; free items are
owned without being listed), `ff-stack` (the worn list, in order, with picked colours), `ff-puppet` (the base hand, the key the skin
picker always used), `ff-bcolor` (the base hand's picked colour). Wearing requires ownership; a saved entry that is unknown, not owned,
a hand, has a colour it cannot take, or a second tone is dropped on load.
**Migration:** an inventory saved by the first version (`ff-cos`, one item per type) is converted once on load, in the old draw order:
`pale tan brown deep orc frost` become `skintone` + that tone's colour, `rednails blacknails neonnails` become `nailpolish` + its colour,
every other id is unchanged; the result is written to `ff-stack` and `ff-cos` is never read again. `ff-owned` is kept as is. (The colour
variants are now free colours of a free item; the old locked orc / frost / black / neon variants are no longer paywalled.)

## Unlocking: a STUB (`js/unlock.js`)

**No ad network and no payment code exists in the web app.** Locked items show "Watch ad to unlock (demo)" or "Buy 0.99 (demo)";
both go through `unlockItem(inventory, entry)`, which asks the installed **provider** and grants the item only if the provider
answers `{granted: true}`. The default provider is the stub: it grants at once. The boundary is marked in the file
(`STUB BOUNDARY`). For the native app, call `setUnlockProvider({ name, request: async entry => ({ granted, receipt }) })` once at
start-up with an AdMob rewarded-ad or Google Play Billing implementation (a real purchase must be verified server-side before it
answers granted). Nothing else changes: the Store, the inventory and the tests are already written against that interface.
Ownership is a flag on the phone: fine for a friendly game, not a security boundary.

## Store and end-screen ad slot

* **Store** (menu button, and "Open the Store" in Profile): the **Wearing card** (below), filter chips for category and item type, and a
  card per item: the item on the puppet, name, tags, Owned / Worn · #n / Locked. **Tap a card to wear / remove it.** A locked card
  has only its unlock button (a stub today) and is greyed. The **Profile** has the same Wearing card and a grid of the items you own.
* **Wearing card** (shared by Store and Profile): the preview (animated effects), **Test snap**, **Take everything off**, and the worn
  list top-first with a colour dot (opens the picker: swatches, any colour, Original), ▲ ▼ and ✕ per item; the base hand is the last row.
* **Live try-on (Test snap):** the first tap loads the hand model (17 MB, once), switches the camera on and shows your real hand with the
  puppet and every worn item drawn on it in the worn order, following your fingers (it is your own screen only: nothing is sent). Tap
  Test snap again for the snap effects on your hand. **Camera off** (or leaving the screen, hiding the page, or the camera being taken
  away) switches it off. If it cannot start, the line under the preview says why (permission denied, no camera, model download failed...);
  it never hangs, and the button works again afterwards. Changing items, order or colour updates the live view at once.
* **Ad slot:** the result screen ends with an empty `#adSlot` div (min-height 50px, 320px wide, at the bottom) that only reserves
  space for a native banner. No ad code, no script, no image.
