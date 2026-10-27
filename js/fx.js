// Visual effects, all drawn in code (a canvas for particles, CSS for flashes and shakes). No image or video files.
//  - the animation loop (requestAnimationFrame) runs only while there are particles, and the particle count is capped
//  - the device's "reduce motion" setting is honoured: no shake, no flash, far fewer and slower particles, no transitions
//  - everything is non-interactive (pointer-events: none) and removes itself

const MAX_PARTICLES = 140;                       // cap: keeps a mid-range phone smooth even in a long combo
const reduceQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reducedMotion = () => !!reduceQuery?.matches;

let root = null, canvas = null, ctx2 = null;
let parts = [];
let raf = 0, last = 0;

/** [gameEl] gets the shake / flash / wipe; the particle canvas is a full-screen overlay so confetti also works on the result screen. */
export function initFx(gameEl) {
  try {
    root = gameEl;
    canvas = document.createElement('canvas');
    canvas.id = 'fxCanvas';
    canvas.setAttribute?.('aria-hidden', 'true');
    document.body.append(canvas);
    ctx2 = canvas.getContext?.('2d') || null;
    globalThis.addEventListener?.('resize', fit);
    fit();
  } catch { ctx2 = null; }          // effects are decoration: if they can't start, the game still runs
}

function fit() {
  if (!canvas || !root) return;
  const w = globalThis.innerWidth || 360, h = globalThis.innerHeight || 640;
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 1.5);       // a 1.5x canvas is plenty for sparks and saves fill-rate
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  canvas.dataset.dpr = String(dpr);
}

function add(p) { if (parts.length < MAX_PARTICLES) parts.push(p); }

function loop(now) {
  raf = 0;
  if (!ctx2) { parts = []; return; }
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  const dpr = Number(canvas.dataset.dpr) || 1;
  ctx2.clearRect(0, 0, canvas.width, canvas.height);
  parts = parts.filter(p => (p.life -= dt) > 0);
  for (const p of parts) {
    p.vy += p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.vr * dt;
    const a = Math.max(0, Math.min(1, p.life / p.max));
    ctx2.globalAlpha = a;
    ctx2.fillStyle = p.color;
    ctx2.save();
    ctx2.translate(p.x * dpr, p.y * dpr);
    ctx2.rotate(p.rot);
    if (p.shape === 'streak') ctx2.fillRect(-p.size * 2 * dpr, -dpr, p.size * 4 * dpr, 2 * dpr);
    else if (p.shape === 'rect') ctx2.fillRect(-p.size * dpr, -p.size * 0.5 * dpr, p.size * 2 * dpr, p.size * dpr);
    else { ctx2.beginPath(); ctx2.arc(0, 0, p.size * dpr, 0, 6.3); ctx2.fill(); }
    ctx2.restore();
  }
  ctx2.globalAlpha = 1;
  if (parts.length) raf = requestAnimationFrame(loop);
  else ctx2.clearRect(0, 0, canvas.width, canvas.height);
}
function kick() { if (!raf && parts.length && ctx2 && typeof requestAnimationFrame === 'function') { last = performance.now(); raf = requestAnimationFrame(loop); } }

/** Sparks flying out of a landed hit at (x, y) (pixels inside the game area). [power] 1 = normal, 2 = knock-out. */
function burst_(x, y, { color = '#fde047', power = 1 } = {}) {
  const calm = reducedMotion();
  const n = Math.round((calm ? 6 : 22) * power);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, v = (calm ? 60 : 140 + Math.random() * 260) * (0.7 + power * 0.3);
    add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: calm ? 0 : 420, rot: a, vr: (Math.random() - 0.5) * 12,
      life: calm ? 0.5 : 0.45 + Math.random() * 0.4, max: 0.85, size: 2 + Math.random() * 3 * power,
      color: i % 3 === 0 ? '#ffffff' : color, shape: i % 2 ? 'streak' : 'dot' });
  }
  kick();
}

/** Confetti from the top for a win. */
function confetti_() {
  const w = globalThis.innerWidth || 360;
  const n = reducedMotion() ? 0 : 70;
  const cols = ['#fde047', '#f97316', '#22d3ee', '#f472b6', '#a3e635', '#ffffff'];
  for (let i = 0; i < n; i++) {
    add({ x: Math.random() * w, y: -10 - Math.random() * 60, vx: (Math.random() - 0.5) * 90, vy: 60 + Math.random() * 140, g: 90,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 9, life: 2 + Math.random() * 1.5, max: 3.5, size: 3 + Math.random() * 3,
      color: cols[i % cols.length], shape: 'rect' });
  }
  kick();
}

/** Slow grey streaks falling, for a loss. */
function rain_() {
  const w = globalThis.innerWidth || 360;
  const n = reducedMotion() ? 0 : 50;
  for (let i = 0; i < n; i++) {
    add({ x: Math.random() * w, y: -20 - Math.random() * 120, vx: -20, vy: 220 + Math.random() * 160, g: 0, rot: 1.45,
      vr: 0, life: 1.6 + Math.random(), max: 2.6, size: 4 + Math.random() * 4, color: '#94a3b8', shape: 'streak' });
  }
  kick();
}

// ---- CSS-driven pieces ----------------------------------------------------------------------------------------

/** A short white flash over the arena. Skipped entirely for reduced motion. */
function flash_(strength = 1) {
  if (!root || reducedMotion()) return;
  root.style.setProperty('--flash', String(Math.min(0.85, 0.3 + strength * 0.25)));
  root.classList.remove('flash'); void root.offsetWidth; root.classList.add('flash');
  setTimeout(() => root.classList.remove('flash'), 450);
}

/** Screen shake scaled by [strength] (about 0.5 = tap, 1 = hit, 2 = knock-out). */
function shake_(strength = 1) {
  if (!root || reducedMotion()) return;
  const px = Math.round(3 + 5 * Math.min(2.5, strength));
  root.style.setProperty('--sh', px + 'px');
  root.style.setProperty('--shd', (0.25 + 0.15 * Math.min(2.5, strength)).toFixed(2) + 's');
  root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake');
  setTimeout(() => root.classList.remove('shake'), 700);
}

function floating(cls, text, x, y, ms) {
  const fx = document.getElementById('fx');
  if (!fx) return;
  const d = document.createElement('div');
  d.className = cls; d.textContent = text;
  d.style.left = x + 'px'; d.style.top = y + 'px';
  fx.append(d);
  setTimeout(() => d.remove(), ms);
}

/** "COMBO x3": a pulsing label next to the fighter that is on a streak. */
function combo_(n, x, y) {
  floating('combo' + (reducedMotion() ? ' calm' : ''), 'COMBO x' + n, x, y - 70, 1100);
}

/** A bar that wipes across the arena between rounds. Skipped for reduced motion. */
function wipe_() {
  if (!root || reducedMotion()) return;
  const d = document.createElement('div');
  d.className = 'wipe';
  root.append(d);
  setTimeout(() => d.remove(), 700);
}

export function clearFx() { parts = []; if (ctx2 && canvas) ctx2.clearRect(0, 0, canvas.width, canvas.height); }

// Effects are decoration: whatever goes wrong inside one, the match must carry on.
const safe = fn => (...a) => { try { return fn(...a); } catch { return undefined; } };
export const burst = safe(burst_), confetti = safe(confetti_), rain = safe(rain_), flash = safe(flash_), shake = safe(shake_), combo = safe(combo_), wipe = safe(wipe_);
