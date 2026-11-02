// The player's cosmetics: which items are owned and what is worn. Local only (localStorage, every access guarded).
//   ff-owned   JSON list of item ids granted by an unlock (free items are owned without being listed)
//   ff-stack   JSON [{id, c?}]  what is worn on top of the base hand, in the order it was equipped (last = drawn on top); c = a picked #rrggbb
//   ff-puppet  the equipped BASE hand (the key the skin picker has always used)
//   ff-bcolor  the picked colour of the worn base hand (when that hand supports recolouring); ff-hcolors keeps one colour per hand: {handId: '#rrggbb'}
//   ff-catstyle JSON {layer: {c, k?}}  the colour (+ effect intensity) picked PER CATEGORY: tattoo, nails, ring, glove, effect. The Hand's colour is per hand (ff-hcolors).
//   ff-cos     the OLD format (one item per layer); read once to migrate, never written again
// Nothing here talks to a network. Ownership is a plain flag on this phone, which is fine for a friendly game; a real ad reward will
// need a server-side receipt check (see js/unlock.js, where that boundary is marked).
import { entryOf, cleanStack, legacyStack, catalogReady, stackToWire } from './cosmetics.js';
import { MAX_STACK, cleanColor, cleanIntensity, COLOR_LAYERS } from './layers.js';
import { skinIdOf } from './skins.js';

export const OWNED_KEY = 'ff-owned', STACK_KEY = 'ff-stack', OLD_COS_KEY = 'ff-cos', BASE_KEY = 'ff-puppet', BASE_COLOR_KEY = 'ff-bcolor', HAND_COLORS_KEY = 'ff-hcolors', CAT_KEY = 'ff-catstyle';

const memoryStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; };

export class Inventory {
  /** [storage]: localStorage-like ({getItem, setItem}); anything that throws (private mode, blocked storage) falls back to memory. */
  constructor(storage) {
    this.storage = storage || memoryStore();
    this.granted = new Set();
    this.stack = [];                 // [{id, color}], bottom to top
    this.base = null;
    this.baseColor = null;           // the worn hand's colour (from handColors)
    this.handColors = {};            // {handId: '#rrggbb'}: each hand keeps its own colour
    this.cat = {};                   // per-category colour: {layer: {c, k}}
    this.load();
  }
  #read(k) { try { return this.storage.getItem(k); } catch { return null; } }
  #write(k, v) { try { this.storage.setItem(k, v); return true; } catch { return false; } }
  #json(k) { try { return JSON.parse(this.#read(k)); } catch { return null; } }

