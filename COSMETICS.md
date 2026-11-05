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
  always there). There is no separate skin-tone item any more: the **Hand colour** recolours the worn hand (see below).
* **Free stacking:** nothing is blocked. There is no fixed z per type any more; the list order is the only rule.
* **Manual reorder:** the "Wearing" card lists the stack, top first, with **▲ ▼ arrows** (move over / under its neighbour) and ✕ (take
  off). Arrows were chosen over drag-and-drop because they are big tap targets that work reliably on a touch phone (drag handles inside a
  scrolling page fight the scroll). Reordering redraws the preview, the live try-on and what the opponent sees at once. An effect
  draws no shapes, so its position does not matter visually.

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

## Colour per category (current)

The colour is chosen **per category**, not per item: Hand, Tattoo / scar, Nail polish, Ring, Glove and Effect each have ONE picker, shown above the
item cards, that switches with the category chip. It is one line: a native full-spectrum colour button, `BASIC_PALETTE` (11 well-spread presets: 8 hues, white,
grey, black) and "Original". It applies to everything worn of that type and to anything worn later (`Inventory.setCategoryColor`, stored in
`ff-catstyle` and copied onto each worn entry). One plain `#rrggbb` only.
* **Hand colour** is per hand (`ff-hcolors`, `Inventory.handColors`): the Hand chip recolours the *worn* hand when that hand has a `tint` (cartoon, neon,
  dragon); robot, paw and the premade hands keep their own colours and the picker says so. Switching hands never tints one hand with another's colour.
  The old Skin tone category is gone; an old skin-tone colour becomes the cartoon hand's colour.
* **No gradients** any more. A phone on the previous version may still send `lay[].d` / picture `bd`: they validate as plain `#rrggbb`, receivers ignore them, and
  stored values are dropped (a saved gradient keeps only stop A).
* **Effect intensity** 1-10 (5 = as authored), `lay[].k`: scales rate / burst / size (`scaleEmitters`) inside the per-emitter limits; the
  90-particle / 6-emitter caps still bound everything.
* **Skeleton colour**: picture field `sk` (`#rrggbb`), stored as `ff-skel`.
* **Migration:** colours picked per item by earlier versions become the category colour on first load (`ff-catstyle` absent).
The per-item description below is how the colour reaches each item (tint roles); the pickers are per category.

## Colour pickers

Items that differ only by colour are ONE item with a **tint**. Collapsed: `rednails blacknails neonnails` -> **`nailpolish`** (the former skin tones are now the cartoon hand's colour). Tattoos, rings and gloves,
the hands **cartoon**, **neon** (glow) and **dragon** (scales) and every **effect** have a picker too. Robot, paw and premade hands do not.

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
a glove) still stack on top. The only difference: it cannot be recoloured. Premade hands use category `premade`.

Built in: bases `cartoon` `robot` `neon` (glow colour) `paw` (animal) `dragon` (fantasy, locked, scale colour) `gauntlet` (premade)
`goldhand` (premade, locked); tattoos `tribal scar runes`; `nailpolish`; rings `goldring silverring ruby`; gloves
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
(old colour items map to the hand colour / `nailpolish` + their colour, `LEGACY_ITEMS`), but this version sends `lay` only, so an old phone
shows no cosmetics from a new one until it updates (the site updates itself).

## Ownership and what is worn (`js/inventory.js`)

