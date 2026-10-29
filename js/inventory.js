// The player's cosmetics: which items are owned and which are equipped. Local only (localStorage, every access guarded).
//   ff-owned  JSON list of item ids granted by an unlock (free items are owned without being listed)
//   ff-cos    JSON {tone, tattoo, nails, ring, glove: id}  the equipped layer items
//   ff-puppet the equipped BASE hand (the key the puppet skin picker has always used)
// Nothing here talks to a network. Ownership is a plain flag on this phone, which is fine for a friendly game; real purchases will
// need a server-side receipt check (see js/unlock.js, where that boundary is marked).
import { entryOf, cleanCos, catalogReady, COS_LAYERS } from './cosmetics.js';
import { skinIdOf } from './skins.js';

export const OWNED_KEY = 'ff-owned', COS_KEY = 'ff-cos', BASE_KEY = 'ff-puppet';

const memoryStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; };

export class Inventory {
  /** [storage]: localStorage-like ({getItem, setItem}); anything that throws (private mode, blocked storage) falls back to memory. */
  constructor(storage) {
    this.storage = storage || memoryStore();
    this.granted = new Set();
    this.cos = {};
    this.base = null;
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
    this.cos = cleanCos(this.#json(COS_KEY));
    this.#sanitize();
  }
  /** An equipped item that no longer exists or is not owned is dropped (a removed item, a cleared grant, hand-edited storage). */
  #sanitize() {
    if (!catalogReady()) return;                       // nothing to judge against yet: load() runs again once the catalogue is in
    for (const l of COS_LAYERS) {
      const e = this.cos[l] && entryOf(this.cos[l]);
      if (this.cos[l] && !(e && e.layer === l && this.owns(this.cos[l]))) delete this.cos[l];
    }
  }

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
  /** Equips an OWNED item in its layer slot, replacing what was there. Returns false (and changes nothing) for a locked or unknown item. */
  equip(id) {
    const e = entryOf(id);
    if (!e || !this.owns(id)) return false;
    if (e.layer === 'base') { this.base = id; this.#write(BASE_KEY, id); return true; }
    this.cos[e.layer] = id;
    this.#write(COS_KEY, JSON.stringify(this.cos));
    return true;
  }
  /** Takes an item off by layer. The base hand cannot be removed (the hand is always there): it goes back to the default. */
  unequip(layer) {
    if (layer === 'base') { this.base = null; this.#write(BASE_KEY, 'cartoon'); return true; }
    if (!COS_LAYERS.includes(layer) || !this.cos[layer]) return false;
    delete this.cos[layer];
    this.#write(COS_KEY, JSON.stringify(this.cos));
    return true;
  }
  isEquipped(id) { const e = entryOf(id); return !!e && (e.layer === 'base' ? this.baseId === id : this.cos[e.layer] === id); }
  /** What the picture recipe needs: {base, cos}. */
  loadout() { return { base: this.baseId, cos: { ...this.cos } }; }
  /** The loadout with one item swapped in (for the Store preview), without changing anything. */
  loadoutWith(id) {
    const e = entryOf(id), out = this.loadout();
    if (e) { if (e.layer === 'base') out.base = id; else out.cos[e.layer] = id; }
    return out;
  }
}
