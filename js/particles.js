// Particle effects for cosmetics: small canvas effects that ride on the puppet (see COSMETICS.md).
// An item names EFFECTS presets (it cannot carry code); this module validates them, spawns, updates and draws them.
// Cheap on purpose: one global cap, no gradients, no shadow blur, no timers of its own (the caller's frame loop drives update/draw),
// nothing at all under reduced motion except a still snapshot.

export const MAX_PARTICLES = 90;                     // for the whole system, however many items are equipped
export const MAX_EMITTERS = 6;

/** The presets an item may use. life = seconds [min, max]; speed in palm-widths per second; size in 1/60 of a palm width. */
export const EFFECTS = Object.freeze({
  sparks: { kind: 'spark', life: [0.18, 0.4], speed: [1.5, 4], size: 6, gravity: 0 },     // short jagged bolts: electricity
  glow: { kind: 'glow', life: [0.7, 1.3], speed: [0, 0.2], size: 16, gravity: 0 },         // a soft pulsing halo
  embers: { kind: 'ember', life: [0.7, 1.4], speed: [0.4, 1], size: 2.2, gravity: -1.2 },  // little dots that float up
  glint: { kind: 'glint', life: [0.3, 0.6], speed: [0, 0], size: 5, gravity: 0 },          // a twinkling star
});
export const WHERE = ['tips', 'knuckles', 'palm', 'hand'];
export const TRIGGERS = ['snap'];
const COLOR = /^#[0-9a-fA-F]{3,8}$/;

/** Checks an item's `particles` list; throws an Error that says what is wrong. Returns clean emitters. */
export function parseParticles(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list) || list.length > 4) throw new Error('particles: a list of at most 4 emitters');
  return list.map((e, i) => {
    const at = 'particles[' + i + ']';
    if (!e || !Object.hasOwn(EFFECTS, e.effect)) throw new Error(at + ': effect must be one of ' + Object.keys(EFFECTS).join(', '));
    if (typeof e.color !== 'string' || !COLOR.test(e.color)) throw new Error(at + ': color must be a #hex colour');
    const where = e.where === undefined ? 'tips' : e.where;
    if (!WHERE.includes(where)) throw new Error(at + ': where must be one of ' + WHERE.join(', '));
    const rate = e.rate === undefined ? 0 : e.rate;
    if (!(typeof rate === 'number' && rate >= 0 && rate <= 40)) throw new Error(at + ': rate must be 0-40 per second');
    const trigger = e.trigger === undefined ? null : e.trigger;
    if (trigger !== null && !TRIGGERS.includes(trigger)) throw new Error(at + ': trigger must be one of ' + TRIGGERS.join(', '));
    const burst = e.burst === undefined ? 0 : e.burst;
    if (!(Number.isInteger(burst) && burst >= 0 && burst <= 30)) throw new Error(at + ': burst must be a whole number 0-30');
    if (!rate && !(trigger && burst)) throw new Error(at + ': needs a rate, or a trigger with a burst');
    return { effect: e.effect, color: e.color, where, rate, trigger, burst };
  });
}

const reducedNow = () => typeof matchMedia === 'function' && !!matchMedia('(prefers-reduced-motion: reduce)').matches;