Local only, every storage access guarded (private mode falls back to memory): `ff-owned` (ids granted by an unlock; free items are
owned without being listed), `ff-stack` (the worn list, in order, with picked colours), `ff-puppet` (the base hand, the key the skin
picker always used), `ff-bcolor` (the base hand's picked colour). Wearing requires ownership; a saved entry that is unknown, not owned,
a hand, has a colour it cannot take, or a second tone is dropped on load.
**Migration:** an inventory saved by the first version (`ff-cos`, one item per type) is converted once on load, in the old draw order:
`pale tan brown deep orc frost` become the cartoon hand's colour, `rednails blacknails neonnails` become `nailpolish` + its colour,
every other id is unchanged; the result is written to `ff-stack` and `ff-cos` is never read again. `ff-owned` is kept as is. (The colour
variants are now free colours of a free item; the old locked orc / frost / black / neon variants are no longer paywalled.)

## Unlocking: a STUB (`js/unlock.js`)

**No ad network and no payment code exists in the web app, and NO item can be bought: every locked item is an ad-lock** (`unlock.method` is `free` or `ad`; `purchase` and prices are refused by the parser). Locked items show "Watch ad to unlock (demo)";
the tap goes through `unlockItem(inventory, entry)`, which asks the installed **provider** and grants the item only if the provider
answers `{granted: true}`. The default provider is the stub: it grants at once. The boundary is marked in the file
(`STUB BOUNDARY`). For the native app, call `setUnlockProvider({ name, request: async entry => ({ granted, receipt }) })` once at
start-up with an AdMob rewarded-ad implementation (it answers granted only when the rewarded ad was completed). Nothing else changes: the Store, the inventory and the tests are already written against that interface.
Ownership is a flag on the phone: fine for a friendly game, not a security boundary.

## Which side an item is on (nails, tattoos)

Items carry `side`: `back` | `palm` | `both` (default both). **Nail polish is always `back`** (nails are only on the back of a fingertip); tribal is a back tattoo,
runes a palm tattoo, scar and every ring/glove are on both. `rigPlan(lm, skin, layers, back)` draws an item only when its side faces the camera:
`back === true` (the back of the hand faces the camera) shows `back` items, `false` (palm) shows `palm` items, `undefined` (not known: the simulator
poses, pictures from older phones) draws everything. The facing comes from `handBack(lm, label)` (js/puppet.js): the turn direction of wrist -> index knuckle -> pinky
knuckle flips when the hand is turned over, and MediaPipe's Left/Right label (used directly, `LABEL_MIRRORED=false`, corrected from phone feedback) separates a left from a right hand. It runs every frame on the live
camera view and at the snap; the result travels as `bk` (up to two true / false / null) so the opponent's picture shows polish only when your back really faced the camera.

## Profile: one merged panel

"How my opponent sees my hand" holds the view choice, the preview, the skeleton colour (skeleton views), "Choose your Hand" (built-in hands
and the player's own hands from `ff-userhands`, see `registerUserSkin`, in one grid) and **Customise & try on**. Customise turns the camera
on, shows the type chips (Hand ... Effect), the owned items of that type, the category colour panel and the worn list; there are no camera controls: the try-on follows the chosen view (photo views show my live picture behind the puppet, others the puppet alone), and the window sits above the hand grid at full panel width. Done, leaving the Profile or hiding the page turns the camera off. With the camera off the preview holds a fixed back-facing pose, with idle shape animations and particles. The old face-rotation sway has been removed. There is no separate "Your items" section.

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

## Skeleton styles, saved looks, favourites (2026-11-01)
* **Skeleton styles** (`SKELETON_STYLES` in layers.js, drawn by `drawBones` in avatars.js; no shadow blur): `classic`, `thin`, `bold`, `dashed`, `glow`, `joints`. Wire: picture field `ss` (1-12 lower-case letters; unknown ids are drawn as classic), stored locally as `ff-skelstyle`; the colour is the existing `sk` / `ff-skel`.
* **Chips** (`PROFILE_LAYERS`): Hand, Skeleton, Tattoo, Nail polish, Ring, Glove, Effect. The Hand category holds the owned hands (built-in and user-made); the Skeleton category holds the six styles.
* **Saved looks** (`js/looks.js`): `ff-looks` = up to 12 `{id, name, base, bc?, lay[{id,c?,k?}], cat?, sk?, ss?}`, `ff-look` = the last applied id. `Inventory.getup()` / `applyGetup()` snapshot and wear a getup, re-validating owned items, colours and the stack limit.
* **Favourites**: `ff-favbg` (0-4), `ff-favsong` (-1 none, 0-4). Not sent over the network; a new room's settings start from them.

## Colour picker and editing looks (2026-11-02)
* The full-colour control is **our own picker** (`js/colorpick.js` + `colorPanel` in main.js), not `<input type=color>`: hue slider + saturation/brightness square, live while dragging, Done to close. It only produces lower-case `#rrggbb` (`hsvToHex`), applied through `Inventory.setCategoryColor` / the skeleton colour (`sk`), so storage and the wire format (`c`, `bc`, `sk`) are unchanged.
* `Looks.rename(id, name)` and `Looks.update(id, getup)` (overwrite the outfit, keep id / name / position); both re-clean everything with `cleanLook`.

## Content batch 1 (2026-11-02): eight hands and three nail items, all generic styles
Drawn by `tools/make_batch1.py` (uses the helpers of `make_skins.py`, appends to both manifests). Existing format only; no rig, validation or wire change.

| id | what | category | state |
|---|---|---|---|
| `lowpoly` Geometric | angular faceted hand, two tones | scifi | free, recolourable |
| `frog` Frog | green, round toe pads, webbing between the fingers | animal | free, recolourable |
| `duck` Duck | yellow, bill-orange tips and webbing, feather tufts at the wrist | animal | free |
| `toybrick` Toy brick | blocky building-block hand with studs (no brand marks) | fantasy | free, recolourable |
| `floppy` Floppy | fat, soft, oversized fingers that sag a little | human | free, recolourable |
| `mechanical` Mechanical | plates, gear at every joint, piston rod per segment; sparks at the knuckles | scifi | locked (ad) |
| `cyberpunk` Cyberpunk | dark plated hand, glow lines, circuit traces, LED tips; glint | scifi | locked (purchase 0.99), recolourable accent |
| `flaming` Flaming | charred hand ENGULFED in animated flame: 4 `flame` emitters (hand x2, tips, palm; ~112 flames/s so the live count sits at the 90-particle cap), static flames on palm and fingers for reduced motion | fantasy | locked (ad) |
| `longnails` Long nails | pointed stiletto nails reaching past the tip | human | free, recolourable |
| `claws` Claws | short curved animal claws, ivory | animal | free, recolourable |
| `longclaws` Long claws | (was Blade fingers) long wolverine-style steel spikes from every fingertip, dynamic, length-aware, either side | scifi | locked (ad), recolourable |

* The three nail items are in the existing **nails layer** (Nail polish chip), so they get the category colour picker, stack with polish, and are drawn on the nail side only.
* **Not built (rig limit):** *longer fingers*. The rig stretches every segment so its end lands exactly on the next landmark, so a skin cannot make a finger longer, and an item that only extends the tip cannot match the hand's colour. It needs a rig extension (a per-finger extension past the tip landmark, drawn in the base hand's own colours). *Floppy fingers* was possible because width is part of the skin, so it is a **base hand**, not an item.


## Part E content (2026-11-02): twelve more generic items (`tools/make_batch3.py`)
Hands (skins): `bone` `sand` `inksketch` free; `eyes` locked (ad); `burnbone` locked (ad, full-hand flame over clean bones); the Chrome skeleton was removed. Nails layer: `scissors` locked (ad; LONG blades on four fingers). `hook` is now a HAND (free), see below. Gloves: `boxing` `rubber` free, `formal` locked (ad); all recolourable. Ring: `ornate` locked (ad, glow + glint emitters). Generated hands (`js/generated.js`): Geometric (`gc` 1-5) and Painting (`sd` seed, locked) travel as validated integers; see DECISIONS.md. Gridmesh is a normal skin file (`gridmesh`, free).

## Rig extensions (2026-11-02): web membrane, fingers past the tip, sand
Optional skin fields (and `extend` on a layer item). All drawing only: they never change the landmarks, so finger counting is unaffected.
* `"web": {"fill": "#4f9a3b", "stroke": "#2f6b36", "strokeWidth": 1.6, "opacity": 0.95, "reach": 0.72, "scallop": 0.28}`: a membrane in each gap between neighbouring fingers (index-middle, middle-ring, ring-pinky), pinned to both fingers' landmark chains (so it follows the spread), `reach` = how far up the fingers (0.2-1), `scallop` = how deep the free edge curves back (0-0.6). Used by `frog`, `duck`. Colours are recoloured by the tint / hue-shift.
* `"extend": {"len": 0.95, "pieces": 3, "droop": 1.35, "fingers": [...]}`: `len` = extra length as a share of the finger's length (0.05-2), `pieces` = links (1-4), `droop` = total sag toward screen-down in radians (0-2), `fingers` optional. Links reuse the hand's own `_mid` (inner) and `_tip` (last) shapes. A skin carries its own (`floppy` = hotdog fingers); a layer item may carry one instead of shapes (`longfingers`, free, Nail polish chip); a worn item's extension replaces the hand's. Shown whichever side faces the camera.
* `"sand": {"color": "#e2bf7e", "color2": "#f7e6b8"}` marks a sand hand (js/sand.js): it crumbles into a 84-grain swarm when shaken (landmark speed > 4.5 palm widths/s for 0.15 s) and re-forms after 0.4 s under 1.5. Needs a `grain` emitter for the shed grains. The swarm is inside the 90-particle cap; reduced motion = static hand. Nothing extra is sent: the opponent's picture is a still.
* New particle preset `grain` (jitter, gentle gravity). Tools: `make_batch1.py` (frog/duck/hotdog), `make_batch3.py` (sand), `make_batch4.py` (longfingers).

## Parts A-C (2026-11-02): dynamic items, length-awareness, hook hand, physics, idle animation
* **`dynamic`** (layer item, or on a skin overlay): `true` or `{pivot, min, hide, only}`. The shape scales toward `pivot` (share of its part's length) as the finger curls, down to `min`, and is hidden when the finger is curled (`hide`, with hysteresis in live play so it cannot flicker); `only: "tip"` (default) makes just the `*_tip` parts follow the finger, `"all"` every part. Stretch per finger = `fingerExtension(lm, finger)` (0 curled .. 1 straight, from the landmarks only; thumb has its own range). Used by Long nails, Claws, Long claws, Scissors and the Hook hand's overlays. Counting never reads any of it.
* **Length-aware**: with an `extend` (skin or item) the rig places tip shapes of every item / overlay on the LAST link, mid shapes on the real tip and inner links; the web follows the long finger.
* **`side`** on a nails item overrides the default (nails = back only): Claws, Long claws and Scissors are `both`.
* **Hook** (`hook`, Hand category, free): steel-rod hand with a dynamic hook overlay on each tip: one hook per raised finger.
* **Floppy physics** (`extend.physics: true`, hotdog): `HandDynamics` (js/dynamics.js) springs every link end toward its ideal place (K 140, C 11, damping ratio ~0.46) with fixed link lengths and projected velocity, so the finger lags, overshoots a little and settles. Live hands only; off under reduced motion or below ~20 fps. Cost is a few thousandths of a ms.
* **Idle animation**: a shape may carry `anim` = `{pulse: [Hz, amount, phase], drift: [ax, ay, Hz, phase], spin: [cx, cy, rad/s], blink: [cy, period s, phase]}` (numbers validated in range). Only live hands (camera overlay and the Profile preview) get the clock; pictures, the opponent's reveal and reduced motion are still. Cheap idle animation continues even below 20 tracking fps; only spring physics uses the slow-frame cutoff. Neon/Robot/Gauntlet/Gold/Dragon/Frog/Bone pulse, Toy brick studs bob, Mechanical gears spin, Eyes blink, Cyberpunk circuits pulse, Gridmesh shimmers, Ink sketch lines boil, Geometric facets and Painting strokes drift (from `js/generated.js`, using no random numbers so the seed still gives the same hand). `tools/make_anims.py` applies them to the files (run it after the generators).
* **Stable side flag**: the live camera holds "back of the hand" until the other side is seen 6 frames in a row (`HandDynamics.stableBack`).
* New effect preset `flame`.

## Camera and skin fixes (2026-11-04)

- The live `HandCam` path already called `HandDynamics.update` and passed `animTime` into `drawPuppet`; its shared 50 ms frame cutoff was freezing idle animation when camera inference ran below 20 fps. The idle clock now depends only on reduced motion. Physics retains the cutoff. No extra tracking pass, timer or render loop was added. Still snapshots remain still.
- Recoloured generated skins are cached by source object identity, not just skin id. Changing Geometric detail now produces 36, 68, 99, 130 and 192 facets at levels 1–5, including with a selected colour. Painting seeds also stay distinct after recolouring. Existing persistence and wire validation are unchanged.
- Frog and Duck have a shallow thumb-index membrane anchored at the thumb MCP/IP/tip chain and the proximal index chain. It is hidden when the thumb is tucked/crossed or index curled. All path vertices and the scallop control stay outside the thumb-MCP/index-knuckle palm edge. Geometry is mirror-independent and never changes counting landmarks.
- Burning Bone uses clean Bone parts plus static flame shapes on every part and Flaming's four full-hand emitters (112 flames/s offered, at most 90 live particles and 6 emitters total). Reduced motion keeps the static flames and bones.
- Sand keeps the same shake trigger. Collapse takes 0.45 s; reform 1.2 s, after the existing calm interval. Its 84 shared swarm grains follow staggered curved paths with drift and downward acceleration as dispersal grows, easing home on reform. Existing shed particles are trimmed as the swarm appears, leaving six slots inside the 90 cap. Reduced motion remains static. This is procedural sand motion, not a collision simulation.

Camera animation, Burning Bone and Sand particularly need screenshot/phone review. Thumb web coverage also needs real folded/open-hand review; safety gates deliberately hide ambiguous poses.

## Painting gestures, fire control and rooted web (2026-11-04 follow-up)

- Menu order is now Profile & settings, Store, Stats.
- Clicking the owned Painting tile (including when already worn), or the large fitting preview while Painting is worn, generates a different seed. On the live camera, a fist held for 150 ms rerolls once; a real open hand held for 150 ms rearms it. Missing hands do not reroll or rearm it. This reuses the already-computed finger count; no extra tracking pass or landmark edits. The selected seed still travels as validated `sd`, including simulator snapshots.
- Flaming and Burning Bone show **Fire intensity** in the Hand category. Values 1–10 are saved locally in `ff-fire`, default 7. Rate scaling reuses `scaleEmitters` (at most 40/s per emitter) and flame size ranges from 0.52× to 1.6×; default 7 is 1.24× the previous authored size. This makes a stronger flame visible without exceeding 90 live particles / 6 emitters. Particle sizes do not change the static reduced-motion artwork.
- The sender includes optional `fi` for these two fire hands, validated as an integer 1–10. Receivers reproduce it from local assets; absent values use default 7, independent of the receiver's own setting. Other hand ids do not send `fi`. Invalid saved/runtime values are ignored.
- Web membranes now start exactly at the finger bases. The thumb side starts at landmark 1 (CMC), index at landmark 5 (MCP); thumb reach is up to 0.8 and index up to 0.65 of their chains. Open-thumb and palm-edge guards remain, using the CMC-to-index boundary. This replaces the previous shallow MCP thumb root which left the base looking unwebbed. Screenshot review is still needed.

Next cosmetic polish candidates (ideas, not changes in this build): sand texture with coherent light/dark grains, momentum-carrying loose grains and a rolling reform edge; metallic glints for mechanical parts, soft glove creases, nail highlights, and restrained movement tied to each material. Keep the same rig, reduced-motion behavior and bounded particle budget; tune on phone screenshots before a catalogue-wide redesign.

## Material visual pass (2026-11-04)

**Local idle control:** the Hand category has an Idle animation slider, 0–10, saved in `ff-motion` (5 default). It scales existing drift, opacity pulse, blink amount and spin rate across hand and worn-item shapes. 0 leaves tracked geometry live but freezes idle shape motion. Reduced motion freezes idle shapes regardless of this setting. Particle/fire intensity and shake/spring physics are independent; no new wire data is sent for idle strength.

**Material detail:** Robot, Mechanical, Gauntlet, Golden, Cyberpunk, Hook and Knight have restrained moving light lines/joint seams. White, Leather, Fingerless, Boxing, Rubber and Formal gloves have curved folds and soft highlights; rubber has a brighter sheen. Gold/Silver/Ruby/Ornate rings get small glints. Nail polish gets a glossy edge, and long nails/claws/scissors animate existing light lines. All paths stay in the current part/layer/side/dynamic system; a polish highlight cannot appear from the palm side when its nail is hidden. No new particle emitters. Other hands retain their existing material-specific animations and use the same idle-strength control.

**Sand:** surface shading and grain/ripple paths add depth without gradients. The live swarm now keeps world-space position and velocity, inherits hand momentum on release and integrates drag, gravity and a small curl. Calm grains spring home to the current hand with bounded 16 ms substeps. Staggered release and tip→mid→base→palm dissolve produce a rolling crumble; decreasing collapse reforms palm→base→mid→tip. Worn layers share the dissolve. Body and swarm use the same frame. Solid reduced-motion and opponent stills keep the full textured hand. No collision simulation or networked shake state was added.

Grains use three shades and tiny facet highlights without adding particles. The 84 swarm recipes are partitioned between tracked hands; spawned shed/effect particles remain inside the combined 90 cap and 6 emitters. The old pure `swarmGrains` helper is retained for deterministic reference geometry; live rendering uses `SandMotion.swarm` state.

Run `python3 tools/make_visual_pass.py` last after rebuilding original assets and animations. It replaces its own normal-path accents, marked `detail: material-v1` in authoring JSON (ignored by `parseShapes`); all existing path/colour/animation validation and 12-shape caps still apply. `node tools/review_materials.mjs` generates `artifacts/material-review.svg` from before/after rig paths and prints JS-only rendering timings. This sheet is a static vector review, not a phone screenshot. Review Sand motion, stronger metal/nail highlights, glove folds and maximum stacks on a phone before considering the visual tuning finished.

## Facing, Paw and compact browsing (2026-11-05)

Paw claws now use five dynamic fingertip overlays (`pivot: 1`, `min: 0.05`, hide on curl) instead of permanent tip shapes. They extend independently, follow longer-finger endpoints and project from either side. Polish and long nails remain back-only; phone feedback corrected the global handedness-label inversion. The Cartoon hand's own nail-line shapes now carry validated `side: back` and use the same corrected facing. Shape `side` accepts only `back`, `palm`, `both`; absent means both, unknown hand facing retains legacy full drawing.

Idle/Painting help paragraphs are removed. Slider label/range/value stay on one row; the range can shrink on narrow screens. Arena/music parentheticals are removed. Category/type clicks reset card scrolling after replacement and align the first new items beneath the Profile's sticky controls (or Store filters). Equipping/recolouring alone preserves the browsing position. Check facing, partial Paw curls and mobile layout on a phone.
