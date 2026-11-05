// Local play statistics: matches, wins, losses and how often each finger count was SHOWN (as the pointer) and GUESSED (as the guesser).
// Stored only on this phone (localStorage, every access guarded; a blocked storage falls back to memory). Nothing here touches the network.
import { MAX_FINGERS } from './logic.js';

export const STATS_KEY = 'ff-stats';
const SLOTS = MAX_FINGERS + 1;                       // counts 0..10
const memoryStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; };
const cnt = v => (Number.isInteger(v) && v >= 0 && v <= 1e9 ? v : 0);
const hist = a => Array.from({ length: SLOTS }, (_, i) => cnt(Array.isArray(a) ? a[i] : 0));

/** The most frequent entry of a histogram: {n, times}, or null when empty. A tie goes to the smaller number (deterministic). */
export function favouriteOf(h) {
  let best = null;
  h.forEach((times, n) => { if (times > 0 && (!best || times > best.times)) best = { n, times }; });
  return best;
}

export class Stats {
  constructor(storage, key=STATS_KEY) {
    this.key=key;
    this.storage = storage || memoryStore();
    this.load();
  }
  load() {
    let j = null;
    try { j = JSON.parse(this.storage.getItem(this.key)); } catch { j = null; }
    j = j && typeof j === 'object' && !Array.isArray(j) ? j : {};
    this.wins = cnt(j.w); this.losses = cnt(j.l);
    this.shown = hist(j.shown); this.guessed = hist(j.guessed);
  }
  #save() { try { this.storage.setItem(this.key, JSON.stringify({ w: this.wins, l: this.losses, shown: this.shown, guessed: this.guessed })); } catch { /* blocked storage: kept in memory only */ } }
  get matches() { return this.wins + this.losses; }
  /** A finished match: [won] true or false. */
  recordMatch(won) { if (won) this.wins++; else this.losses++; this.#save(); }
  /** The finger count I held up as the pointer (a round with no hand seen is not counted). */
  recordShown(n) { if (Number.isInteger(n) && n >= 0 && n <= MAX_FINGERS) { this.shown[n]++; this.#save(); } }
  /** The total I guessed as the guesser (no guess = not counted). */
  recordGuess(n) { if (Number.isInteger(n) && n >= 0 && n <= MAX_FINGERS) { this.guessed[n]++; this.#save(); } }
  /** FAVOURITE NUMBER = the finger count shown most often; `favouriteGuess` = the total guessed most often. */
  get favouriteShown() { return favouriteOf(this.shown); }
  get favouriteGuess() { return favouriteOf(this.guessed); }
  reset() { this.wins = 0; this.losses = 0; this.shown = hist(); this.guessed = hist(); this.#save(); }
}
