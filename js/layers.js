// The layered cosmetics vocabulary (see COSMETICS.md): which layers exist, in what order they are drawn, and the metadata
// every cosmetic item carries. Pure data and checks: no canvas, no DOM.
import { parseParticles } from './particles.js';

/** The item TYPES (used for browsing and for what an item is). They do NOT decide the drawing order: the order the player equipped
 *  things in (the stack, see js/inventory.js) does. Only `base` is special: one hand, always the bottom. `tone` is a colour for the
 *  base hand (one at a time) and `effect` is a particle effect (it draws no shapes); the rest are shapes drawn over the hand. */
export const LAYERS = Object.freeze(['base', 'tattoo', 'nails', 'ring', 'glove', 'effect']);
export const LAYER_LABELS = Object.freeze({ base: 'Hand', skeleton: 'Skeleton', tattoo: 'Tattoo / scar', nails: 'Nail polish', ring: 'Ring', glove: 'Glove', effect: 'Effect' });
export const MAX_STACK = 12;                       // most items worn at once (on top of the base hand)
export const HEX = /^#[0-9a-fA-F]{6}$/;            // the only colour form that is ever stored or sent: plain #rrggbb
export const ROLES = Object.freeze(['main', 'dark', 'mid', 'light']);
/** Browsing tags (pure metadata: nothing in the game depends on them). */
export const CATEGORIES = Object.freeze(['human', 'animal', 'scifi', 'fantasy', 'premade']);
export const CATEGORY_LABELS = Object.freeze({ human: 'Human', animal: 'Animal', scifi: 'Sci-fi', fantasy: 'Fantasy', premade: 'Premade hands' });
/** How a locked item can be unlocked. Only a label for the Store: what happens is decided by js/unlock.js. */
export const UNLOCK_METHODS = Object.freeze(['free', 'ad', 'purchase']);

export const ITEM_ID = /^[a-z]{1,12}$/;

/**
 * The metadata shared by every item (a base-hand skin file and a layer item file): category, whether it is free, how a locked
 * one is unlocked, whether it is a premade whole hand, and its particle effects. Missing fields get safe defaults, so the
 * three older skin files (which have none of these) stay valid: human, free, no effects.
 */
export function parseMeta(json, layer) {
  const category = json.category === undefined ? 'human' : json.category;
  if (!CATEGORIES.includes(category)) throw new Error(json.id + ': category must be one of ' + CATEGORIES.join(', '));
  const free = json.free !== false;
  const u = json.unlock;
  const method = free ? 'free' : (u && u.method) || 'ad';
  if (!UNLOCK_METHODS.includes(method)) throw new Error(json.id + ': unlock.method must be one of ' + UNLOCK_METHODS.join(', '));
  const price = !free && u && typeof u.price === 'string' ? u.price.slice(0, 12) : '';
  const whole = json.whole === true;
  if (whole && layer !== 'base') throw new Error(json.id + ': only a base hand can be a premade whole hand');
  return { layer, category, free, unlock: { method, price }, whole, particles: parseParticles(json.particles), tint: parseTint(json.tint, json.id) };
}

// ---- colour pickers -----------------------------------------------------------------------------------------------------------
// An item that can be recoloured carries a "tint": the colours it is drawn with and what each one is for. The player picks ONE colour
// and every listed colour is derived from it by role: main = the picked colour, dark / mid = darker, light = lighter. Only plain
// #rrggbb values are ever stored or sent; the colour is never code.
//   "tint": { "default": "#dc2626", "map": { "#dc2626": "main", "#7f1d1d": "dark" }, "swatches": ["#dc2626", ...] }

/** Checks a "tint" (missing = not recolourable = null). */
export function parseTint(t, id = 'item') {
  if (t === undefined || t === null) return null;
  if (typeof t !== 'object' || Array.isArray(t)) throw new Error(id + ': tint must be an object');
  if (typeof t.default !== 'string' || !HEX.test(t.default)) throw new Error(id + ': tint.default must be #rrggbb');
  const map = {};
  if (!t.map || typeof t.map !== 'object' || !Object.keys(t.map).length || Object.keys(t.map).length > 8) throw new Error(id + ': tint.map needs 1-8 entries');
  for (const [from, role] of Object.entries(t.map)) {
    if (!/^#[0-9a-fA-F]{3,8}$/.test(from) || !ROLES.includes(role)) throw new Error(id + ': tint.map entries are "#colour": ' + ROLES.join(' | '));
    map[from.toLowerCase()] = role;
  }
  const sw = t.swatches === undefined ? [] : t.swatches;
  if (!Array.isArray(sw) || sw.length > 16 || sw.some(c => typeof c !== 'string' || !HEX.test(c))) throw new Error(id + ': tint.swatches must be up to 16 #rrggbb colours');
  return { default: t.default.toLowerCase(), map, swatches: sw.map(c => c.toLowerCase()) };
}

const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/** The colour for a role, derived from the picked [hex]: main is itself, dark / mid mix towards black, light towards white. */
export function roleColor(hex, role) {
  const c = hexToRgb(hex);
  if (role === 'dark') return rgbToHex(c.map(v => v * 0.45));
  if (role === 'mid') return rgbToHex(c.map(v => v * 0.78));
  if (role === 'light') return rgbToHex(c.map(v => v + (255 - v) * 0.3));
  return hex.toLowerCase();
}
/** The quick colours of the category colour picker: a handful of well-spread hues (45 degrees apart) + white, grey, black, kept to ONE line.
 *  Any other colour comes from the full colour picker. */
/** The skeleton STYLES the player can choose for the skeleton views (drawn by avatars.js `drawBones`; the id travels as `ss`, 1-12 lower-case letters). */
export const SKELETON_STYLES = [['classic', 'Classic'], ['thin', 'Thin'], ['bold', 'Bold'], ['dashed', 'Dashed'], ['glow', 'Glow'], ['joints', 'Joints']];
export const SKELETON_STYLE_IDS = SKELETON_STYLES.map(s => s[0]);
export const DEFAULT_SKELETON_STYLE = 'classic';
/** A known style id, else null (storage and the UI); an unknown id from the network is simply drawn as classic. */
export const cleanSkelStyle = s => (SKELETON_STYLE_IDS.includes(s) ? s : null);

/** The Profile's customise chips: the catalogue layers plus the Skeleton styles (which are not wearable items), Hand first, Skeleton second. */
export const PROFILE_LAYERS = ['base', 'skeleton', 'ring', 'nails', 'tattoo', 'glove', 'effect'];

export const BASIC_PALETTE = Object.freeze(['#e42525', '#e4a825', '#a8e425', '#25e46a', '#25d3e4', '#2552e4', '#7a25e4', '#e425a8', '#ffffff', '#8a8a8a', '#111111']);
/** Every category has ONE colour picker (the Hand's recolours the worn base hand, when that hand supports it). One plain #rrggbb each, no gradients. */
export const COLOR_LAYERS = Object.freeze(['base', 'tattoo', 'nails', 'ring', 'glove', 'effect']);
export const INTENSITY_MIN = 1, INTENSITY_MAX = 10, INTENSITY_DEFAULT = 5;
/** An effect intensity: a whole number 1-10, or null. */
export const cleanIntensity = k => (Number.isInteger(k) && k >= INTENSITY_MIN && k <= INTENSITY_MAX ? k : null);
/** A picked colour, cleaned: lower-case #rrggbb, or null when it is anything else (so nothing but a plain colour is ever kept). */
export const cleanColor = c => (typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : null);
