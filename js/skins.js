// Puppet skins as swappable data: assets/skins/manifest.json lists the skin files, each file is one skin (see SKINS.md).
// Adding a skin = adding a JSON file and its id to the manifest. The registry here only loads, checks and hands them out.
import { parseSkin, PART_NAMES } from './puppet.js';

const BASE = 'assets/skins/';
export const DEFAULT_SKIN_ID = 'cartoon';

// A last-resort skin that is built in code, so the puppet still draws if every skin file failed to load (offline first run
// with a broken cache). It is the same format as the files, so it goes through the same checks.
function fallbackJson() {
  const cap = (w, L) => `M ${-w} 0 L ${-w} ${-L} A ${w} ${w} 0 0 1 ${w} ${-L} L ${w} 0 A ${w} ${w} 0 0 1 ${-w} 0 Z`;
  const look = { fill: '#f6c9a0', stroke: '#9a5b2e', strokeWidth: 2.5 };
  const parts = { palm: { ref: { wrist: [50, 100], index: [20, 38], pinky: [80, 46] },
    shapes: [{ d: 'M 30 106 C 16 94 8 76 8 56 C 8 42 14 33 24 31 L 76 38 C 86 40 90 48 88 60 C 86 78 76 94 70 106 Z', ...look }] } };
  for (const p of PART_NAMES) if (p !== 'palm') parts[p] = { length: 20, shapes: [{ d: cap(6.5, 20), ...look }] };
  return { format: 1, id: 'plain', name: 'Plain', parts };
}

const registry = new Map();       // id -> parsed skin
let order = [];                   // ids in manifest order
let defaultId = DEFAULT_SKIN_ID;
let loaded = null;                // the loading promise (so it runs once)
registry.set('plain', parseSkin(fallbackJson()));

/** The skin with this id; an unknown id (another phone has a skin this one lacks) gives the default skin. */
export function getSkin(id) {
  return registry.get(id) || registry.get(defaultId) || registry.get('plain');
}
/** Ids of the loadable skins, in manifest order (the picker's content). The built-in fallback is never listed. */
export const skinIds = () => (order.length ? order : []);
export const hasSkin = id => order.includes(id);
/** The id to use for a saved or received value: a known skin, else the default. */
export const skinIdOf = id => {
  if (hasSkin(id)) return id;
  if (!order.length) return typeof id === 'string' && /^[a-z]{1,12}$/.test(id) ? id : defaultId;     // nothing loaded yet: keep a well-formed id as it is
  return hasSkin(defaultId) ? defaultId : 'plain';
};

/**
 * Loads the manifest and every skin it lists. A skin that fails (missing file, bad JSON, fails the checks) is skipped
 * with a console warning; the others still load. Safe to call many times. Resolves to the list of loaded ids.
 * [fetchFn] and [base] are injectable for tests.
 */
export function loadSkins(fetchFn = globalThis.fetch, base = BASE) {
  if (loaded) return loaded;
  loaded = (async () => {
    const get = async name => { const r = await fetchFn(base + name); if (!r.ok) throw new Error(name + ': HTTP ' + r.status); return r.json(); };
    let manifest;
    try { manifest = await get('manifest.json'); } catch (e) { console.warn('skins: no manifest (' + (e.message || e) + ')'); loaded = null; return []; }
    const ids = Array.isArray(manifest?.skins) ? manifest.skins.filter(x => typeof x === 'string' && /^[a-z]{1,12}$/.test(x)).slice(0, 40) : [];
    const results = await Promise.all(ids.map(async id => {
      try {
        const skin = parseSkin(await get(id + '.json'));
        if (skin.id !== id) throw new Error('file ' + id + '.json declares id ' + skin.id);
        return skin;
      } catch (e) { console.warn('skins: skipped ' + id + ' (' + (e.message || e) + ')'); return null; }
    }));
    order = [];
    for (const s of results) if (s) { registry.set(s.id, s); order.push(s.id); }
    if (typeof manifest.default === 'string' && order.includes(manifest.default)) defaultId = manifest.default;
    return order.slice();
  })();
  return loaded;
}

/** Test helper: forget everything that was loaded. */
export function resetSkins() { loaded = null; order = []; defaultId = DEFAULT_SKIN_ID; for (const k of [...registry.keys()]) if (k !== 'plain') registry.delete(k); }