function mulberry32(a) {                              // a tiny seeded random: the same picture every time it is drawn
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const seedOf = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

const TIP_IDS = [4, 8, 12, 16, 20], KNUCKLE_IDS = [5, 9, 13, 17], PALM_IDS = [0, 5, 9, 13, 17];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Where an emitter's particles appear on one hand (21 {x, y} pixel points): a random point of the named place. */
function anchor(where, lm, rnd) {
  if (where === 'palm') {
    let x = 0, y = 0; for (const i of PALM_IDS) { x += lm[i].x; y += lm[i].y; }
    return { x: x / PALM_IDS.length + (rnd() - 0.5) * 10, y: y / PALM_IDS.length + (rnd() - 0.5) * 10 };
  }
  const ids = where === 'tips' ? TIP_IDS : where === 'knuckles' ? KNUCKLE_IDS : null;
  const p = ids ? lm[ids[Math.floor(rnd() * ids.length)]] : lm[Math.floor(rnd() * 21)];
  return { x: p.x, y: p.y };
}
const handScale = lm => Math.max(0.3, dist(lm[5], lm[17]) / 60);     // pixels per skin unit: effects follow the size of the hand

export class ParticleSystem {
  constructor({ max = MAX_PARTICLES, reduced = reducedNow, random = Math.random } = {}) {
    this.max = max; this.reduced = reduced; this.rnd = random;
    this.list = []; this.emitters = []; this.carry = [];
  }

  /** Replaces the emitters (from an equipped loadout). Live particles keep fading out. */
  setEmitters(emitters) {
    this.emitters = (emitters || []).slice(0, MAX_EMITTERS);
    this.carry = this.emitters.map(() => 0);
  }
  get active() { return this.emitters.length > 0; }

  spawn(em, lm, rnd) {
    if (this.list.length >= this.max) return;
    const fx = EFFECTS[em.effect], s = handScale(lm), a = anchor(em.where, lm, rnd);
    const ang = rnd() * Math.PI * 2, sp = (fx.speed[0] + rnd() * (fx.speed[1] - fx.speed[0])) * 60 * s;
    const life = fx.life[0] + rnd() * (fx.life[1] - fx.life[0]);
    this.list.push({ kind: fx.kind, color: em.color, x: a.x, y: a.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp + (fx.gravity ? fx.gravity * 60 * s : 0), g: fx.gravity * 60 * s,
      size: fx.size * s, life, age: 0, rot: rnd() * 6.28 });
  }

  /** Advances time by [dt] seconds and emits continuous particles on every hand. [hands]: lists of 21 {x, y} pixel points. */
  update(dt, hands) {
    if (this.reduced()) { this.list.length = 0; return; }
    dt = Math.min(Math.max(dt, 0), 0.1);                 // a stalled frame must not spawn a flood
    for (const p of this.list) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt * 0.5; }
    this.list = this.list.filter(p => p.age < p.life);
    if (!hands?.length) return;
    this.emitters.forEach((em, i) => {
      if (!em.rate) return;
      this.carry[i] += em.rate * dt;
      while (this.carry[i] >= 1) { this.carry[i] -= 1; this.spawn(em, hands[Math.floor(this.rnd() * hands.length)], this.rnd); }
    });
  }

  /** A one-shot burst for every emitter that has this trigger (for example 'snap'). */
  trigger(name, hands) {
    if (this.reduced() || !hands?.length) return;
    for (const em of this.emitters) if (em.trigger === name) for (let k = 0; k < em.burst; k++) this.spawn(em, hands[k % hands.length], this.rnd);
  }

  draw(ctx) { if (this.list.length && !this.reduced()) drawParticles(ctx, this.list); }
  clear() { this.list.length = 0; }
}

/** Draws particles ({kind, x, y, vx, vy, size, life, age, color, rot}). Only lines, arcs and fills. */
export function drawParticles(ctx, list) {
  ctx.save();
  ctx.lineCap = 'round';
  for (const p of list) {
    const t = p.age / p.life, fade = 1 - t;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.kind === 'glow' ? Math.sin(Math.PI * t) * 0.35 : fade));
    if (p.kind === 'spark') {
      const L = p.size * 2.2, n = Math.hypot(p.vx, p.vy) || 1, dx = p.vx / n, dy = p.vy / n;
      ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, p.size * 0.28);
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + dx * L * 0.5 - dy * L * 0.22, p.y + dy * L * 0.5 + dx * L * 0.22);   // a little zig-zag, like a bolt
      ctx.lineTo(p.x + dx * L, p.y + dy * L); ctx.stroke();
    } else if (p.kind === 'glow') {
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.7 + 0.6 * t), 0, 7); ctx.fill();
    } else if (p.kind === 'glint') {
      const r = p.size * (1 - Math.abs(0.5 - t) * 1.2);
      ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, p.size * 0.22);
      ctx.beginPath(); ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x + r, p.y); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x, p.y + r); ctx.stroke();
    } else {                                                                              // ember
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, p.size), 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * A still picture of the effects for a finished drawing (the reveal pictures are not animated): a fixed sample of each emitter,
 * and the trigger bursts as if just fired. The same [seed] always gives the same picture. Allowed under reduced motion (it is a still).
 */
export function snapshot(ctx, emitters, hands, seed = 'x') {
  if (!emitters?.length || !hands?.length) return 0;
  const rnd = mulberry32(seedOf(seed)), sys = new ParticleSystem({ max: 60, reduced: () => false, random: rnd });
  sys.setEmitters(emitters.slice(0, MAX_EMITTERS));
  for (const em of sys.emitters) {
    const n = em.trigger ? em.burst : Math.min(8, Math.max(2, Math.round(em.rate)));
    for (let k = 0; k < n; k++) sys.spawn(em, hands[k % hands.length], rnd);
  }
  for (const p of sys.list) { p.age = p.life * (0.1 + rnd() * 0.5); p.x += p.vx * p.age; p.y += p.vy * p.age; }
  drawParticles(ctx, sys.list);
  return sys.list.length;
}
