// Pure game rules. No DOM, no network: everything here is testable with `node --test`.
//
// A round: one player is the POINTER (holds up fingers), the other is the GUESSER (guesses the total number
// of fingers). Roles swap every round. Both sides run resolveRound() on the same inputs, so both get the same answer.

export const DEFAULTS = Object.freeze({ seconds: 5, hits: 3, maxFingers: 5, background: 0, shrink: false });
export const LIMITS = Object.freeze({ seconds: [3, 20], hits: [1, 10], maxFingers: [1, 10] });
export const MAX_FINGERS = 10;

/** Gestures the camera can recognise. They never score; they are only shown (or filtered out) at the reveal. */
export const GESTURES = ['middle', 'moutza', 'sideways'];   // 'moutza' (open palm) is still ACCEPTED from older clients but is no longer detected, shown or filtered
/** The only gestures the rude-gesture filter hides. An open palm is a normal five and is never filtered. */
export const RUDE_GESTURES = Object.freeze(['middle', 'sideways']);

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
    shrink: s.shrink === true,                                // optional: the finger limit drops as the match goes on (default OFF)
  };
}

// ---- reduce fingers over time (optional host setting) --------------------------------------------------------------
// THE RULE: with "fewer fingers" ON, rounds 1-5 use the host's limit, rounds 6-10 one less, rounds 11-15 two less, and so on
// (the ceiling drops by 1 after every 5 rounds), but never below 3 and never above the host's own limit.
export const SHRINK_EVERY = 5;   // the limit drops by one every this many rounds ...
export const SHRINK_FLOOR = 3;   // ... but never below this (0..3), so a long match stays playable

/** Text for the banner when the ceiling is lower in round [round] than in the round before; '' when it did not change. */
export function shrinkNotice(settings, round) {
  const n = Number(round) || 1;
  if (n < 2) return '';
  const now = effectiveMax(settings, n);
  return now < effectiveMax(settings, n - 1) ? 'Max fingers is now ' + now : '';
}

/** The finger limit for round [round] (1-based): the host's maxFingers, or less once the shrink option is on. */
export function effectiveMax(settings, round) {
  const max = normalizeSettings(settings).maxFingers;
  if (settings?.shrink !== true) return max;
  const drop = Math.floor((Math.max(1, Number(round) || 1) - 1) / SHRINK_EVERY);
  return Math.min(max, Math.max(SHRINK_FLOOR, max - drop));
}

// ---- anti-grief: a player who shows no hand for IDLE_ROUNDS rounds in a row forfeits ------------------------------
export const IDLE_ROUNDS = 3;    // consecutive rounds with no detected hand before the match is forfeited (a warning comes one round earlier)

export const newIdle = () => ({ host: 0, guest: 0 });

/**
 * Updates the idle counters after a round. [noHand] = {host: bool, guest: bool}: true when that player showed no hand
 * (as pointer: no answer; as guesser: no guess). Seeing a hand resets the counter.
 * @returns {{idle: {host:number, guest:number}, warn: string[], forfeit: 'host'|'guest'|null}}
 */
