import { cleanFit, defaultFit, FIT_DEFAULT } from './fit.js';
import { cleanElement } from './special-skins.js';
// Layered cosmetics (see COSMETICS.md): a catalogue of items (base hands from assets/skins, everything else from assets/items),
// and the one function that turns what the player wears into what the rig draws.
//   base hand  - a whole hand in the 16-part skin format (js/skins.js); a premade `whole` hand is one finished piece
//   tattoo / nails / ring / glove - shapes on the named parts, drawn over the base in the ORDER THEY WERE EQUIPPED (the stack)
//   effect     - a particle effect (no shapes)
// Colour pickers: an item with a `tint` is drawn in the colour the player picked (see layers.js). Only plain #rrggbb is ever kept.
import { parseShapes, PART_NAMES, parseSkin, parseExtend, parseDynamic } from './puppet.js';
import { GENERATED, paramsKey, cleanGc, cleanSd, GC_DEFAULT, newSeed, SD_MAX } from './generated.js';
import { LAYERS, MAX_STACK, ITEM_ID, parseMeta, roleColor, cleanColor, cleanIntensity, INTENSITY_DEFAULT, shiftColor, dominantHue } from './layers.js';
import { loadSkins, skinIds, getSkin, skinIdOf, hasSkin } from './skins.js';

const BASE = 'assets/items/';

/** Checks a layer item's JSON (not a base hand: those are skins) and returns the clean item; throws an Error that says what is wrong. */
export function parseItem(json) {
  if (!json || typeof json !== 'object') throw new Error('item: not an object');
  if (json.format !== 1) throw new Error('item: unknown format ' + json.format);
  if (typeof json.id !== 'string' || !ITEM_ID.test(json.id)) throw new Error('item: id must be 1-12 lower-case letters');
  if (!LAYERS.includes(json.layer) || json.layer === 'base') throw new Error(json.id + ': layer must be one of ' + LAYERS.filter(l => l !== 'base').join(', '));
  const name = typeof json.name === 'string' && json.name.trim() ? json.name.trim().slice(0, 24) : json.id;
  const meta = parseMeta(json, json.layer);
  if (json.side !== undefined && !['back', 'palm', 'both'].includes(json.side)) throw new Error(json.id + ': side must be back, palm or both');
  const item = { id: json.id, name, author: typeof json.author === 'string' ? json.author.slice(0, 40) : '', kind: 'layer', ...meta, side: json.side || (json.layer === 'nails' ? 'back' : 'both'), parts: {} };
  if (json.layer === 'effect') {                     // an effect is only particles
    if (!item.particles.length) throw new Error(json.id + ': an effect needs "particles"');
    return item;
  }
  if (json.nailAnchor !== undefined && !(Number.isFinite(json.nailAnchor) && Math.abs(json.nailAnchor) <= 100)) throw new Error(json.id + ': nailAnchor out of range');
  item.nailAnchor = json.nailAnchor;
  if (json.fit !== undefined && (!Array.isArray(json.fit) || json.fit.length > 12 || json.fit.some(p => !p || !PART_NAMES.includes(p.part) || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 500 || Math.abs(p.y) > 500))) throw new Error(json.id + ': invalid fitting points');
  item.fit = json.fit || [];
  item.dynamic = parseDynamic(json.dynamic, json.id);   // nails / claws that stretch out with the finger and retract when it curls
  item.extend = parseExtend(json.extend, json.id);   // fingers drawn past the tip, in the base hand's own shapes (see puppet.js)
  const parts = json.parts ?? (item.extend ? {} : undefined);
  if (!parts || typeof parts !== 'object' || (!Object.keys(parts).length && !item.extend)) throw new Error(json.id + ': needs "parts" (shapes per named part) or an "extend"');
  for (const [name_, shapes] of Object.entries(parts)) {
    if (!PART_NAMES.includes(name_)) throw new Error(json.id + ': unknown part ' + name_);
    item.parts[name_] = parseShapes(shapes, json.id + ' ' + name_);
  }
  return item;
}

// ---- the catalogue -----------------------------------------------------------------------------------------------------

const items = new Map();          // layer item id -> parsed item
let itemOrder = [];
let loadedItems = null;

