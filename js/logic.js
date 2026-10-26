// Pure game rules. No DOM, no network: everything here is testable with `node --test`.
//
// A round: one player is the POINTER (holds up fingers), the other is the GUESSER (guesses the total number
// of fingers). Roles swap every round. Both sides run resolveRound() on the same inputs, so both get the same answer.

export const DEFAULTS = Object.freeze({ seconds: 5, hits: 3, crits: true, background: 0 });
export const LIMITS = Object.freeze({ seconds: [3, 20], hits: [1, 10] });
export const MAX_FINGERS = 10;

/** Critical-hit damage for an "obscene" gesture shown by the pointer. */
export const GESTURE_DAMAGE = Object.freeze({ middle: 2, moutza: 2, sideways: 3 });

export const other = side => (side === 'host' ? 'guest' : 'host');

/** Round 1 = host points, round 2 = guest points, and so on. */
export const pointerFor = round => (round % 2 === 1 ? 'host' : 'guest');

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/** Cleans settings that came from a text box or from the network. */
export function normalizeSettings(s = {}) {
  const n = k => (Number.isFinite(Number(s[k])) ? Math.round(Number(s[k])) : DEFAULTS[k]);
  return {
    seconds: clamp(n('seconds'), LIMITS.seconds),
    hits: clamp(n('hits'), LIMITS.hits),
    crits: s.crits === undefined ? DEFAULTS.crits : !!s.crits,
    background: Math.max(0, Math.min(4, Math.round(Number(s.background) || 0))),
  };
}

export function newGame(settings) {
  const st = normalizeSettings(settings);
  return { settings: st, round: 0, health: { host: st.hits, guest: st.hits }, over: false, winner: null };
}

/**
 * Outcome of one round.
 *  - pointer hides their hand           -> the guesser hits them (forfeit)
 *  - guess is right                     -> the guesser hits the pointer for 1
 *  - guess is wrong + obscene gesture   -> the pointer lands a CRITICAL on the guesser (2, or 3 for 'sideways')
 *  - guess is wrong, nothing else       -> a miss, no damage
 * Gestures only count when `crits` is on. A missing guess (null) is a wrong guess.
 * @returns {{target: 'host'|'guest'|null, damage: number, crit: boolean, reason: string}}
 */
export function resolveRound({ pointer, count, guess, gesture, noHand, crits }) {
  const guesser = other(pointer);
  if (noHand) return { target: pointer, damage: 1, crit: false, reason: 'nohand' };
  if (guess !== null && guess !== undefined && guess === count) return { target: pointer, damage: 1, crit: false, reason: 'correct' };
  const bonus = crits ? GESTURE_DAMAGE[gesture] || 0 : 0;
  if (bonus > 0) return { target: guesser, damage: bonus, crit: true, reason: 'crit' };
  return { target: null, damage: 0, crit: false, reason: 'miss' };
}

/** Applies a resolved round to the game and returns a new game state. */
export function applyResult(game, result) {
  const health = { ...game.health };
  if (result.target) health[result.target] = Math.max(0, health[result.target] - result.damage);
  const dead = ['host', 'guest'].filter(s => health[s] === 0);
  return { ...game, health, over: dead.length > 0, winner: dead.length === 1 ? other(dead[0]) : null };
}

/** Short text for the result banner. [me] is 'host' or 'guest'. */
export function describe(result, pointer, me) {
  const guesser = other(pointer);
  const iAmPointer = pointer === me;
  switch (result.reason) {
    case 'nohand': return iAmPointer ? 'No hand seen. You forfeit the round!' : 'They hid their hand. Free hit!';
    case 'correct': return iAmPointer ? 'They guessed it!' : 'You guessed it!';
    case 'crit': return (result.target === me ? 'Critical hit on you!' : 'CRITICAL HIT!');
    default: return guesser === me ? 'Wrong guess. No damage.' : 'They missed.';
  }
}

// ---------------------------------------------------------------------------------------------
// Checks for anything that arrives from the other player's phone. Never trust the network.
// ---------------------------------------------------------------------------------------------

export const GESTURES = ['middle', 'moutza', 'sideways'];
const MAX_PHOTO_CHARS = 150_000;

/** A display name: letters, digits, space and _ . - only, at most 12 characters. */
export function sanitizeName(s) {
  const t = String(s ?? '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 12);
  return t || 'Fighter';
}

export const validGuess = g => g === null || (Number.isInteger(g) && g >= 0 && g <= MAX_FINGERS);

/** Empty (no photo) or a small inline JPEG. Nothing else: no links, no SVG. */
export const validPhoto = p => typeof p === 'string'
  && (p === '' || (p.startsWith('data:image/jpeg;base64,') && p.length <= MAX_PHOTO_CHARS));

/** The pointer's answer: {count, gesture, noHand, photo}. */
export function validReveal(m) {
  return !!m && typeof m === 'object'
    && Number.isInteger(m.count) && m.count >= 0 && m.count <= MAX_FINGERS
    && typeof m.noHand === 'boolean'
    && (m.gesture === null || GESTURES.includes(m.gesture))
    && validPhoto(m.photo);
}

/** The guesser's answer: their guess is the number of fingers they held up (null = no hand seen), with a photo. */
export const validGuessMsg = m => !!m && typeof m === 'object' && validGuess(m.guess) && validPhoto(m.photo);
