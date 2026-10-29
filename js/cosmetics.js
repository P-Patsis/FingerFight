// Layered cosmetics (see COSMETICS.md): a catalogue of items (base hands from assets/skins, everything else from assets/items),
// and the one function that turns an equipped loadout into what the rig draws.
//   base hand  - a whole hand in the 16-part skin format (js/skins.js); a premade `whole` hand is one finished piece
//   tone       - a colour map applied to the base hand's colours (only where the base uses those colours)
//   tattoo / nails / ring / glove - shapes on the named parts, drawn over the base in z-order, freely stackable
import { parseShapes, PART_NAMES } from './puppet.js';
import { LAYERS, LAYER_Z, ITEM_ID, parseMeta } from './layers.js';
import { loadSkins, skinIds, getSkin, skinIdOf, hasSkin } from './skins.js';

const BASE = 'assets/items/';
const COLOR = /^#[0-9a-fA-F]{3,8}$/;

/** Checks a layer item's JSON (not a base hand: those are skins) and returns the clean item; throws an Error that says what is wrong. */
export function parseItem(json) {
  if (!json || typeof json !== 'object') throw new Error('item: not an object');
  if (json.format !== 1) throw new Error('item: unknown format ' + json.format);
  if (typeof json.id !== 'string' || !ITEM_ID.test(json.id)) throw new Error('item: id must be 1-12 lower-case letters');
  if (!LAYERS.includes(json.layer) || json.layer === 'base') throw new Error(json.id + ': layer must be one of ' + LAYERS.filter(l => l !== 'base').join(', '));
  const name = typeof json.name === 'string' && json.name.trim() ? json.name.trim().slice(0, 24) : json.id;
  const meta = parseMeta(json, json.layer);
  const item = { id: json.id, name, author: typeof json.author === 'string' ? json.author.slice(0, 40) : '', kind: 'layer', ...meta, parts: {}, recolor: null };
  if (json.layer === 'tone') {
    const r = json.recolor;
    if (!r || typeof r !== 'object' || !Object.keys(r).length || Object.keys(r).length > 24) throw new Error(json.id + ': a tone needs a "recolor" map of 1-24 colours');
    item.recolor = {};
    for (const [from, to] of Object.entries(r)) {
      if (!COLOR.test(from) || typeof to !== 'string' || !COLOR.test(to)) throw new Error(json.id + ': recolor entries must be #hex to #hex');
      item.recolor[from.toLowerCase()] = to;
    }
    return item;
  }
  const parts = json.parts;
  if (!parts || typeof parts !== 'object' || !Object.keys(parts).length) throw new Error(json.id + ': needs "parts" (shapes per named part)');
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

const entryOfSkin = s => ({ id: s.id, name: s.name, kind: 'base', layer: 'base', category: s.category, free: s.free, unlock: s.unlock, whole: s.whole, z: s.z, particles: s.particles });
const entryOfItem = it => ({ id: it.id, name: it.name, kind: 'layer', layer: it.layer, category: it.category, free: it.free, unlock: it.unlock, whole: false, z: it.z, particles: it.particles });

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

// ---- loadouts ----------------------------------------------------------------------------------------------------------

/** The layers a loadout may carry besides the base hand (the wire format `cos` and the saved equipment use these keys). */
export const COS_LAYERS = LAYERS.filter(l => l !== 'base');

/** Keeps only well-formed {layer: id} entries (no base): used for received messages and saved values. */
export function cleanCos(c) {
  const out = {};
  if (c && typeof c === 'object') for (const l of COS_LAYERS) if (typeof c[l] === 'string' && ITEM_ID.test(c[l])) out[l] = c[l];
  return out;
}

const toneCache = new Map();
function tinted(skin, tone) {
  const key = skin.id + '/' + tone.id;
  if (toneCache.has(key)) return toneCache.get(key);
  const map = c => (typeof c === 'string' ? tone.recolor[c.toLowerCase()] || c : c);
  const out = { ...skin, parts: {} };
  for (const [name, def] of Object.entries(skin.parts)) out.parts[name] = { ...def, shapes: def.shapes.map(s => ({ ...s, fill: map(s.fill), stroke: map(s.stroke) })) };
  toneCache.set(key, out);
  return out;
}

/**
 * The picture recipe for a loadout: {skin, layers, emitters}.
 *  - skin: the base hand (an unknown id gives the default hand), recoloured by the tone unless it is a premade whole hand
 *  - layers: the equipped tattoo / nails / ring / glove items, sorted by z (ties: layer order), so ANY combination is drawn,
 *    for example a ring under a glove or on top of one, depending only on z
 *  - emitters: the particle effects of the base hand and every equipped item
 * Unknown ids are ignored (another phone may have items this one lacks); nothing here can throw on bad input.
 */
export function resolveLoadout(baseId, cos) {
  const baseSkin = getSkin(skinIdOf(baseId));
  const c = cleanCos(cos);
  const layers = [];
  let tone = null;
  for (const l of COS_LAYERS) {
    const it = c[l] ? items.get(c[l]) : null;
    if (!it || it.layer !== l) continue;
    if (l === 'tone') tone = it; else layers.push(it);
  }
  layers.sort((a, b) => a.z - b.z || LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer));
  const skin = tone && !baseSkin.whole ? tinted(baseSkin, tone) : baseSkin;
  const emitters = [...baseSkin.particles, ...[tone, ...layers].filter(Boolean).flatMap(it => it.particles)];
  return { skin, layers, emitters };
}

export { LAYERS, LAYER_Z };
