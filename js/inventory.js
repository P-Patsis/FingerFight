// The player's cosmetics: which items are owned and what is worn. Local only (localStorage, every access guarded).
//   ff-owned   JSON list of item ids granted by an unlock (free items are owned without being listed)
//   ff-stack   JSON [{id, c?}]  what is worn on top of the base hand, in the order it was equipped (last = drawn on top); c = a picked #rrggbb
//   ff-puppet  the equipped BASE hand (the key the skin picker has always used)
//   ff-bcolor  the picked colour of the base hand, when it has a colour picker (ff-bcolor2: the second stop of a gradient)
//   ff-catstyle JSON {layer: {c, d?, k?}}  the colour (+ second gradient stop, + effect intensity) picked PER CATEGORY: base, tone, tattoo, nails, effect
//   ff-cos     the OLD format (one item per layer); read once to migrate, never written again
// Nothing here talks to a network. Ownership is a plain flag on this phone, which is fine for a friendly game; real purchases will
// need a server-side receipt check (see js/unlock.js, where that boundary is marked).
import { entryOf, cleanStack, legacyStack, catalogReady, stackToWire } from './cosmetics.js';
import { MAX_STACK, cleanColor, cleanIntensity, COLOR_LAYERS, GRADIENT_LAYERS } from './layers.js';
import { skinIdOf } from './skins.js';

export const OWNED_KEY = 'ff-owned', STACK_KEY = 'ff-stack', OLD_COS_KEY = 'ff-cos', BASE_KEY = 'ff-puppet', BASE_COLOR_KEY = 'ff-bcolor', BASE_COLOR2_KEY = 'ff-bcolor2', CAT_KEY = 'ff-catstyle';

const memoryStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; };

export class Inventory {
  /** [storage]: localStorage-like ({getItem, setItem}); anything that throws (private mode, blocked storage) falls back to memory. */
  constructor(storage) {
    this.storage = storage || memoryStore();
    this.granted = new Set();
    this.stack = [];                 // [{id, color}], bottom to top
    this.base = null;
    this.baseColor = null;
    this.baseColor2 = null;
    this.cat = {};                    // per-category colour: {layer: {c, d, k}}
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
    this.baseColor = cleanColor(this.#read(BASE_COLOR_KEY));
    this.baseColor2 = this.baseColor ? cleanColor(this.#read(BASE_COLOR2_KEY)) : null;
    const saved = this.#json(STACK_KEY);
    if (Array.isArray(saved)) this.stack = cleanStack(saved);
    else { this.stack = legacyStack(this.#json(OLD_COS_KEY)); if (this.stack.length) this.#saveStack(); }   // migration: old one-per-layer equipment (+ old colour items) -> stack + colour
    const cat = this.#json(CAT_KEY);
    this.cat = cat && typeof cat === 'object' && !Array.isArray(cat) ? cleanCat(cat) : null;
    this.#sanitize();
    if (!this.cat) this.#migrateCat();
  }
  /** First run of the per-category colours: whatever colour each worn item (and the hand) already had becomes its category's colour, applied to all of that category. */
  #migrateCat() {
    this.cat = {};
    if (catalogReady()) {
      for (const e of this.stack) { const x = entryOf(e.id); if (x && e.color && COLOR_LAYERS.includes(x.layer)) this.cat[x.layer] = { c: e.color, d: e.color2 || null, k: e.k || null }; }
      if (this.baseColor) this.cat.base = { c: this.baseColor, d: this.baseColor2, k: null };
      this.#applyAllCats();
      this.#saveCat();
    } else this.cat = null;                       // the catalogue is not in yet: load() runs again when it is
  }
  #applyAllCats() {
    for (const e of this.stack) this.#applyCat(e);
    if (this.cat?.base && entryOf(this.baseId)?.tint) { this.baseColor = this.cat.base.c; this.baseColor2 = this.cat.base.d || null; }
  }
  /** Gives a worn entry its category's colour / gradient / intensity (only what its item can take). */
  #applyCat(e) {
    const x = entryOf(e.id), c = x && this.cat?.[x.layer];
    if (!x || !c) return;
    if (x.tint && c.c) { e.color = c.c; setOpt(e, 'color2', GRADIENT_LAYERS.includes(x.layer) ? c.d : null); }
    if (x.layer === 'effect' && c.k) e.k = c.k;
  }
  #saveCat() { this.#write(CAT_KEY, JSON.stringify(this.cat || {})); }
  /** An equipped item that no longer exists, is not owned, or is a hand is dropped (a removed item, a cleared grant, hand-edited storage). */
  #sanitize() {
    if (!catalogReady()) return;                       // nothing to judge against yet: load() runs again once the catalogue is in
    const before = JSON.stringify(this.stack);
    const seenTone = [];
    this.stack = this.stack.filter(e => {
      const x = entryOf(e.id);
      if (!x || x.layer === 'base' || !this.owns(e.id)) return false;
      if (x.layer === 'tone') seenTone.push(e.id);
      return true;
    });
    if (seenTone.length > 1) this.stack = this.stack.filter(e => entryOf(e.id).layer !== 'tone' || e.id === seenTone[seenTone.length - 1]);
    this.stack = this.stack.map(e => (entryOf(e.id).tint ? e : { id: e.id, color: null }));
    if (this.baseColor && !entryOf(this.baseId)?.tint) { this.baseColor = null; this.baseColor2 = null; }
    if (JSON.stringify(this.stack) !== before) this.#saveStack();
  }
  #saveStack() { this.#write(STACK_KEY, JSON.stringify(stackToWire(this.stack))); }