/**
 * Loads assets/items/manifest.json ({"items": [ids]}) and every item it lists. An item that fails is skipped with a console
 * warning (the others still load); an id already used by a base hand is skipped too. [fetchFn] and [base] are injectable for tests.
 */
export function loadItems(fetchFn = globalThis.fetch, base = BASE) {
  if (loadedItems) return loadedItems;
  loadedItems = (async () => {
    const get = async name => { const r = await fetchFn(base + name); if (!r.ok) throw new Error(name + ': HTTP ' + r.status); return r.json(); };
    let manifest;
    try { manifest = await get('manifest.json'); } catch (e) { console.warn('items: no manifest (' + (e.message || e) + ')'); loadedItems = null; return []; }
    const ids = Array.isArray(manifest?.items) ? manifest.items.filter(x => typeof x === 'string' && ITEM_ID.test(x)).slice(0, 200) : [];
    const results = await Promise.all(ids.map(async id => {
      try {
        const it = parseItem(await get(id + '.json'));
        if (it.id !== id) throw new Error('file ' + id + '.json declares id ' + it.id);
        if (hasSkin(it.id)) throw new Error('id ' + it.id + ' is already a base hand');
        return it;
      } catch (e) { console.warn('items: skipped ' + id + ' (' + (e.message || e) + ')'); return null; }
    }));
    itemOrder = [];
    for (const it of results) if (it && !items.has(it.id)) { items.set(it.id, it); itemOrder.push(it.id); }
    return itemOrder.slice();
  })();
  return loadedItems;
}

/** Loads the base hands and the layer items. Resolves to the number of catalogue entries. */
export async function loadCatalog(fetchFn = globalThis.fetch) {
  await Promise.all([loadSkins(fetchFn), loadItems(fetchFn)]);
  return catalog().length;
}

/** Test helper: forget the layer items (skins have their own resetSkins). */
export function resetItems() { items.clear(); itemOrder = []; loadedItems = null; }

const entryOfSkin = s => ({ id: s.id, name: s.name, kind: 'base', layer: 'base', category: s.category, free: s.free, unlock: s.unlock, whole: s.whole, particles: s.particles, tint: s.tint });
const entryOfItem = it => ({ id: it.id, name: it.name, kind: 'layer', layer: it.layer, category: it.category, free: it.free, unlock: it.unlock, whole: false, particles: it.particles, tint: it.tint });

/** Every item in the store, as plain entries: base hands first (manifest order), then layer items in the layer order. */
export function catalog() {
  const out = skinIds().map(id => entryOfSkin(getSkin(id)));
  for (const L of LAYERS) for (const id of itemOrder) if (items.get(id).layer === L) out.push(entryOfItem(items.get(id)));
  return out;
}
/** True once the base hands and the layer items are both loaded (before that, saved equipment is kept as is, not judged). */
export const catalogReady = () => skinIds().length > 0 && itemOrder.length > 0;
export const entryOf = id => (hasSkin(id) ? entryOfSkin(getSkin(id)) : items.has(id) ? entryOfItem(items.get(id)) : null);

/** Filters catalogue entries: {category, layer}, each 'all' or missing = no filter. Pure. */
export function filterCatalog(list, { category = 'all', layer = 'all' } = {}) {
  return list.filter(e => (category === 'all' || e.category === category) && (layer === 'all' || e.layer === layer));
}

// ---- what is worn: an ordered stack -----------------------------------------------------------------------------------------
// The stack is a list of {id, color} (color = a picked #rrggbb, or null for the item's own colours). Index 0 is drawn first (just over
// the base hand), the LAST entry is drawn on top: the order the player equipped things in, changeable by the reorder list.

