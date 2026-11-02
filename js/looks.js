// Saved looks: the player's whole getup (hand + its colour + worn items in order with colours and intensity + category colours + skeleton style and
// colour) kept under a name, on this phone only.
//   ff-looks  JSON [{id, name, base, bc?, lay, cat?, sk?, ss?}]   at most MAX_LOOKS
//   ff-look   the id of the look applied last (the row marks it while the getup still matches)
// Everything read back is validated again (storage can be edited by hand): ids, names, colours and item lists are cleaned the same way the network cleans them.
import { cleanStack, stackToWire } from './cosmetics.js';
import { cleanColor, cleanIntensity, COLOR_LAYERS, cleanSkelStyle } from './layers.js';

export const LOOKS_KEY = 'ff-looks', LOOK_KEY = 'ff-look', MAX_LOOKS = 12, MAX_NAME = 20;

/** A name as plain text: no markup characters or control characters, trimmed, at most MAX_NAME characters. */
export const cleanName = n => String(n ?? '').replace(/[<>&"'`\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

function cleanCatMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const l of COLOR_LAYERS) {
    if (l === 'base') continue;
    const r = raw[l];
    if (r && typeof r === 'object') out[l] = { c: cleanColor(r.c), k: l === 'effect' ? cleanIntensity(r.k) : null };
  }
  return out;
}

/** One saved look, cleaned, or null when it is not a look. */
export function cleanLook(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.id !== 'string' || !/^[a-z0-9]{1,12}$/.test(raw.id)) return null;
  const name = cleanName(raw.name);
  if (!name || typeof raw.base !== 'string' || !/^[a-z]{1,12}$/.test(raw.base)) return null;
  const out = { id: raw.id, name, base: raw.base, lay: stackToWire(cleanStack(Array.isArray(raw.lay) ? raw.lay : [])), cat: cleanCatMap(raw.cat) };
  const bc = cleanColor(raw.bc), sk = cleanColor(raw.sk), ss = cleanSkelStyle(raw.ss);
  if (bc) out.bc = bc;
  if (sk) out.sk = sk;
  if (ss) out.ss = ss;
  return out;
}

/** Whether two looks / getups are the same outfit (name and id do not matter). */
export const sameGetup = (a, b) => {
  const k = x => { const c = cleanLook({ id: 'x', name: 'x', ...x }); return c ? JSON.stringify([c.base, c.bc || null, c.lay, c.cat, c.sk || null, c.ss && c.ss !== 'classic' ? c.ss : null]) : ''; };
  return k(a) !== '' && k(a) === k(b);
};

export class Looks {
  /** [storage]: {getItem, setItem}; anything that throws is ignored (the looks then live in memory only). */
  constructor(storage) { this.storage = storage; this.list = []; this.appliedId = null; this.load(); }
  #read(k) { try { return this.storage.getItem(k); } catch { return null; } }
  #write(k, v) { try { this.storage.setItem(k, v); } catch { /* memory only */ } }
  load() {
    let raw = null;
    try { raw = JSON.parse(this.#read(LOOKS_KEY)); } catch { raw = null; }
    const seen = new Set();
    this.list = [];
    for (const r of Array.isArray(raw) ? raw.slice(0, 100) : []) { const l = cleanLook(r); if (l && !seen.has(l.id) && this.list.length < MAX_LOOKS) { seen.add(l.id); this.list.push(l); } }
    const a = this.#read(LOOK_KEY);
    this.appliedId = typeof a === 'string' && this.list.some(l => l.id === a) ? a : null;
  }
  #save() { this.#write(LOOKS_KEY, JSON.stringify(this.list)); this.#write(LOOK_KEY, this.appliedId || ''); }
  get full() { return this.list.length >= MAX_LOOKS; }
  /** Saves [getup] ({base, bc, lay, cat, sk, ss}) under [name]; returns the new look, or null when the list is full / the getup is unusable. */
  add(name, getup) {
    if (this.full) return null;
    const id = 'l' + Date.now().toString(36).slice(-7) + Math.floor(Math.random() * 1296).toString(36);
    const look = cleanLook({ ...getup, id, name: cleanName(name) || 'Look ' + (this.list.length + 1) });
    if (!look) return null;
    this.list.push(look); this.appliedId = id; this.#save();
    return look;
  }
  remove(id) {
    const n = this.list.length;
    this.list = this.list.filter(l => l.id !== id);
    if (this.appliedId === id) this.appliedId = null;
    if (this.list.length === n) return false;
    this.#save();
    return true;
  }
  get(id) { return this.list.find(l => l.id === id) || null; }
  /** Renames a look (the name is cleaned the same way as when saving; an empty result changes nothing). */
  rename(id, name) {
    const l = this.get(id), n = cleanName(name);
    if (!l || !n) return false;
    l.name = n; this.#save();
    return true;
  }
  /** Overwrites a look's outfit with [getup], keeping its id, its place in the row and its name. */
  update(id, getup) {
    const i = this.list.findIndex(l => l.id === id);
    if (i < 0) return false;
    const look = cleanLook({ ...getup, id, name: this.list[i].name });
    if (!look) return false;
    this.list[i] = look; this.appliedId = id; this.#save();
    return true;
  }
  markApplied(id) { this.appliedId = this.get(id) ? id : null; this.#save(); }
}