  /** Owned = a free item, or one granted by an unlock. An unknown id is never owned. */
  owns(id) { const e = entryOf(id); return !!e && (e.free || this.granted.has(id)); }
  /** Records that an item is now owned. [source] is for the future ('ad', 'purchase', 'stub'); it is not stored. */
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
   * order). Several items of the same type are allowed; a hand is single (tapping the worn hand keeps it: the hand is always there)
   * and so is the skin tone (a new tone replaces the old one). Returns {ok, on} (ok=false: locked/unknown/stack full, nothing changed).
   */
  toggle(id) {
    const e = entryOf(id);
    if (!e || !this.owns(id)) return { ok: false, on: this.isEquipped(id) };
    if (e.layer === 'base') {
      if (this.baseId !== id) {
        this.base = id; this.#write(BASE_KEY, id);
        const c = e.tint ? this.cat?.base : null;           // the hand colour belongs to the category: a tinted hand takes it over
        this.baseColor = c?.c || null; this.baseColor2 = c?.c ? c.d || null : null;
        this.#write(BASE_COLOR_KEY, this.baseColor || ''); this.#write(BASE_COLOR2_KEY, this.baseColor2 || '');
      }
      return { ok: true, on: true };
    }
    if (this.isEquipped(id)) return { ok: this.remove(id), on: false };
    if (e.layer === 'tone') this.stack = this.stack.filter(s => entryOf(s.id)?.layer !== 'tone');
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
    if (!e || !e.tint) return false;
    const c = color === null ? null : cleanColor(color);
    if (color !== null && !c) return false;
    if (e.layer === 'base') { if (this.baseId !== id) return false; this.baseColor = c; this.baseColor2 = null; this.#write(BASE_COLOR_KEY, c || ''); this.#write(BASE_COLOR2_KEY, ''); return true; }
    const s = this.stack.find(x => x.id === id);
    if (!s) return false;
    s.color = c; setOpt(s, 'color2', null);
    this.#saveStack();
    return true;
  }

  /** Which categories have a colour picker (those with at least one colourable item). */
  colorable(layer) { return COLOR_LAYERS.includes(layer); }
  /** The category's current colour settings {c, d, k}: what was picked, else null fields. */
  categoryStyle(layer) { const c = this.cat?.[layer]; return { c: c?.c || null, d: c?.d || null, k: c?.k || null }; }
  /**
   * ONE colour for a whole category (nail polish, skin tone, tattoos, effects, the hand): [c] = #rrggbb, [d] = an optional second
   * #rrggbb for a two-stop gradient (only nails / effects / tattoos / the hand). c = null puts the original colours back. Applies to
   * everything worn in that category and to anything worn later. Returns false for a category without a picker or a bad colour.
   */
  setCategoryColor(layer, c, d = null) {
    if (!COLOR_LAYERS.includes(layer)) return false;
    const c1 = c === null ? null : cleanColor(c), c2 = d === null || d === undefined ? null : cleanColor(d);
    if (c !== null && !c1) return false;
    if (d !== null && d !== undefined && !c2) return false;
    if (!this.cat) this.cat = {};
    const keep = this.cat[layer] || {};
    this.cat[layer] = { c: c1, d: c1 && GRADIENT_LAYERS.includes(layer) ? c2 : null, k: keep.k || null };
    for (const e of this.stack) {
      const x = entryOf(e.id);
      if (x?.layer === layer && x.tint) { e.color = c1; setOpt(e, 'color2', this.cat[layer].d); }
    }
    if (layer === 'base' && entryOf(this.baseId)?.tint) {
      this.baseColor = c1; this.baseColor2 = this.cat.base.d;
      this.#write(BASE_COLOR_KEY, c1 || ''); this.#write(BASE_COLOR2_KEY, this.baseColor2 || '');
    }
    this.#saveCat(); this.#saveStack();
    return true;
  }
  /** Effect intensity 1-10 for every worn effect and every effect worn later (inside the particle caps, see scaleEmitters). null = default. */
  setIntensity(k) {
    const kk = k === null ? null : cleanIntensity(k);
    if (k !== null && !kk) return false;
    if (!this.cat) this.cat = {};
    this.cat.effect = { ...(this.cat.effect || { c: null, d: null }), k: kk };
    for (const e of this.stack) if (entryOf(e.id)?.layer === 'effect') setOpt(e, 'k', kk);
    this.#saveCat(); this.#saveStack();
    return true;
  }
  colorOf(id) {
    const e = entryOf(id);
    if (!e || !e.tint) return null;
    if (e.layer === 'base') return this.baseId === id && this.baseColor ? this.baseColor : e.tint.default;
    return this.stack.find(x => x.id === id)?.color || e.tint.default;
  }

  /** What the picture recipe needs: {base, baseColor, stack}. */
  loadout() { return { base: this.baseId, baseColor: this.baseColor, baseColor2: this.baseColor2, stack: this.stack.map(s => ({ ...s })) }; }
  /** The loadout with one item tapped on top (for the Store cards), without changing anything; already worn: unchanged. */
  loadoutWith(id) {
    const e = entryOf(id), out = this.loadout();
    if (!e) return out;
    if (e.layer === 'base') { out.base = id; out.baseColor = null; out.baseColor2 = null; }
    else if (!out.stack.some(s => s.id === id)) {
      if (e.layer === 'tone') out.stack = out.stack.filter(s => entryOf(s.id)?.layer !== 'tone');
      out.stack.push({ id, color: null });
    }
    return out;
  }
}

/** Sets an optional entry field, or removes it when [v] is empty (entries only carry what is set). */
function setOpt(e, key, v) { if (v) e[key] = v; else delete e[key]; }

/** A saved category-colour map, cleaned: only known categories, plain #rrggbb colours, a gradient stop only where one makes sense, a 1-10 intensity. */
function cleanCat(raw) {
  const out = {};
  for (const l of COLOR_LAYERS) {
    const r = raw[l];
    if (!r || typeof r !== 'object') continue;
    const c = cleanColor(r.c);
    out[l] = { c, d: c && GRADIENT_LAYERS.includes(l) ? cleanColor(r.d) : null, k: l === 'effect' ? cleanIntensity(r.k) : null };
  }
  return out;
}
