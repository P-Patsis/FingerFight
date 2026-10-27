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

/** A finger counts as up only when its tip is clearly farther from the wrist than its middle joint (a half-bent finger is "down"). */
export const FINGER_EXTEND = 1.05;

/** Which fingers are up: {thumb, index, middle, ring, pinky}. */
export function fingerStates(lm, aspect = 1) {
  const wrist = P(lm, 0, aspect);
  const s = { thumb: dist(P(lm, 4, aspect), P(lm, 17, aspect)) > dist(P(lm, 3, aspect), P(lm, 17, aspect)) };
  for (const [name, [, pip, tip]] of Object.entries(FINGER_IDS)) {
    s[name] = dist(P(lm, tip, aspect), wrist) > dist(P(lm, pip, aspect), wrist) * FINGER_EXTEND;
  }
  return s;
}

export const countHand = (lm, aspect = 1) => Object.values(fingerStates(lm, aspect)).filter(Boolean).length;

/** Total fingers over all visible hands (max 10). */
export const countHands = (hands, aspect = 1) => Math.min(10, hands.reduce((n, lm) => n + countHand(lm, aspect), 0));

const dirOf = (lm, name, aspect) => { const [mcp, , tip] = FINGER_IDS[name]; return unit(P(lm, mcp, aspect), P(lm, tip, aspect)); };

/**
 * One hand's gesture: 'sideways' | 'moutza' | 'middle' | null.
 *  - middle:   only the middle finger is up (thumb ignored)
 *  - moutza:   all five up AND fanned wide (index-to-pinky angle over MOUTZA_SPREAD), the open-palm insult
 *  - sideways: middle finger up and at roughly 90 degrees to the other raised fingers (at least two of them)
 * The camera can't tell palm from back of hand, so moutza is "open and spread" either way.
 */
export const MOUTZA_SPREAD = 22;
export const SIDEWAYS_RANGE = [60, 120];

export function classify(lm, aspect = 1) {
  const f = fingerStates(lm, aspect);
  const others = ['index', 'ring', 'pinky'].filter(n => f[n]);

  if (f.middle && others.length >= 2) {
    const m = dirOf(lm, 'middle', aspect);
    const mean = others.map(n => dirOf(lm, n, aspect)).reduce((a, v) => ({ x: a.x + v.x, y: a.y + v.y }), { x: 0, y: 0 });
    const len = Math.hypot(mean.x, mean.y) || 1;
    const a = angleBetween(m, { x: mean.x / len, y: mean.y / len });
    if (a >= SIDEWAYS_RANGE[0] && a <= SIDEWAYS_RANGE[1]) return 'sideways';
  }
  if (f.thumb && f.index && f.middle && f.ring && f.pinky) {
    if (angleBetween(dirOf(lm, 'index', aspect), dirOf(lm, 'pinky', aspect)) >= MOUTZA_SPREAD) return 'moutza';
  }
  if (f.middle && !f.index && !f.ring && !f.pinky) return 'middle';
  return null;
}

const RANK = { sideways: 3, moutza: 2, middle: 1 };

/** The strongest gesture among the visible hands, or null. */
export function classifyHands(hands, aspect = 1) {
  let best = null;
  for (const lm of hands) {
    const g = classify(lm, aspect);
    if (g && (!best || RANK[g] > RANK[best])) best = g;
  }
  return best;
}