/** Keeps only well-formed entries: known-shaped ids, plain colours, no repeats, at most MAX_STACK. Accepts {id, color} or {id, c}. */
export function cleanStack(list) {
  const out = [], seen = new Set();
  if (!Array.isArray(list)) return out;
  for (const e of list) {
    const id = typeof e === 'string' ? e : e && typeof e === 'object' ? e.id : null;
    if (typeof id !== 'string' || !ITEM_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    const o = e && typeof e === 'object' ? e : {};
    const color = cleanColor(o.color ?? o.c);
    const entry = { id, color }, k = cleanIntensity(o.k);
    if (k) entry.k = k;                                // optional fields exist only when set (a second gradient stop `d` from an older phone is ignored)
    out.push(entry);
    if (out.length >= MAX_STACK) break;
  }
  return out;
}
/** The wire form of a stack: [{id, c?, k?}]: ids, one plain #rrggbb colour and a 1-10 effect intensity only. */
export const stackToWire = stack => cleanStack(stack).map(e => {
  const o = { id: e.id };
  if (e.color) o.c = e.color;
  if (e.k) o.k = e.k;
  return o;
});
export const stackFromWire = lay => cleanStack(lay);

/** The items that used to be one file per colour are now one item + a colour: old id -> [new id, colour]. Used to migrate saved
 *  equipment and to read pictures from a phone that still sends the old ids. */
export const LEGACY_ITEMS = Object.freeze({
  pale: ['skintone', '#fbe3cf'], tan: ['skintone', '#e3ad7c'], brown: ['skintone', '#b97a4b'], deep: ['skintone', '#7a4a2b'],
  orc: ['skintone', '#86b35a'], frost: ['skintone', '#bfe3f5'],
  blades: ['longclaws', null],                       // the blade-fingers item became Long claws
  rednails: ['nailpolish', '#dc2626'], blacknails: ['nailpolish', '#111827'], neonnails: ['nailpolish', '#22d3ee'],
});
/** The first versions kept one item per layer: {tone, tattoo, nails, ring, glove} -> a stack in that order (the old default z-order). */
export function legacyStack(cos) {
  const out = [];
  if (cos && typeof cos === 'object' && !Array.isArray(cos)) {
    for (const l of ['tone', 'tattoo', 'nails', 'ring', 'glove']) {
      const id = cos[l];
      if (typeof id !== 'string') continue;
      const m = LEGACY_ITEMS[id];
      out.push(m ? { id: m[0], color: m[1] } : { id, color: null });
    }
  }
  return cleanStack(out);
}
/** Any of: a stack array, an old {layer: id} object, nothing -> a clean stack. */
export const stackOf = x => (Array.isArray(x) ? cleanStack(x.map(e => (e && LEGACY_ITEMS[e.id || e] ? { id: LEGACY_ITEMS[e.id || e][0], color: LEGACY_ITEMS[e.id || e][1] } : e))) : legacyStack(x));

// ---- colours applied ---------------------------------------------------------------------------------------------------------

const recolorCache = new WeakMap();
function recolor(kind, owner, key2, build) {
  // Generated skins share an id, but each detail/seed has different geometry.
  let cache = recolorCache.get(owner);
  if (!cache) { cache = new Map(); recolorCache.set(owner, cache); }
  const key = kind + '/' + key2;
  if (cache.has(key)) return cache.get(key);
  const out = build();
  if (cache.size > 300) cache.clear();
  cache.set(key, out);
  return out;
}
const mapper = (tint, picked) => c => {
  const role = typeof c === 'string' ? tint.map[c.toLowerCase()] : null;
  return role ? roleColor(picked, role) : c;
};
const mapShapes = (shapes, f) => shapes.map(s => ({ ...s, fill: f(s.fill), stroke: f(s.stroke) }));
const mapParticles = (list, f) => list.map(p => ({ ...p, color: f(p.color) }));
const mapWeb = (w, f) => (w ? { ...w, fill: f(w.fill), stroke: f(w.stroke) } : w);
const mapSand = (s, f) => (s ? { ...s, color: f(s.color), color2: f(s.color2) } : s);

/** A base hand (or a skin) with its tint applied for [picked]: the colours named in the tint map change, nothing else. */
function tintedSkin(skin, tint, picked) {
  return recolor('s', skin, picked + tint.default + Object.keys(tint.map).join(), () => {
    const f = mapper(tint, picked), out = { ...skin, parts: {} };
    for (const [name, def] of Object.entries(skin.parts)) out.parts[name] = { ...def, shapes: mapShapes(def.shapes, f) };
    out.overlays = skin.overlays.map(o => ({ ...o, shapes: mapShapes(o.shapes, f) }));
    out.particles = mapParticles(skin.particles, f);
    out.web = mapWeb(skin.web, f); out.sand = mapSand(skin.sand, f);
    return out;
  });
}
/** A hand without a tint, moved to the picked colour by hue-shift (see shiftColor): every colour of its shapes and particles, the design intact. */
function shiftedSkin(skin, picked) {
  return recolor('h', skin, picked, () => {
    const w = {};
    const note = c => { if (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) w[c.toLowerCase()] = (w[c.toLowerCase()] || 0) + 1; };
    for (const def of Object.values(skin.parts)) for (const s of def.shapes) { note(s.fill); note(s.stroke); }
    for (const o of skin.overlays) for (const s of o.shapes) { note(s.fill); note(s.stroke); }
    if (skin.web) { note(skin.web.fill); note(skin.web.stroke); }
    const ref = dominantHue(w), f = c => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? shiftColor(c.toLowerCase(), picked, ref) : c);
    const out = { ...skin, parts: {} };
    for (const [name, def] of Object.entries(skin.parts)) out.parts[name] = { ...def, shapes: mapShapes(def.shapes, f) };
    out.overlays = skin.overlays.map(o => ({ ...o, shapes: mapShapes(o.shapes, f) }));
    out.particles = mapParticles(skin.particles, f);
    out.web = mapWeb(skin.web, f); out.sand = mapSand(skin.sand, f);
    return out;
  });
}
function tintedItem(item, picked) {
  return recolor('i', item, picked, () => {
    const f = mapper(item.tint, picked), out = { ...item, parts: {} };
    for (const [name, shapes] of Object.entries(item.parts)) out.parts[name] = mapShapes(shapes, f);
    out.particles = mapParticles(item.particles, f);
    return out;
  });
}
/** Effect intensity [k] (1-10, 5 = as authored): scales each emitter's rate / burst / size, always inside the per-emitter limits (rate 40, burst 30);
 *  the particle system's own caps (90 particles, 6 emitters) then bound the total, so intensity can never exceed them. */
