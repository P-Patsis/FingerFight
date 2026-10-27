// Pure game rules. No DOM, no network: everything here is testable with `node --test`.
//
// A round: one player is the POINTER (holds up fingers), the other is the GUESSER (guesses the total number
// of fingers). Roles swap every round. Both sides run resolveRound() on the same inputs, so both get the same answer.

export const DEFAULTS = Object.freeze({ seconds: 5, hits: 3, maxFingers: 10, background: 0 });
export const LIMITS = Object.freeze({ seconds: [3, 20], hits: [1, 10], maxFingers: [1, 10] });
export const MAX_FINGERS = 10;

/** Gestures the camera can recognise. They never score; they are only shown (or filtered out) at the reveal. */
export const GESTURES = ['middle', 'moutza', 'sideways'];

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
    maxFingers: clamp(n('maxFingers'), LIMITS.maxFingers),   // quicker matches: both players only use 0..maxFingers
    background: Math.max(0, Math.min(4, Math.round(Number(s.background) || 0))),
  };
}

export function newGame(settings) {
  const st = normalizeSettings(settings);
  return { settings: st, round: 0, health: { host: st.hits, guest: st.hits }, over: false, winner: null };
}

/**
 * Outcome of one round. Only a correct guess scores.
 *  - a closed fist is a real 0 (a hand was seen with no fingers up) and can be guessed like any number
 *  - NO HAND AT ALL is "no answer" (pointer) or "no guess" (guesser): the round is a miss, nobody takes damage
 *  - guess equals the pointer's count -> the guesser hits the pointer for 1
 *  - anything else                    -> a miss
 * @returns {{target: 'host'|'guest'|null, damage: number, reason: string}}
 */
export function resolveRound({ pointer, count, guess, noHand }) {   // gestures are deliberately not an input: they never score
  if (noHand) return { target: null, damage: 0, reason: 'nohand' };                              // nothing to guess
  if (guess === null || guess === undefined) return { target: null, damage: 0, reason: 'noguess' };   // nothing guessed
  if (guess === count) return { target: pointer, damage: 1, reason: 'correct' };
  return { target: null, damage: 0, reason: 'miss' };
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
    case 'correct': return iAmPointer ? 'They guessed it!' : 'You guessed it!';
    case 'nohand': return iAmPointer ? 'No hand seen. No answer, no damage.' : 'No hand to guess from. No damage.';
    case 'noguess': return guesser === me ? 'No hand seen: no guess, no damage.' : 'They made no guess.';
    default: return guesser === me ? 'Wrong guess. No damage.' : 'They missed.';
  }
}

// ---------------------------------------------------------------------------------------------
// Checks for anything that arrives from the other player's phone. Never trust the network.
// ---------------------------------------------------------------------------------------------

const MAX_PHOTO_CHARS = 150_000;

/** How a player's hand is shown to the opponent. The first two never involve camera pixels. */
export const VIEWS = ['avatar', 'skeleton', 'blur', 'photo-skeleton', 'photo'];
export const SAFE_VIEWS = ['avatar', 'skeleton'];          // the only ones allowed against a random opponent
export const RANDOM_SLOTS = 8;                              // shared matchmaking slots (see main.js)

/** A display name: letters, digits, space and _ . - only, at most 12 characters. */
export function sanitizeName(s) {
  const t = String(s ?? '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 12);
  return t || 'Fighter';
}

export const validGuess = g => g === null || (Number.isInteger(g) && g >= 0 && g <= MAX_FINGERS);

/** Empty (no photo) or a small inline JPEG. Nothing else: no links, no SVG. */
export const validPhoto = p => typeof p === 'string'
  && (p === '' || (p.startsWith('data:image/jpeg;base64,') && p.length <= MAX_PHOTO_CHARS));

const FINGER_KEYS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
/** At most two hands, each with exactly the five finger flags as booleans. */
export const validHands = h => Array.isArray(h) && h.length <= 2
  && h.every(x => !!x && typeof x === 'object' && Object.keys(x).length === 5 && FINGER_KEYS.every(k => typeof x[k] === 'boolean'));
/** Hand landmarks for the skeleton view: at most two hands of 21 [x, y] points, integers 0..1000. */
export const validLandmarks = l => l === null || (Array.isArray(l) && l.length <= 2
  && l.every(hand => Array.isArray(hand) && hand.length === 21
    && hand.every(p => Array.isArray(p) && p.length === 2 && p.every(v => Number.isInteger(v) && v >= 0 && v <= 1000))));

/**
 * The picture part of a reveal or a guess: how to show the sender's hand. The finger data (`hands`) is always
 * present, so the receiver can draw a cartoon hand itself. With [allowPhoto] false (random opponents, or the
 * receiver chose not to see photos) any message carrying a photo is rejected.
 */
export function validPicture(m, allowPhoto) {
  return !!m && VIEWS.includes(m.view)
    && typeof m.skin === 'string' && /^[a-z]{1,12}$/.test(m.skin)
    && validHands(m.hands) && validLandmarks(m.lm)
    && typeof m.ar === 'number' && m.ar >= 0.3 && m.ar <= 3
    && validPhoto(m.photo) && (allowPhoto || m.photo === '')
    && (allowPhoto || SAFE_VIEWS.includes(m.view));
}

/** The pointer's answer: {count, gesture, noHand} + picture. */
export function validReveal(m, allowPhoto = true) {
  return !!m && typeof m === 'object'
    && Number.isInteger(m.count) && m.count >= 0 && m.count <= MAX_FINGERS
    && typeof m.noHand === 'boolean'
    && (m.gesture === undefined || m.gesture === null || GESTURES.includes(m.gesture))
    && validPicture(m, allowPhoto);
}

/** The guesser's answer: their guess is the number of fingers they held up (null = no hand seen: no guess) + picture. */
export const validGuessMsg = (m, allowPhoto = true) => !!m && typeof m === 'object' && validGuess(m.guess) && validPicture(m, allowPhoto);
