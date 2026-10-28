import { RUDE_GESTURES } from './logic.js';
// Pure hand geometry on MediaPipe's 21 landmarks (each {x, y} in 0..1 of the image). No DOM.
// Landmark ids: 0 wrist; thumb 1-4; index 5-8; middle 9-12; ring 13-16; pinky 17-20 (MCP, PIP, DIP, TIP).
//
// Finger counting is the logic from the original fingers app: a finger is up when its tip is farther from the
// wrist than its middle joint; the thumb when its tip is farther from the pinky base than its own joint.
// [aspect] = image width / height, so distances and angles are measured in real proportions.

const FINGER_IDS = { index: [5, 6, 8], middle: [9, 10, 12], ring: [13, 14, 16], pinky: [17, 18, 20] };
// Points carry depth (z, in MediaPipe the same scale as x) so a finger pointing at the camera is not mistaken for a folded one.
const P = (lm, i, aspect) => ({ x: lm[i].x * aspect, y: lm[i].y, z: (lm[i].z || 0) * aspect });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
const unit = (a, b) => { const d = dist(a, b) || 1; return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; };
const angleBetween = (u, v) => (Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))) * 180) / Math.PI;

// ---- TUNING: every threshold that decides a finger count or a gesture lives here, so it can be adjusted live (debug panel)
// and saved on the phone. The defaults are guesses from geometry, not tuned on real hands.
export const DEFAULT_TUNING = Object.freeze({
  extend: 1.05,     // a finger is UP when its tip is this many times farther from the wrist than its middle joint (1.0 = just farther)
  thumb: 1.0,       // the thumb is UP when its tip is this many times farther from the pinky base than its own joint
  minScore: 0,      // ignore a detected hand whose model confidence is below this (0 = accept everything)
  frames: 7,        // how many of the latest camera frames vote on the answer at the snap
  sideMin: 60,      // the sideways gesture: angle range (degrees) between the middle finger and the other raised fingers
  sideMax: 120,
});
/** [min, max, step] for each value, used to clamp loaded values and to build the sliders. */
export const TUNING_RANGES = Object.freeze({
  extend: [1.0, 1.5, 0.01], thumb: [0.8, 1.3, 0.01], minScore: [0, 0.95, 0.05], frames: [3, 15, 1],
  sideMin: [30, 89, 1], sideMax: [91, 150, 1],
});
export const TUNING = { ...DEFAULT_TUNING };
const TUNE_KEY = 'ff-tune';

/** Applies [patch] (unknown keys ignored, values clamped), and returns the live TUNING. */
export function setTuning(patch = {}) {
  for (const [k, [lo, hi]] of Object.entries(TUNING_RANGES)) {
    const v = Number(patch[k]);
    if (patch[k] !== undefined && Number.isFinite(v)) TUNING[k] = Math.min(hi, Math.max(lo, v));
  }
  return TUNING;
}
export function resetTuning() { Object.assign(TUNING, DEFAULT_TUNING); try { localStorage.removeItem(TUNE_KEY); } catch { /* ignore */ } return TUNING; }
export function saveTuning() { try { localStorage.setItem(TUNE_KEY, JSON.stringify(TUNING)); } catch { /* private mode */ } }
export function loadTuning() { try { const j = JSON.parse(localStorage.getItem(TUNE_KEY) || 'null'); if (j && typeof j === 'object') setTuning(j); } catch { /* ignore */ } return TUNING; }

/** Which fingers are up: {thumb, index, middle, ring, pinky}. */
export function fingerStates(lm, aspect = 1) {
  const wrist = P(lm, 0, aspect);
  const s = { thumb: dist(P(lm, 4, aspect), P(lm, 17, aspect)) > dist(P(lm, 3, aspect), P(lm, 17, aspect)) * TUNING.thumb };
  for (const [name, [, pip, tip]] of Object.entries(FINGER_IDS)) {
    s[name] = dist(P(lm, tip, aspect), wrist) > dist(P(lm, pip, aspect), wrist) * TUNING.extend;
  }
  return s;
}

/** The raw numbers behind fingerStates, for the debug panel: per finger the measured ratio, the threshold, and the verdict. */
export function fingerDebug(lm, aspect = 1) {
  const wrist = P(lm, 0, aspect);
  const out = { thumb: { ratio: dist(P(lm, 4, aspect), P(lm, 17, aspect)) / (dist(P(lm, 3, aspect), P(lm, 17, aspect)) || 1), threshold: TUNING.thumb } };
  for (const [name, [, pip, tip]] of Object.entries(FINGER_IDS)) {
    out[name] = { ratio: dist(P(lm, tip, aspect), wrist) / (dist(P(lm, pip, aspect), wrist) || 1), threshold: TUNING.extend };
  }
  for (const v of Object.values(out)) v.up = v.ratio > v.threshold;
  return out;
}

export const countHand = (lm, aspect = 1) => Object.values(fingerStates(lm, aspect)).filter(Boolean).length;

/** Total fingers over all visible hands (max 10). */
export const countHands = (hands, aspect = 1) => Math.min(10, hands.reduce((n, lm) => n + countHand(lm, aspect), 0));

const dirOf = (lm, name, aspect) => { const [mcp, , tip] = FINGER_IDS[name]; return unit(P(lm, mcp, aspect), P(lm, tip, aspect)); };

/**
 * One hand's gesture: 'sideways' | 'middle' | null. An open palm (five fingers, spread or not) is NOT a gesture: it is just a five.
 *  - middle:   only the middle finger is up (thumb ignored)
 *  - sideways: middle finger up and at roughly 90 degrees to the other raised fingers (at least two of them)
 */

export function classify(lm, aspect = 1) {
  const f = fingerStates(lm, aspect);
  const others = ['index', 'ring', 'pinky'].filter(n => f[n]);

  if (f.middle && others.length >= 2) {
    const m = dirOf(lm, 'middle', aspect);
    const mean = others.map(n => dirOf(lm, n, aspect)).reduce((a, v) => ({ x: a.x + v.x, y: a.y + v.y }), { x: 0, y: 0 });
    const len = Math.hypot(mean.x, mean.y) || 1;
    const a = angleBetween(m, { x: mean.x / len, y: mean.y / len });
    if (a >= TUNING.sideMin && a <= TUNING.sideMax) return 'sideways';
  }
  if (f.middle && !f.index && !f.ring && !f.pinky) return 'middle';
  return null;
}

const RANK = { sideways: 2, middle: 1 };

/** The strongest gesture among the visible hands, or null. */
export function classifyHands(hands, aspect = 1) {
  let best = null;
  for (const lm of hands) {
    const g = classify(lm, aspect);
    if (g && (!best || RANK[g] > RANK[best])) best = g;
  }
  return best;
}

/**
 * Does a received picture message show a rude gesture? Uses the sender's gesture flag, the hand landmarks and the finger
 * flags. An open palm / five fingers is never rude (the old 'moutza' flag from older clients is ignored).
 */
export function isRudeMessage(msg) {
  if (RUDE_GESTURES.includes(msg.gesture)) return true;
  if (Array.isArray(msg.hands) && msg.hands.some(h => h.middle && !h.index && !h.ring && !h.pinky)) return true;   // only the middle finger up
  if (Array.isArray(msg.lm) && msg.lm.length) {
    const hands = msg.lm.map(h => h.map(([x, y]) => ({ x: x / 1000, y: y / 1000 })));
    if (classifyHands(hands, msg.ar || 1)) return true;
  }
  return false;
}
