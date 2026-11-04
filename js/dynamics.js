// Live, per-hand state for the puppet: things that need to remember the last frames. All of it is DRAWING ONLY (it reads the landmarks the
// tracker already produced and never changes them), runs inside the existing tracking loop (no timers of its own) and is cheap:
//   stretch   how straight each finger is, smoothed so dynamic nails / claws / hooks do not flicker, plus a hysteresis "shown" flag per finger
//   back      which side of the hand faces the camera, held steady (the tracker's left / right label and the knuckle geometry flicker; a nail
//             that appears and vanishes every other frame is the flicker this fixes)
//   ends      physics for floppy extended fingers (hotdog): each link end follows its ideal place on a damped spring, so the finger lags behind
//             the hand, overshoots and settles with a little bounce
//   animTime  seconds for the idle animations (pulse, spin, drift, blink); frozen under reduced motion
// Pictures that are not live (the opponent's reveal, previews) have no HandDynamics: they are computed from the landmarks alone and are still.
import { FINGER_NAMES, fingerExtension, activeExtend, extensionPieces } from './puppet.js';

export const DYN = Object.freeze({
  STRETCH_S: 0.07,      // smoothing time of the finger stretch
  SHOW_ON: 0.22,        // a hidden dynamic item reappears above this stretch ...
  SHOW_OFF: 0.08,       // ... and hides below this one (hysteresis: no flicker near the edge)
  BACK_FRAMES: 6,       // frames in a row the other side must be seen before the hand is considered turned over
  SPRING_K: 140,        // physics: stiffness (1/s^2)
  SPRING_C: 11,         // physics: damping (1/s); with K = 140 this is a damping ratio ~0.46: a visible overshoot, then it settles
  SLOW_DT: 0.05,        // average frame time (s) above which spring physics switches itself off (below ~20 fps)
});

export const motionStyle = { strength: 5 };
export function setMotionStrength(n) {
  if (!Number.isInteger(n) || n < 0 || n > 10) return false;
  motionStyle.strength = n; return true;
}

const reducedNow = () => typeof matchMedia === 'function' && !!matchMedia('(prefers-reduced-motion: reduce)').matches;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class HandDynamics {
  constructor({ reduced = reducedNow } = {}) {
    this.reduced = reduced;
    this.ext = {}; this.shown = {}; this.ends = {};
    this.back = undefined; this.#flip = 0;
    this.animTime = null;                  // null = still (reduced motion or not started)
    this.avgDt = 0.016; this.t = 0;
    this.vel = {};
  }
  #flip;

  get animStrength() { return motionStyle.strength / 5; }

  /** Spring physics is allowed: reduced motion off and the frame rate fine. */
  get animating() { return !this.reduced() && this.avgDt < DYN.SLOW_DT; }

  /** Smoothed "is the back of this hand to the camera": [raw] is true / false / undefined from handBack() for this frame. */
  stableBack(raw) {
    if (raw === undefined || raw === null) return this.back;
    if (this.back === undefined || this.back === null) { this.back = raw; this.#flip = 0; return raw; }
    if (raw === this.back) this.#flip = 0;
    else if (++this.#flip >= DYN.BACK_FRAMES) { this.back = raw; this.#flip = 0; }
    return this.back;
  }

  /**
   * One analysed frame. [lm]: this hand's 21 {x, y} pixel points; [dt]: seconds since the last frame; [skin], [layers]: what is drawn (for the
   * extension physics); [rawBack]: handBack() for this frame.
   */
  update(lm, dt, skin, layers = [], rawBack = undefined) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    if (dt > 0) this.avgDt += (Math.min(dt, 0.2) - this.avgDt) * 0.1;
    if (rawBack !== undefined) this.stableBack(rawBack);
    const a = dt > 0 ? 1 - Math.exp(-dt / DYN.STRETCH_S) : 1;
    for (const f of FINGER_NAMES) {
      const target = fingerExtension(lm, f);
      this.ext[f] = f in this.ext ? this.ext[f] + (target - this.ext[f]) * a : target;
      const was = this.shown[f] ?? true;
      this.shown[f] = was ? this.ext[f] > DYN.SHOW_OFF : this.ext[f] > DYN.SHOW_ON;
    }
    // Idle shape transforms are cheap even when camera inference is below 20 fps.
    // Keep their clock independent of the spring-physics safety cutoff.
    if (!this.reduced()) { this.t += dt; this.animTime = this.t; } else this.animTime = null;
    const ext = activeExtend(skin, layers);
    if (ext && ext.physics && this.animating && dt > 0) this.#physics(lm, dt, ext);
    else this.ends = {};
    return this;
  }

  /** Follow-the-leader springs: every link end is pulled toward where it would be on a stiff finger, and kept one link-length from the one before. */
  #physics(lm, dt, ext) {
    const steps = Math.max(1, Math.ceil(dt / 0.016)), h = dt / steps;
    const ends = {};
    for (const f of ext.fingers) {
      const ideal = extensionPieces(lm, f, ext);
      if (!ideal.length) { delete this.vel[f]; continue; }
      let st = this.vel[f];
      if (!st || st.p.length !== ideal.length || ideal.some((q, k) => dist(st.p[k], q.ideal) > q.len * 4)) {       // first frame, or the hand jumped: start at rest
        st = this.vel[f] = { p: ideal.map(q => ({ x: q.ideal.x, y: q.ideal.y })), v: ideal.map(() => ({ x: 0, y: 0 })) };
      }
      for (let s = 0; s < steps; s++) {
        let prev = ideal[0].a;
        ideal.forEach((q, k) => {
          const p = st.p[k], v = st.v[k];
          v.x += (DYN.SPRING_K * (q.ideal.x - p.x) - DYN.SPRING_C * v.x) * h;
          v.y += (DYN.SPRING_K * (q.ideal.y - p.y) - DYN.SPRING_C * v.y) * h;
          p.x += v.x * h; p.y += v.y * h;
          const dx = p.x - prev.x, dy = p.y - prev.y, d = Math.hypot(dx, dy) || 1e-9, ux = dx / d, uy = dy / d;
          p.x = prev.x + ux * q.len; p.y = prev.y + uy * q.len;                           // a link keeps its length ...
          const along = v.x * ux + v.y * uy; v.x -= along * ux; v.y -= along * uy;       // ... and a rigid link has no speed along itself: only the swing is kept (this is what keeps a sudden jump of the hand from flinging the finger)
          prev = p;
        });
      }
      ends[f] = st.p.map(p => ({ x: p.x, y: p.y }));
    }
    this.ends = ends;
  }
}
