// Builds synthetic 21-point hands (hand pointing up, wrist at bottom) for testing the finger geometry.
const WRIST = { x: 0.5, y: 0.9 };
const MCP = { index: { x: 0.42, y: 0.65 }, middle: { x: 0.48, y: 0.62 }, ring: { x: 0.54, y: 0.64 }, pinky: { x: 0.60, y: 0.68 } };
const IDS = { index: 5, middle: 9, ring: 13, pinky: 17 };
const rad = d => (d * Math.PI) / 180;
const dir = deg => ({ x: Math.sin(rad(deg)), y: -Math.cos(rad(deg)) });   // 0 = straight up, + = clockwise
const add = (p, v, k) => ({ x: p.x + v.x * k, y: p.y + v.y * k });

/**
 * up: which fingers are raised, e.g. {thumb:true, index:true}. angle: direction of each raised finger in
 * degrees from vertical (default 0). Curled fingers fold down over the palm.
 */
export function makeHand(up = {}, angle = {}) {
  const lm = new Array(21);
  lm[0] = WRIST;
  for (const name of ['index', 'middle', 'ring', 'pinky']) {
    const base = IDS[name], mcp = MCP[name], d = dir(angle[name] || 0);
    const pip = add(mcp, d, 0.07);
    lm[base] = mcp; lm[base + 1] = pip;
    if (up[name]) {
      lm[base + 2] = add(pip, d, 0.05);
      lm[base + 3] = add(pip, d, 0.10);
    } else {
      lm[base + 2] = add(pip, { x: 0, y: 1 }, 0.035);      // folded back toward the palm
      lm[base + 3] = add(pip, { x: 0, y: 1 }, 0.07);
    }
  }
  lm[1] = { x: 0.44, y: 0.85 }; lm[2] = { x: 0.40, y: 0.78 }; lm[3] = { x: 0.36, y: 0.72 };
  lm[4] = up.thumb ? { x: 0.32, y: 0.68 } : { x: 0.50, y: 0.74 };
  return lm;
}

export const ALL = { thumb: true, index: true, middle: true, ring: true, pinky: true };
export const FAN = { index: -15, middle: 0, ring: 10, pinky: 20 };       // wide open
export const FLAT = { index: -3, middle: 0, ring: 3, pinky: 6 };          // fingers together