export function trackIdle(idle, noHand) {
  const next = { host: noHand.host ? idle.host + 1 : 0, guest: noHand.guest ? idle.guest + 1 : 0 };
  const warn = ['host', 'guest'].filter(s => next[s] === IDLE_ROUNDS - 1);
  const gone = ['host', 'guest'].filter(s => next[s] >= IDLE_ROUNDS);
  return { idle: next, warn, forfeit: gone.length === 1 ? gone[0] : null };   // both idle at once: nobody forfeits (nobody is being left waiting)
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

/**
 * How a player's hand is shown to the opponent: the whole matrix of choices. The first two never involve camera pixels;
 * the "photo-" ones put the player's real photo behind the skeleton / puppet and exist in private (friends) matches only.
 */
export const VIEWS = ['skeleton', 'puppet', 'photo-skeleton', 'photo-puppet'];
export const SAFE_VIEWS = ['skeleton', 'puppet'];          // the only ones allowed against a random opponent
/** Views older versions of the game sent. Still ACCEPTED from an older phone (and shown as the nearest new view), never offered or sent. */
export const LEGACY_VIEWS = { avatar: 'puppet', blur: 'photo-skeleton', photo: 'photo-skeleton' };
/** The view to show for any received value, or null when it is unknown. */
export const normalizeView = v => (VIEWS.includes(v) ? v : (LEGACY_VIEWS[v] || null));
/** The options a player may pick for a kind of match: strangers get the drawn views only, never a photo. */
export const viewsFor = kind => (kind === 'random' ? SAFE_VIEWS : VIEWS);
/** A view that is allowed against a random opponent (drawn from finger data on the receiver's phone). */
export const isSafeView = v => SAFE_VIEWS.includes(normalizeView(v));
/** What a stranger gets of a chosen view: the drawn twin (photo + puppet -> puppet), never a photo. */
export const safeViewOf = v => (viewOf(v).endsWith('puppet') ? 'puppet' : 'skeleton');
/** A saved or stored choice -> a current view (older saved values are mapped; unknown gives the puppet). */
export const viewOf = v => normalizeView(v) || 'puppet';
/** The camera-image warning belongs to the photo views ONLY (they send a real JPEG); skeleton and puppet send finger data, never a picture. */
export const CAMERA_WARNING = 'Warning: this sends a real photo of you to your opponent.';
/** The camera starts by itself when a player creates or joins a room (one try; after a failure the button is shown instead and
 *  nothing retries behind the player's back). */
export const autoCameraWanted = ({ ready, busy, failed } = {}) => !ready && !busy && !failed;

/** The per-round instruction for the shower (pointer) and for the guesser. */
export const TURN_SHOW = 'Your turn to show fingers';
export const TURN_GUESS = 'Your turn to guess';
export const turnMessage = pointing => (pointing ? TURN_SHOW : TURN_GUESS);
/** How long the HIT! feedback stays up (it was 1300 ms; half a second longer so it is hard to miss). */
export const HIT_MS = 1800;
export const cameraWarning = v => (normalizeView(v) !== null && !isSafeView(v) ? CAMERA_WARNING : '');
export const RANDOM_SLOTS = 8;                              // shared matchmaking slots (see main.js)

/** A display name: letters, digits, space and _ . - only, at most 12 characters. */
/** Names are shown as plain text only, so almost any language is fine. What is removed, and why:
 *  - control, invisible-format (including right-to-left override tricks), private-use and unassigned characters
 *  - "<" and ">" (markup), and pile-ups of combining marks (a name must not grow tall over the screen)
 *  Letters of every script (Latin, Greek, Chinese, Arabic, ...), numbers, spaces, symbols such as $ * # & ' and emoji
 *  (including flags and joined emoji) stay. The limit counts what a person sees as one character, not bytes. */
export const NAME_MAX = 12;
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = t => (segmenter ? Array.from(segmenter.segment(t), x => x.segment) : Array.from(t));
export function sanitizeName(s, max = NAME_MAX) {
  const t = String(s ?? '').normalize('NFC').replace(/[\p{Z}\s]+/gu, ' ')
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}<>]/gu, c => (c === '\u200d' ? c : ''))       // keep only the joiner used inside emoji
    .replace(/\u200d(?![\p{Extended_Pictographic}])/gu, '').replace(/(?<![\p{Extended_Pictographic}\ufe0f])\u200d/gu, '')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1')
    .replace(/[\p{Z}\s]+/gu, ' ').trim();
  const cut = graphemes(t).slice(0, max).join('').trim();
  return cut || 'Fighter';
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
const COS_KEYS = ['tone', 'tattoo', 'nails', 'ring', 'glove'];
/** The optional cosmetics of a picture: {tone, tattoo, nails, ring, glove} item ids (only those keys, 1-12 lower-case letters). The receiver
 *  draws them from its own copies, so an id it does not know is simply not drawn; nothing else can travel in this field. */
export const validCos = c => c === undefined || c === null
  || (typeof c === 'object' && !Array.isArray(c) && Object.keys(c).length <= COS_KEYS.length
    && Object.entries(c).every(([k, v]) => COS_KEYS.includes(k) && typeof v === 'string' && /^[a-z]{1,12}$/.test(v)));

export function validPicture(m, allowPhoto) {
  return !!m && normalizeView(m.view) !== null
    && typeof m.skin === 'string' && /^[a-z]{1,12}$/.test(m.skin)
    && validHands(m.hands) && validLandmarks(m.lm) && validCos(m.cos)
    && typeof m.ar === 'number' && m.ar >= 0.3 && m.ar <= 3
    && validPhoto(m.photo) && (allowPhoto || m.photo === '')
    && (allowPhoto || isSafeView(m.view));
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
