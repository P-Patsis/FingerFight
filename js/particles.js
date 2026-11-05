// Particle effects for cosmetics: small canvas effects that ride on the puppet (see COSMETICS.md).
// An item names EFFECTS presets (it cannot carry code); this module validates them, spawns, updates and draws them.
// Cheap on purpose: one global cap, no gradients, no shadow blur, no timers of its own (the caller's frame loop drives update/draw),
// nothing at all under reduced motion except a still snapshot.

import { SandMotion, sandPartAlphas, SAND } from './sand.js';

export const MAX_PARTICLES = 90;                     // for the whole system, however many items are equipped (a sand hand's swarm is counted inside it)
export const MAX_EMITTERS = 6;

/** The presets an item may use. life = seconds [min, max]; speed in palm-widths per second; size in 1/60 of a palm width. */
export const EFFECTS = Object.freeze({
  splash: { kind: 'splash', life: [0.7, 1.25], speed: [1.1, 2.4], size: 5, gravity: 1.4 },
  ripple: { kind: 'ripple', life: [0.7, 1.3], speed: [0, 0], size: 4, gravity: 0 },
  stone: { kind: 'stone', life: [1.3, 2.2], speed: [0.3, 1.4], size: 6, gravity: 2 },
  gust: { kind: 'gust', life: [0.8, 1.5], speed: [0, 0], size: 5, gravity: 0 },
  sparks: { kind: 'spark', life: [0.18, 0.4], speed: [1.5, 4], size: 6, gravity: 0 },     // short jagged bolts: electricity
  glow: { kind: 'glow', life: [0.7, 1.3], speed: [0, 0.2], size: 16, gravity: 0 },         // a soft pulsing halo
  embers: { kind: 'ember', life: [0.7, 1.4], speed: [0.4, 1], size: 2.2, gravity: -1.2 },  // little dots that float up
  glint: { kind: 'glint', life: [0.3, 0.6], speed: [0, 0], size: 5, gravity: 0 },          // a twinkling star
  bubbles: { kind: 'bubble', life: [1, 1.8], speed: [0.1, 0.3], size: 4.5, gravity: -0.5 }, // rings that drift up
  flame: { kind: 'flame', life: [0.55, 1], speed: [0.05, 0.3], size: 8, gravity: -2.4, jitter: 0.08 },      // a licking teardrop of fire that rises and shrinks
  grain: { kind: 'grain', life: [1, 1.8], speed: [0.04, 0.2], size: 1.5, gravity: 0.35, jitter: 0.1 },   // sand shed from the edge of the hand, drifting down
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

const palmCenter = lm => { const ids=[0,5,9,13,17]; return {x:ids.reduce((n,i)=>n+lm[i].x,0)/5,y:ids.reduce((n,i)=>n+lm[i].y,0)/5}; };

export class ParticleSystem {
  constructor({ max = MAX_PARTICLES, reduced = reducedNow, random = Math.random } = {}) {
    this.max = max; this.reduced = reduced; this.rnd = random;
    this.list = []; this.emitters = []; this.carry = [];
    this.element = null; this.elementAge = 0; this.lastEarth = 0; this.centers = []; this.velocities = [];
    this.sand = null; this.motions = []; this.hands = []; this.time = 0;       // a sand hand: per-hand shake state (js/sand.js)
  }

  /** Turns the sand hand on ({color, color2} from the skin) or off (null): the hand then crumbles when shaken and re-forms when it settles. */
  setSand(cfg) { this.sand = cfg ? { color: cfg.color, color2: cfg.color2, ...(cfg.chunks ? { chunks: true } : {}) } : null; this.motions = []; }
  setElement(mode) { mode = ['water','fire','earth','air'].includes(mode) ? mode : null; if (mode !== this.element) { this.element = mode; this.elementAge = 0; this.lastEarth = 0; this.centers = []; this.velocities = []; } }
  /** How much of each solid hand to draw (1 = all, 0 = all grains); 1 when there is no sand hand or reduced motion is on. */
  bodyAlphas() { return this.sand && !this.reduced() ? this.motions.map(m => m.body) : []; }
  partAlphas() { return this.sand && !this.reduced() ? this.motions.map(m => sandPartAlphas(m.c)) : null; }
  /** Grains of the swarm that exist right now (they count toward the cap with everything else). */
  get swarmSize() { return this.sand && this.motions.some(m => m.c > 0.01) ? SAND.GRAINS : 0; }

  /** Replaces the emitters (from an equipped loadout). Live particles keep fading out. */
  setEmitters(emitters) {
    this.emitters = (emitters || []).slice(0, MAX_EMITTERS);
    this.carry = this.emitters.map(() => 0);
  }
  get active() { return this.emitters.length > 0 || !!this.sand; }

  spawn(em, lm, rnd) {
    if (this.list.length + this.swarmSize >= this.max) return;
    const fx = EFFECTS[em.effect], s = handScale(lm), a = anchor(em.where, lm, rnd);
    if (fx.jitter) { a.x += (rnd() - 0.5) * 2 * fx.jitter * 60 * s; a.y += (rnd() - 0.5) * 2 * fx.jitter * 60 * s; }       // sand leaves from the EDGES, not the bones
    const ang = rnd() * Math.PI * 2, sp = (fx.speed[0] + rnd() * (fx.speed[1] - fx.speed[0])) * 60 * s;
    const life = fx.life[0] + rnd() * (fx.life[1] - fx.life[0]);
    const p = { kind: fx.kind, color: em.color, x: a.x, y: a.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp + (fx.gravity ? fx.gravity * 60 * s : 0), g: fx.gravity * 60 * s,
      size: fx.size * s * (em.size || 1), life, age: 0, rot: rnd() * 6.28 };
    const center=palmCenter(lm),palm=dist(lm[5],lm[17]),hand=this.hands.indexOf(lm),velocity=this.velocities[hand]||{x:0,y:0};
    if (['splash','stone','gust','ripple'].includes(p.kind) || (p.kind==='flame'&&this.element==='fire')) {
      const radius=palm*(0.7+rnd()*0.65);p.hand=hand;p.x=center.x+Math.cos(ang)*radius;p.y=center.y+Math.sin(ang)*radius*0.6;
      p.vx=Math.cos(ang)*palm*(0.7+rnd())+velocity.x*0.4;p.vy=Math.sin(ang)*palm*0.9-palm+velocity.y*0.3;p.g=palm*2.5;
      if(p.kind==='gust'||p.kind==='ripple'){p.cx=center.x;p.cy=center.y;p.radius=palm*(p.kind==='gust'?1.15+rnd()*0.7:0.95+rnd()*0.5);p.angle=ang;p.omega=(rnd()>0.5?1:-1)*(p.kind==='gust'?3.3:1.8);p.span=0.7+rnd()*0.6;p.vx=0;p.vy=0;p.g=0;}
      if(p.kind==='stone')p.home=[5,9,13,17][Math.floor(rnd()*4)];
      if(p.kind==='flame'){p.vy=-palm*(1.1+rnd()*1.8)+velocity.y*0.3;p.g=-palm*1.1;p.size*=1.5;p.life*=1.3;}
    }
    p.prevX=p.x;p.prevY=p.y;this.list.push(p);
  }

  /** Advances time by [dt] seconds and emits continuous particles on every hand. [hands]: lists of 21 {x, y} pixel points. */
  update(dt, hands) {
    if (this.reduced()) { this.list.length = 0; this.motions = []; return; }       // reduced motion: no collapse, no shedding: the static sand hand
    dt = Math.min(Math.max(dt, 0), 0.1);                 // a stalled frame must not spawn a flood
    this.time += dt;
    this.hands = hands || [];
    if(this.element){
      this.elementAge+=dt;
      const centers=this.hands.map(palmCenter);
      this.velocities=centers.map((p,i)=>{const old=this.centers[i],max=dist(this.hands[i][5],this.hands[i][17])*8;return old&&dt>0?{x:Math.max(-max,Math.min(max,(p.x-old.x)/dt)),y:Math.max(-max,Math.min(max,(p.y-old.y)/dt))}:{x:0,y:0};});
      this.centers=centers;
    }
    if (this.sand) {                                     // one shake detector per hand, fed by the landmarks the tracker already made
      this.motions.length = this.hands.length;
      const burst=this.element==='earth'&&this.elementAge>0.8&&(!this.lastEarth||this.elementAge-this.lastEarth>4.8);
      if(burst)this.lastEarth=this.elementAge;
      this.hands.forEach((lm,i)=>{const m=this.motions[i]??=new SandMotion();if(burst)m.burst();m.update(lm,dt,i,this.hands.length);});
    }
    // Reserve space as the swarm appears, including already-live shed particles.
    this.list.length = Math.min(this.list.length, Math.max(0, this.max - this.swarmSize));
    for (const p of this.list) {
      p.age+=dt;p.prevX=p.x;p.prevY=p.y;
      const lm=this.hands[p.hand],center=lm?palmCenter(lm):null;
      if(p.kind==='gust'||p.kind==='ripple'){
        if(center){const k=1-Math.exp(-dt*7);p.cx+=(center.x-p.cx)*k;p.cy+=(center.y-p.cy)*k;}
        p.angle+=p.omega*dt;p.x=p.cx+Math.cos(p.angle)*p.radius;p.y=p.cy+Math.sin(p.angle)*p.radius*0.6;
      }else if(p.kind==='stone'&&center&&p.age/p.life>0.5){
        const home=lm[p.home],steps=Math.max(1,Math.ceil(dt/0.016)),h=dt/steps;
        for(let k=0;k<steps;k++){p.vx+=((home.x-p.x)*64-p.vx*16)*h;p.vy+=((home.y-p.y)*64-p.vy*16)*h;p.x+=p.vx*h;p.y+=p.vy*h;}
      }else{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.g*dt*0.5;}
    }
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

  drawBackdrop(ctx) {
    if(this.reduced()||!['water','air'].includes(this.element))return;
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.lineCap='round';
    for(const lm of this.hands){const c=palmCenter(lm),r=dist(lm[5],lm[17])*1.5;
      for(let n=0;n<2;n++){const a=this.time*(n?1.25:-1.1)+n*2.5;
        ctx.beginPath();ctx.ellipse(c.x,c.y,r*(1+n*0.12),r*(0.5+n*0.1),0.2*Math.sin(this.time),a,a+2.2);
        ctx.globalAlpha=this.element==='water'?0.55:0.45;ctx.strokeStyle=this.element==='water'?'#38bdf8':'#c4f1ff';ctx.lineWidth=Math.max(3,r*(this.element==='water'?0.09:0.06));ctx.stroke();
        ctx.globalAlpha=0.8;ctx.strokeStyle='#e7fbff';ctx.lineWidth=Math.max(1,r*0.02);ctx.stroke();
      }
    }ctx.restore();
  }

  draw(ctx) {
    if (this.reduced()) return;
    if (this.list.length) drawParticles(ctx, this.list);
    if (this.sand && this.motions.length) {
      const grains = [];
      this.hands.forEach((_, i) => { if (this.motions[i]) grains.push(...this.motions[i].swarm.filter(Boolean)); });
      if (grains.length) drawGrains(ctx, grains, this.sand, Math.max(0.3, Math.hypot(this.hands[0][5].x - this.hands[0][17].x, this.hands[0][5].y - this.hands[0][17].y) / 60));
    }
  }
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
    } else if (p.kind === 'bubble') {
      ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, p.size * 0.22);
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, p.size * (0.8 + 0.5 * t)), 0, 7); ctx.stroke();
    } else if(p.kind==='splash'){
      const speed=Math.hypot(p.vx,p.vy)||1,ux=p.vx/speed,uy=p.vy/speed,r=p.size*(1-0.4*t),tail=Math.min(r*4,speed*0.045);
      ctx.fillStyle=p.color;ctx.beginPath();ctx.moveTo(p.x+ux*r*1.5,p.y+uy*r*1.5);ctx.quadraticCurveTo(p.x-uy*r,p.y+ux*r,p.x-ux*tail,p.y-uy*tail);ctx.quadraticCurveTo(p.x+uy*r,p.y-ux*r,p.x+ux*r*1.5,p.y+uy*r*1.5);ctx.fill();
      ctx.strokeStyle='#d8f8ff';ctx.lineWidth=Math.max(1,r*0.25);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-ux*tail*0.6,p.y-uy*tail*0.6);ctx.stroke();
    } else if(p.kind==='gust'||p.kind==='ripple'){
      const r=p.radius*(p.kind==='ripple'?1+t*0.3:1);ctx.beginPath();ctx.ellipse(p.cx,p.cy,r,r*0.6,0.1,p.angle,p.angle+p.span);
      ctx.strokeStyle=p.color;ctx.lineWidth=Math.max(2,p.size*(p.kind==='gust'?1.7:1));ctx.stroke();ctx.strokeStyle='#effcff';ctx.lineWidth=Math.max(1,p.size*0.3);ctx.stroke();
    } else if(p.kind==='stone'){
      const r=p.size,pts=Array.from({length:5},(_,i)=>{const a=p.rot+p.age+i*Math.PI*2/5;return{x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r*0.8};});
      ctx.fillStyle=p.color;ctx.beginPath();pts.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();ctx.fill();ctx.fillStyle='#d9bf8f';ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);ctx.lineTo(pts[1].x,pts[1].y);ctx.lineTo(p.x,p.y);ctx.closePath();ctx.fill();
    } else if (p.kind === 'flame') {
      const r = Math.max(2, p.size * (1 - 0.65 * t)), wob = Math.sin(p.age * 16 + p.rot) * r * 0.22;
      ctx.globalAlpha = Math.max(0, 0.9 * (1 - t * t));
      ctx.fillStyle = p.color; ctx.beginPath();
      ctx.moveTo(p.x + wob, p.y - r * 1.7); ctx.quadraticCurveTo(p.x + r * 1.1, p.y - r * 0.2, p.x, p.y + r * 0.7);
      ctx.quadraticCurveTo(p.x - r * 1.1, p.y - r * 0.2, p.x + wob, p.y - r * 1.7); ctx.fill();
    } else if (p.kind === 'grain') {
      ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else {                                                                              // ember
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, p.size), 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}