export function scaleEmitters(list, k) {
  const kk = cleanIntensity(k);
  if (!kk || kk === INTENSITY_DEFAULT) return list;
  const f = kk / INTENSITY_DEFAULT;
  return list.map(e => ({ ...e, rate: e.rate ? Math.min(40, Math.max(0.5, e.rate * f)) : 0, burst: e.burst ? Math.min(30, Math.max(1, Math.round(e.burst * f))) : 0, size: Math.min(1.25, Math.max(0.8, 0.75 + 0.25 * f)) }));
}

/** The colour an entry is drawn in: the picked one if the item has a colour picker, else null. */
export const colorOf = (id, picked) => { const e = entryOf(id); return e && e.tint ? cleanColor(picked) || e.tint.default : null; };

/**
 * The picture recipe for what is worn: {skin, layers, emitters}.
 *  - skin: the base hand ([baseId]; an unknown id gives the default hand), in [baseColor] if that hand supports recolouring
 *  - layers: the shape items of the [stack] in stack order (first = just over the hand, last = on top). ANY combination and any number
 *    of the same type is drawn; nothing is blocked
 *  - emitters: the particle effects of the hand, the shape items and the effect items
 * [stack] may also be an old {layer: id} object (a phone that still sends that). Unknown ids are ignored (another phone may have items
 * this one lacks); nothing here can throw on bad input.
 */
