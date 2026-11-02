// The sand hand's behaviour: shake-to-collapse and reform. Pure maths (no canvas, no DOM, no timers) so it is testable; the particle system
// (js/particles.js) calls it from the tracking loop that already exists and draws the grains, inside its own caps.
//
//   speed   how fast a hand moves, in PALM WIDTHS per second (so it does not depend on how big the hand is on screen): the mean frame-to-frame
//           displacement of the 21 landmarks. It is computed from landmarks the tracker already produced; nothing extra is sent anywhere.
//   collapse  when the speed stays past COLLAPSE_SPEED for HOT_S (a spike, not a one-frame glitch) the hand crumbles into a swarm of grains; when it has been calmer than
//           SETTLE_SPEED for SETTLE_S the grains flow back and the hand re-forms. `c` runs 0 (a hand) .. 1 (a swarm).
// The constants are guesses until tried on a real hand: they are the only thing to tune.

export const SAND = Object.freeze({
  GRAINS: 60,            // the swarm, counted inside the particle system's 90-particle cap
  COLLAPSE_SPEED: 4.5,   // palm widths / second (smoothed) that crumbles the hand
  SETTLE_SPEED: 1.5,     // calmer than this, for SETTLE_S, and the sand re-forms
  SETTLE_S: 0.4,
  SMOOTH_S: 0.08,        // speed smoothing window (used to decide when the hand has settled)
  HOT_S: 0.15,           // fast movement must last this long (a tracking glitch is one or two frames) before the hand crumbles
  COLLAPSE_S: 0.22,      // seconds for the hand to crumble
  REFORM_S: 0.8,         // seconds for the sand to flow back
});

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Mean landmark movement between two frames of one hand ({x, y} pixel points), in palm widths per second. 0 when it cannot be measured. */
export function handSpeed(prev, cur, dt) {
  if (!Array.isArray(prev) || !Array.isArray(cur) || prev.length < 21 || cur.length < 21 || !(dt > 0)) return 0;
  const palm = dist(cur[5], cur[17]);
  if (!(palm > 0)) return 0;
  let sum = 0;
  for (let i = 0; i < 21; i++) sum += dist(prev[i], cur[i]);
  return sum / 21 / palm / dt;
}

const smooth = x => x * x * (3 - 2 * x);

/** The collapse state of one hand. update() is called once per analysed frame. */
export class SandMotion {
  constructor() { this.c = 0; this.collapsed = false; this.calm = 0; this.hot = 0; this.speed = 0; this.prev = null; }

  /** [lm]: the hand's 21 {x, y} pixel points; [dt]: seconds since the last frame. Returns the collapse amount 0..1. */
  update(lm, dt) {
    dt = Math.min(Math.max(dt, 0), 0.1);                 // a stalled frame must not look like a huge jump
    if (dt > 0) {
      const raw = handSpeed(this.prev, lm, dt);
      this.speed += (raw - this.speed) * (1 - Math.exp(-dt / SAND.SMOOTH_S));
      this.hot = Math.min(1, Math.max(0, this.hot + (raw > SAND.COLLAPSE_SPEED ? dt : -dt)));     // time spent moving fast; a dip at a turn-around only costs a little
    }
    this.prev = lm.map(p => ({ x: p.x, y: p.y }));
    if (!this.collapsed) {
      if (this.hot >= SAND.HOT_S) { this.collapsed = true; this.calm = 0; this.hot = 0; }
    } else if (this.speed < SAND.SETTLE_SPEED) {
      this.calm += dt;
      if (this.calm >= SAND.SETTLE_S) this.collapsed = false;
    } else this.calm = 0;
    this.c = this.collapsed ? Math.min(1, this.c + dt / SAND.COLLAPSE_S) : Math.max(0, this.c - dt / SAND.REFORM_S);
    return this.c;
  }
  /** How much of the solid hand is still drawn: 1 = whole, 0 = all grains. */
  get body() { return 1 - smooth(this.c); }
}

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const PALM_TRIS = [[0, 5, 17], [5, 9, 17], [9, 13, 17]];     // landmark triples that cover the palm
/** Fixed grain recipes: where each grain sits on the hand (a finger link or a palm triangle) and where it scatters to. Same every run. */
export const GRAINS = (() => {
  const rnd = mulberry32(0x5A17D), out = [];
  const segs = [];
  for (const [a, b] of [[1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [9, 10], [10, 11], [11, 12], [13, 14], [14, 15], [15, 16], [17, 18], [18, 19], [19, 20]]) segs.push([a, b]);
  for (let i = 0; i < SAND.GRAINS; i++) {
    const g = { delay: rnd(), ang: rnd() * Math.PI * 2, rad: 0.5 + rnd() * 1.8, phase: rnd() * 6.28, size: 0.8 + rnd() * 0.9, shade: i % 3 === 0 ? 1 : 0 };
    if (i < segs.length * 2) { const [a, b] = segs[i % segs.length]; Object.assign(g, { seg: [a, b], t: 0.25 + 0.5 * rnd(), off: (rnd() - 0.5) * 0.16 }); }
    else { const tri = PALM_TRIS[Math.floor(rnd() * 3)]; let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; } Object.assign(g, { tri, u, v }); }
    out.push(g);
  }
  return out;
})();

/** Where grain [g] rests on a hand ({x, y} pixel points); [palm] = the hand's palm width in pixels. */
export function grainHome(lm, g, palm) {
  if (g.seg) {
    const A = lm[g.seg[0]], B = lm[g.seg[1]], dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
    return { x: A.x + dx * g.t - (dy / len) * g.off * palm, y: A.y + dy * g.t + (dx / len) * g.off * palm };
  }
  const [i, j, k] = g.tri, P = lm[i], Q = lm[j], R = lm[k], w = 1 - g.u - g.v;
  return { x: P.x * w + Q.x * g.u + R.x * g.v, y: P.y * w + Q.y * g.u + R.y * g.v };
}

/**
 * The swarm for one hand at collapse amount [c] (0..1) and time [t] seconds: [{x, y, size, alpha, shade}] in pixels. At c = 0 every grain is
 * home (and invisible: the solid hand is drawn instead); as c grows the grains drift outward, falling a little, wobbling; as it falls they flow home.
 * Grains leave in a staggered order so the hand crumbles rather than pops.
 */
export function swarmGrains(lm, c, t, handIndex = 0, hands = 1) {
  const out = [];
  if (!(c > 0.01)) return out;
  const palm = dist(lm[5], lm[17]);
  if (!(palm > 0)) return out;
  for (let i = handIndex; i < GRAINS.length; i += hands) {
    const g = GRAINS[i], home = grainHome(lm, g, palm);
    const e = smooth(Math.min(1, Math.max(0, (c - g.delay * 0.35) / 0.65)));
    const sway = Math.sin(t * 3 + g.phase) * 0.1, bob = Math.cos(t * 2.3 + g.phase * 1.7) * 0.08;
    out.push({
      x: home.x + (Math.cos(g.ang) * g.rad + sway) * palm * e,
      y: home.y + (Math.sin(g.ang) * g.rad * 0.7 + 0.5 * g.rad + bob) * palm * e,     // + a pull toward the ground
      size: g.size, alpha: Math.min(1, c * 3), shade: g.shade,
    });
  }
  return out;
}