/** Draws the swarm of a crumbled sand hand: small shaded grains in three tones (fills only, no extra particles). */
export function drawGrains(ctx, grains, sand, scale) {
  ctx.save();
  const dark = '#' + sand.color.replace('#', '').match(/../g).map(h => Math.round(parseInt(h, 16) * 0.68).toString(16).padStart(2, '0')).join('');
  for (const g of grains) {
    const s = Math.max(1.5, g.size * scale * 1.7);
    if(sand.chunks&&g.shade===2){
      const r=s*2.8;ctx.globalAlpha=g.alpha;ctx.fillStyle=dark;ctx.beginPath();ctx.moveTo(g.x-r*0.5,g.y-r*0.25);ctx.lineTo(g.x-r*0.1,g.y-r*0.55);ctx.lineTo(g.x+r*0.6,g.y-r*0.15);ctx.lineTo(g.x+r*0.35,g.y+r*0.4);ctx.lineTo(g.x-r*0.4,g.y+r*0.45);ctx.closePath();ctx.fill();
      ctx.fillStyle=sand.color2;ctx.beginPath();ctx.moveTo(g.x-r*0.5,g.y-r*0.25);ctx.lineTo(g.x-r*0.1,g.y-r*0.55);ctx.lineTo(g.x+r*0.6,g.y-r*0.15);ctx.lineTo(g.x,g.y);ctx.closePath();ctx.fill();continue;
    }
    ctx.globalAlpha = g.alpha;
    ctx.fillStyle = g.shade === 2 ? dark : g.shade ? sand.color2 : sand.color;
    ctx.fillRect(g.x - s / 2, g.y - s / 2, s, s * (g.shade === 2 ? 0.7 : 1));
    if (g.shade !== 2) { ctx.globalAlpha = g.alpha * 0.55; ctx.fillStyle = sand.color2; ctx.fillRect(g.x - s / 2, g.y - s / 2, Math.max(0.7, s * 0.5), Math.max(0.7, s * 0.25)); }
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