/** The numbers for generated hands (`gc`, `sd`) and fire intensity (`fi`) on THIS phone; a received picture passes its own via [extra]. */
export const cleanNl = n => Number.isInteger(n) && n >= 0 && n <= 10 ? n : null;
export const FIRE_DEFAULT = 7;
export const gen = { gc: GC_DEFAULT, sd: 1, fi: FIRE_DEFAULT, nl: 5, el: 'water', fit: {...FIT_DEFAULT} };
export function setGen(o = {}) {
  const fit=cleanFit(o.fit);if(fit)gen.fit=fit;
  const gc = cleanGc(o.gc), sd = cleanSd(o.sd), fi = cleanIntensity(o.fi), nl = cleanNl(o.nl), el = cleanElement(o.el);
  if (gc) gen.gc = gc;
  if (sd !== null) gen.sd = sd;
  if (fi) gen.fi = fi;
  if (nl !== null) gen.nl = nl;
  if (el) gen.el = el;
}
export function rerollPainting(random = Math.random) {
  const seed = newSeed(random);
  gen.sd = seed === gen.sd ? (seed + 1) % (SD_MAX + 1) : seed;
  return gen.sd;
}
/** Parameters carried with pictures: generated geometry (`gc`/`sd`) or fire intensity (`fi`). */
function baseWire(id, p) {
  if (id === 'lowpoly') return { gc: cleanGc(p.gc) || GC_DEFAULT };
  if (id === 'painting') return { sd: cleanSd(p.sd) ?? 1 };
  if (id === 'elemental') { const el = cleanElement(p.el) || 'water'; return { el, ...(el === 'fire' ? { fi: cleanIntensity(p.fi) || FIRE_DEFAULT } : {}) }; }
  if (['flaming', 'burnbone'].includes(id)) return { fi: cleanIntensity(p.fi) || FIRE_DEFAULT };
  return {};
}
export const genWire = (id, p = gen) => ({ ...baseWire(id, p), ...(!defaultFit(cleanFit(p.fit))?{fit:cleanFit(p.fit)}:{}), ...((cleanNl(p.nl) ?? 5) !== 5 ? { nl: cleanNl(p.nl) } : {}) });
const genCache = new Map();
function generatedSkin(id, p) {
  const key = id + ':' + paramsKey(id, p);
  let s = genCache.get(key);
  if (!s) {
    try { s = parseSkin(GENERATED[id](p)); } catch { s = null; }
    if (genCache.size > 24) genCache.delete(genCache.keys().next().value);
    if (s) genCache.set(key, s);
  }
  return s;
}

export function resolveLoadout(baseId, stack, baseColor = null, extra = null) {
  const sid = skinIdOf(baseId);
  let baseSkin = (GENERATED[sid] && hasSkin(sid) && generatedSkin(sid, { ...gen, ...(extra || {}) })) || getSkin(sid);
  if (baseSkin.id !== sid && GENERATED[sid]) baseSkin = getSkin(sid);
  let bc = cleanColor(baseColor);
  const list = stackOf(stack);
  // an older phone sent the skin colour as a worn "skintone" item: that colour is now the hand's colour
  if (!bc) bc = cleanColor(list.find(e => e.id === 'skintone')?.color);
  if (bc && baseSkin.id !== 'plain') {
    if (baseSkin.tint) { if (bc !== baseSkin.tint.default) baseSkin = tintedSkin(baseSkin, baseSkin.tint, bc); }
    else baseSkin = shiftedSkin(baseSkin, bc);                 // every other hand: a hue-shift, so the design stays
  }
  const fit=cleanFit(extra?extra.fit:gen.fit)||FIT_DEFAULT;
  if(!defaultFit(fit))baseSkin={...baseSkin,fit};
  const nailScale = (cleanNl(extra ? extra.nl : gen.nl) ?? 5) / 5;
  if (sid === 'paw' && nailScale !== 1) baseSkin = { ...baseSkin, nailScale };
  const layers = [];
  const fire = ['flaming', 'burnbone'].includes(sid) || (sid === 'elemental' && (cleanElement(extra ? extra.el : gen.el) || 'water') === 'fire');
  const intensity = cleanIntensity(extra?.fi) || (extra ? FIRE_DEFAULT : gen.fi);
  const emitters = fire ? scaleEmitters(baseSkin.particles, intensity).map(e => ({ ...e, size: 0.4 + intensity * 0.12 })) : [...baseSkin.particles];
  for (const e of list) {
    const it = items.get(e.id);
    if (!it || (it.layer === 'nails' && !nailScale)) continue;
    const picked = it.tint ? e.color || it.tint.default : null;
    const drawn = it.tint && picked !== it.tint.default ? tintedItem(it, picked) : it;
    emitters.push(...(it.layer === 'effect' ? scaleEmitters(drawn.particles, e.k) : drawn.particles));
    if (it.layer !== 'effect') {
      if (it.layer === 'nails') {
        if (!nailScale) continue;
        layers.push(nailScale === 1 ? drawn : { ...drawn, nailScale, extend: drawn.extend ? { ...drawn.extend, len: drawn.extend.len * nailScale } : null });
      } else layers.push(drawn);
    }
  }
  return { skin: baseSkin, layers, emitters, ...(sid==='elemental'?{element:cleanElement(extra?extra.el:gen.el)||'water'}:{}) };
}

export { LAYERS, MAX_STACK };
