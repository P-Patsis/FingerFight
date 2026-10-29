// The layered cosmetics vocabulary (see COSMETICS.md): which layers exist, in what order they are drawn, and the metadata
// every cosmetic item carries. Pure data and checks: no canvas, no DOM.
import { parseParticles } from './particles.js';

/** The layer types. One item per layer can be equipped; a hand is built bottom to top in this order. */
export const LAYERS = Object.freeze(['base', 'tone', 'tattoo', 'nails', 'ring', 'glove']);
/** Default z-order. Layers are drawn by z, lowest first, so a glove (50) covers rings (40) and nails (30). Items may set their own `z`. */
export const LAYER_Z = Object.freeze({ base: 0, tone: 10, tattoo: 20, nails: 30, ring: 40, glove: 50 });
export const LAYER_LABELS = Object.freeze({ base: 'Hand', tone: 'Skin tone', tattoo: 'Tattoo / scar', nails: 'Nail polish', ring: 'Ring', glove: 'Glove' });
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
  const z = json.z === undefined ? LAYER_Z[layer] : json.z;
  if (!(Number.isFinite(z) && z >= 0 && z <= 100)) throw new Error(json.id + ': z must be 0-100');
  return { layer, category, free, unlock: { method, price }, whole, z, particles: parseParticles(json.particles) };
}