  load() {
    const list = this.#json(OWNED_KEY);
    this.granted = new Set(Array.isArray(list) ? list.filter(x => typeof x === 'string').slice(0, 500) : []);
    const raw = this.#read(BASE_KEY);
    this.base = typeof raw === 'string' && raw ? raw : null;
    const saved = this.#json(STACK_KEY);
    let stack;
    if (Array.isArray(saved)) stack = cleanStack(saved);
    else { stack = legacyStack(this.#json(OLD_COS_KEY)); }              // migration: old one-per-layer equipment (+ old colour items) -> stack + colour
    // hand colours: one per hand. Older versions kept ONE colour for the worn hand (ff-bcolor), and the skin colour as a worn "skintone" item:
    // both move onto the worn hand (the Hand category's colour); a gradient's second stop is dropped (stop A stays).
    const hc = this.#json(HAND_COLORS_KEY);
    this.handColors = {};
    if (hc && typeof hc === 'object' && !Array.isArray(hc)) for (const [id, c] of Object.entries(hc).slice(0, 40)) { const cc = cleanColor(c); if (cc && /^[a-z]{1,12}$/.test(id)) this.handColors[id] = cc; }
    let migrated = !Array.isArray(saved) && stack.length > 0;
    const oldBc = cleanColor(this.#read(BASE_COLOR_KEY));
    if (oldBc && !this.handColors[this.baseId]) { this.handColors[this.baseId] = oldBc; migrated = true; }          // the worn hand's old colour (neon, dragon)
    const tone = stack.find(e => e.id === 'skintone');
    if (tone) {                                                                                                   // the old skin tone recoloured the cartoon hand: that is its colour now
      stack = stack.filter(e => e.id !== 'skintone'); migrated = true;
      if (cleanColor(tone.color) && !this.handColors.cartoon) this.handColors.cartoon = cleanColor(tone.color);
    }
    this.stack = stack;
    const cat = this.#json(CAT_KEY);
    const rawCat = cat && typeof cat === 'object' && !Array.isArray(cat) ? cat : null;
    if (rawCat) {                                                                                                 // category colours saved for 'tone' / 'base' by the previous version
      const tc = cleanColor(rawCat.tone?.c), bc = cleanColor(rawCat.base?.c);
      if (tc && !this.handColors.cartoon) { this.handColors.cartoon = tc; migrated = true; }
      if (bc && !this.handColors[this.baseId]) { this.handColors[this.baseId] = bc; migrated = true; }
    }
    this.cat = rawCat ? cleanCat(rawCat) : null;
    this.#sanitize();
    if (!this.cat) this.#migrateCat();
    this.baseColor = (catalogReady() ? (isHand(entryOf(this.baseId)) ? this.handColors[this.baseId] : null) : this.handColors[this.baseId]) || null;
    if (migrated) { this.#saveHands(); this.#saveStack(); if (rawCat) this.#saveCat(); }
  }
  /** First run of the per-category colours: whatever colour each worn item already had becomes its category's colour, applied to all of that category. */
  #migrateCat() {
    this.cat = {};
    if (catalogReady()) {
      for (const e of this.stack) { const x = entryOf(e.id); if (x && e.color && COLOR_LAYERS.includes(x.layer) && x.layer !== 'base') this.cat[x.layer] = { c: e.color, k: e.k || null }; }
      for (const e of this.stack) this.#applyCat(e);
      this.#saveCat();
    } else this.cat = null;                       // the catalogue is not in yet: load() runs again when it is
  }
  /** Gives a worn entry its category's colour / intensity (only what its item can take). */
  #applyCat(e) {
    const x = entryOf(e.id), c = x && this.cat?.[x.layer];
    if (!x || !c) return;
    if (x.tint && c.c) e.color = c.c;
    if (x.layer === 'effect' && c.k) e.k = c.k;
  }
  #saveCat() { this.#write(CAT_KEY, JSON.stringify(this.cat || {})); }
  #saveHands() { this.#write(HAND_COLORS_KEY, JSON.stringify(this.handColors)); this.#write(BASE_COLOR_KEY, this.baseColor || this.handColors[this.baseId] || ''); }
  /** An equipped item that no longer exists, is not owned, or is a hand is dropped (a removed item, a cleared grant, hand-edited storage). */
  #sanitize() {
    if (!catalogReady()) return;                       // nothing to judge against yet: load() runs again once the catalogue is in
    const before = JSON.stringify(this.stack);
    this.stack = this.stack.filter(e => { const x = entryOf(e.id); return !!x && x.layer !== 'base' && this.owns(e.id); });
    this.stack = this.stack.map(e => (entryOf(e.id).tint ? e : { id: e.id, color: null }));
    for (const id of Object.keys(this.handColors)) if (!isHand(entryOf(id))) delete this.handColors[id];       // only a real hand keeps a colour (every hand can be coloured: tinted ones recolour, the others hue-shift)
    if (JSON.stringify(this.stack) !== before) this.#saveStack();
  }
  #saveStack() { this.#write(STACK_KEY, JSON.stringify(stackToWire(this.stack))); }

  /** Owned = a free item, or one granted by an unlock. An unknown id is never owned. */
  owns(id) { const e = entryOf(id); return !!e && (e.free || this.granted.has(id)); }
  /** Records that an item is now owned. [source] is for the future ('ad', 'stub'); it is not stored. */
  grant(id, source = 'stub') {
    const e = entryOf(id);
    if (!e) return false;
    if (!e.free) { this.granted.add(id); this.#write(OWNED_KEY, JSON.stringify([...this.granted])); }
    return true;
  }

  /** The equipped base hand id (an unknown or unset one gives the default). */
  get baseId() { return skinIdOf(this.base || 'cartoon'); }

  isEquipped(id) { const e = entryOf(id); return !!e && (e.layer === 'base' ? this.baseId === id : this.stack.some(s => s.id === id)); }
  /** 1-based place in the stack (1 = just over the hand), or 0 when not worn. */
  position(id) { return this.stack.findIndex(s => s.id === id) + 1; }

  /**
   * TAP: wears an owned item, or takes it off if it is already worn. A new item goes on TOP of the stack (so the order is the tap
   * order). Several items of the same type are allowed; a hand is single (tapping the worn hand keeps it: the hand is always there).
   * Returns {ok, on} (ok=false: locked/unknown/stack full, nothing changed).
   */
  toggle(id) {
    const e = entryOf(id);
    if (!e || !this.owns(id)) return { ok: false, on: this.isEquipped(id) };
    if (e.layer === 'base') {
      if (this.baseId !== id) {
        this.base = id; this.#write(BASE_KEY, id);
        this.baseColor = this.handColors[id] || null;       // each hand has its own colour
        this.#saveHands();
      }
      return { ok: true, on: true };
    }
    if (this.isEquipped(id)) return { ok: this.remove(id), on: false };
    if (this.stack.length >= MAX_STACK) return { ok: false, on: false, full: true };
    const entry = { id, color: null };
    this.#applyCat(entry);                              // a new item is worn in its category's colour
    this.stack.push(entry);
    this.#saveStack();
    return { ok: true, on: true };
  }
  remove(id) {
    const n = this.stack.length;
    this.stack = this.stack.filter(s => s.id !== id);
    if (this.stack.length === n) return false;
    this.#saveStack();
    return true;
  }
  /** Moves a worn item one place: dir +1 = towards the top (drawn later, over more), -1 = towards the hand. Returns false at the end. */
  move(id, dir) {
    const i = this.stack.findIndex(s => s.id === id), j = i + (dir > 0 ? 1 : -1);
    if (i < 0 || j < 0 || j >= this.stack.length) return false;
    [this.stack[i], this.stack[j]] = [this.stack[j], this.stack[i]];
    this.#saveStack();
    return true;
  }
  /** Takes everything off the hand (the base hand stays). */
  clear() { this.stack = []; this.#saveStack(); }

  /** The picked colour of a worn item (or the base hand), validated: only an item with a colour picker takes one, only #rrggbb. null clears it. */
  setColor(id, color) {
    const e = entryOf(id);
    if (!e || !(e.tint || isHand(e))) return false;
    const c = color === null ? null : cleanColor(color);
    if (color !== null && !c) return false;
    if (e.layer === 'base') { if (this.baseId !== id) return false; this.#setHandColor(c); return true; }
    const s = this.stack.find(x => x.id === id);
    if (!s) return false;
    s.color = c;
    this.#saveStack();
    return true;
  }
  #setHandColor(c) {
    if (c) this.handColors[this.baseId] = c; else delete this.handColors[this.baseId];
    this.baseColor = c;
    this.#saveHands();
  }

  /** Every category has a colour picker; the Hand's works only on a hand that supports recolouring (see `handTintable`). */
  colorable(layer) { return COLOR_LAYERS.includes(layer); }
  /** Whether the worn hand can be recoloured (cartoon, neon, dragon...; robot, paw and the premade hands keep their own colours). */
  get handTintable() { return isHand(entryOf(this.baseId)); }
  /** The category's current colour settings {c, k}: what was picked, else null fields. For the Hand: the worn hand's colour. */
  categoryStyle(layer) {
    if (layer === 'base') return { c: this.handTintable ? this.baseColor : null, k: null };
    const c = this.cat?.[layer];
    return { c: c?.c || null, k: c?.k || null };
  }
  /**
   * ONE plain #rrggbb for a whole category (nail polish, tattoos, rings, gloves, effects) or for the worn hand: it applies to everything worn in that
   * category and to anything worn later. c = null puts the original colours back. Returns false for a bad colour or, for the Hand, a hand that
   * cannot be recoloured. (A second argument from older callers, the gradient stop, is ignored: there are no gradients any more.)
   */
  setCategoryColor(layer, c) {
    if (!COLOR_LAYERS.includes(layer)) return false;
    const c1 = c === null || c === undefined ? null : cleanColor(c);
    if (c !== null && c !== undefined && !c1) return false;
    if (layer === 'base') { if (!this.handTintable) return false; this.#setHandColor(c1); return true; }
    if (!this.cat) this.cat = {};
    const keep = this.cat[layer] || {};
    this.cat[layer] = { c: c1, k: keep.k || null };
    for (const e of this.stack) {
      const x = entryOf(e.id);
      if (x?.layer === layer && x.tint) e.color = c1;
    }
    this.#saveCat(); this.#saveStack();
    return true;
  }
  /** Effect intensity 1-10 for every worn effect and every effect worn later (inside the particle caps, see scaleEmitters). null = default. */
  setIntensity(k) {
    const kk = k === null ? null : cleanIntensity(k);
    if (k !== null && !kk) return false;
    if (!this.cat) this.cat = {};
    this.cat.effect = { ...(this.cat.effect || { c: null }), k: kk };
    for (const e of this.stack) if (entryOf(e.id)?.layer === 'effect') setOpt(e, 'k', kk);
    this.#saveCat(); this.#saveStack();
    return true;
  }
  colorOf(id) {
    const e = entryOf(id);
    if (!e || !(e.tint || isHand(e))) return null;
    if (e.layer === 'base') return this.baseId === id && this.baseColor ? this.baseColor : e.tint?.default || null;
    return this.stack.find(x => x.id === id)?.color || e.tint.default;
  }

  /** The whole getup as plain data for a saved look: the hand, its colour, the worn items in order (wire form: id, c, k) and the category colours. */
  getup() { return { base: this.baseId, bc: this.baseColor, lay: stackToWire(this.stack), cat: cleanCat(this.cat || {}) }; }
  /**
   * Wears a saved getup: the hand (when it exists and is owned), that hand's colour, the items (only those that exist and are owned, in the saved order, up to
   * the limit) with their colours, and the category colours. Everything is validated again here: a saved look is hand-editable storage.
   */
  applyGetup(g) {
    if (!g || typeof g !== 'object') return false;
    const hand = entryOf(g.base);
    if (hand && hand.layer === 'base' && this.owns(g.base)) { this.base = g.base; this.#write(BASE_KEY, g.base); }
    const bc = isHand(entryOf(this.baseId)) ? cleanColor(g.bc) : null;
    if (bc) this.handColors[this.baseId] = bc; else delete this.handColors[this.baseId];
    this.baseColor = bc;
    this.stack = cleanStack(Array.isArray(g.lay) ? g.lay : []).filter(e => { const x = entryOf(e.id); return !!x && x.layer !== 'base' && this.owns(e.id); }).slice(0, MAX_STACK);
    this.stack = this.stack.map(e => (entryOf(e.id).tint ? e : { id: e.id, color: null }));
    this.cat = g.cat && typeof g.cat === 'object' && !Array.isArray(g.cat) ? cleanCat(g.cat) : {};
    this.#saveHands(); this.#saveStack(); this.#saveCat();
    return true;
  }

  /** What the picture recipe needs: {base, baseColor, stack}. */
  loadout() { return { base: this.baseId, baseColor: this.baseColor, stack: this.stack.map(s => ({ ...s })) }; }
  /** The loadout with one item tapped on top (for the Store cards), without changing anything; already worn: unchanged. */
  loadoutWith(id) {
    const e = entryOf(id), out = this.loadout();
    if (!e) return out;
    if (e.layer === 'base') { out.base = id; out.baseColor = this.handColors[id] || null; }
    else out.stack = [this.stack.find(s => s.id === id) ? { ...this.stack.find(s => s.id === id) } : { id, color: null }];   // an item card shows THAT item alone on the worn hand: it must not change when another item is worn
    return out;
  }
}

/** Every base hand can be coloured: a tinted one recolours, any other is hue-shifted (cosmetics.js). */
const isHand = e => !!e && e.layer === 'base';

/** Sets an optional entry field, or removes it when [v] is empty (entries only carry what is set). */
function setOpt(e, key, v) { if (v) e[key] = v; else delete e[key]; }

/** A saved category-colour map, cleaned: only known categories (not the Hand, whose colours are per hand), plain #rrggbb colours, a 1-10 intensity. A gradient's second stop `d` is dropped. */
function cleanCat(raw) {
  const out = {};
  for (const l of COLOR_LAYERS) {
    if (l === 'base') continue;
    const r = raw[l];
    if (!r || typeof r !== 'object') continue;
    out[l] = { c: cleanColor(r.c), k: l === 'effect' ? cleanIntensity(r.k) : null };
  }
  return out;
}
