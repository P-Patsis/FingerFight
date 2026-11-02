// Hands that are DRAWN BY A SMALL PROGRAM from one or two numbers instead of being a fixed file: the Geometric hand (how many facets, `gc` 1-5) and the Painting hand
// (a random seed, `sd`). The output is an ordinary skin in the normal format and goes through the same parseSkin checks as any file, so nothing from outside
// ever reaches the canvas except a validated integer that picks the shapes. The same numbers always give the same hand, on every phone.

export const GC_MIN = 1, GC_MAX = 5, GC_DEFAULT = 3;
export const SD_MAX = 999999;
export const cleanGc = n => (Number.isInteger(n) && n >= GC_MIN && n <= GC_MAX ? n : null);
export const cleanSd = n => (Number.isInteger(n) && n >= 0 && n <= SD_MAX ? n : null);
export const newSeed = (rand = Math.random) => 1 + Math.floor(rand() * (SD_MAX - 1));

const LEN = { thumb: [23, 21, 16.5], index: [26, 20, 15], middle: [30, 22, 16.5], ring: [27, 20, 15], pinky: [21, 15, 11.5] };
const HALF = { thumb: [8.5, 8, 7.4], index: [7, 6.6, 6.2], middle: [7.4, 7, 6.5], ring: [7, 6.6, 6.1], pinky: [6, 5.6, 5.2] };
const PALM_REF = { wrist: [50, 100], index: [20, 38], pinky: [80, 46] };
const PALM_D = 'M 30 106 C 16 94 8 76 8 56 C 8 42 14 33 24 31 L 76 38 C 86 40 90 48 88 60 C 86 78 76 94 70 106 Z';
const f2 = v => String(Math.round(v * 100) / 100);
const poly = pts => 'M ' + pts.map(([x, y]) => f2(x) + ' ' + f2(y)).join(' L ') + ' Z';

/** A small seeded random generator (mulberry32): the same seed gives the same sequence everywhere. */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mix = (...n) => { let h = 2166136261; for (const v of n) { h ^= (v | 0) + 0x9e3779b9; h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

// ---- Geometric: low-poly facets. Level 1 = a few chunky blocks, level 5 = many small facets.
const CELLS = { 1: [1, 1], 2: [1, 2], 3: [1, 3], 4: [2, 2], 5: [2, 3] };                 // [rows, columns] per finger segment (2 triangles per cell, 12 shapes at most)
const PALM_FAN = { 1: 6, 2: 8, 3: 9, 4: 10, 5: 12 };                                      // triangles in the palm
const PALM_PTS = [[30, 106], [18, 94], [10, 76], [8, 56], [14, 38], [24, 31], [50, 34], [76, 38], [86, 46], [88, 62], [80, 86], [70, 106]];
const TONES = ['#7dd3fc', '#38bdf8', '#0ea5e9'], EDGE = '#0369a1';
const facet = (pts, tone, k) => ({ d: poly(pts), fill: TONES[Math.floor(k * 3) % 3], stroke: EDGE, strokeWidth: 1.5 });

function polySegment(f, i, level) {
  const w = HALF[f][i], L = LEN[f][i], [R, C] = CELLS[level], pt = [];
  for (let j = 0; j <= R; j++) {
    pt.push([]);
    for (let c = 0; c <= C; c++) {
      let x = -w + (2 * w * c) / C, y = -(L * j) / R;
      if (c > 0 && c < C) x += (mix(i, j, c, f.length) - 0.5) * w * 0.35;                // interior corners are nudged so the facets are not a neat grid
      if (j > 0 && j < R) y += (mix(c, j, i, 7) - 0.5) * L * 0.18;
      if (j === R && (c === 0 || c === C)) y += w * 0.5;                                  // chamfered top corners: angular, never round
      pt[j].push([x, y]);
    }
  }
  const out = [];
  for (let j = 0; j < R; j++) for (let c = 0; c < C; c++) {
    const a = pt[j][c], b = pt[j][c + 1], d = pt[j + 1][c], e = pt[j + 1][c + 1];
    const tris = (j + c) % 2 ? [[a, b, d], [b, e, d]] : [[a, b, e], [a, e, d]];
    tris.forEach((t, k) => out.push(facet(t, 0, mix(i, j, c, k + f.length * 3))));
  }
  return out;
}
function polyPalm(level) {
  const n = PALM_FAN[level], pts = [];
  for (let k = 0; k < n; k++) pts.push(PALM_PTS[Math.round((k * PALM_PTS.length) / n) % PALM_PTS.length]);
  const cx = 50 + (mix(level, 1) - 0.5) * 8, cy = 70 + (mix(level, 2) - 0.5) * 8, out = [];
  for (let k = 0; k < n; k++) out.push(facet([pts[k], pts[(k + 1) % n], [cx, cy]], 0, mix(level, k, 5)));
  return out;
}

// ---- Painting: an abstract painted hand, every part covered in seeded brush work in a seeded palette.
function paintPalette(r) {
  const h0 = r() * 360, pal = [];
  for (let k = 0; k < 5; k++) pal.push(hsl(h0 + k * (60 + r() * 40), 0.6 + r() * 0.25, 0.45 + r() * 0.2));
  return pal;
}
function hsl(h, s, l) {
  const H = ((h % 360) + 360) % 360, c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((H / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = H < 60 ? [c, x, 0] : H < 120 ? [x, c, 0] : H < 180 ? [0, c, x] : H < 240 ? [0, x, c] : H < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
const blob = (cx, cy, rx, ry) => `M ${f2(cx - rx)} ${f2(cy)} A ${f2(rx)} ${f2(ry)} 0 1 0 ${f2(cx + rx)} ${f2(cy)} A ${f2(rx)} ${f2(ry)} 0 1 0 ${f2(cx - rx)} ${f2(cy)} Z`;
function brush(r, pal, x0, y0, x1, y1, wmin, wmax, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const kind = r();
    const col = pal[Math.floor(r() * pal.length)];
    const ax = x0 + r() * (x1 - x0), ay = y0 + r() * (y1 - y0);
    if (kind < 0.45) out.push({ d: blob(ax, ay, wmin + r() * (wmax - wmin), wmin + r() * (wmax - wmin)), fill: col, opacity: 0.55 + r() * 0.4 });
    else if (kind < 0.85) { const bx = x0 + r() * (x1 - x0), by = y0 + r() * (y1 - y0); out.push({ d: `M ${f2(ax)} ${f2(ay)} Q ${f2((ax + bx) / 2 + (r() - 0.5) * 12)} ${f2((ay + by) / 2 + (r() - 0.5) * 12)} ${f2(bx)} ${f2(by)}`, stroke: col, strokeWidth: +f2(wmin + r() * wmax * 0.8), opacity: 0.7 + r() * 0.3 }); }
    else out.push({ d: blob(ax, ay, 1 + r() * 1.5, 1 + r() * 1.5), fill: col });
  }
  return out;
}
const cap = (w, L) => `M ${-w} 0 L ${-w} ${-L} A ${w} ${w} 0 0 1 ${w} ${-L} L ${w} 0 A ${w} ${w} 0 0 1 ${-w} 0 Z`;
function paintSegment(f, i, r, pal) {
  const w = HALF[f][i], L = LEN[f][i];
  return [{ d: cap(w, L), fill: pal[Math.floor(r() * 2)], stroke: '#1f2937', strokeWidth: 2 }, ...brush(r, pal, -w * 0.7, -L * 0.95, w * 0.7, -L * 0.1, 1.5, w * 0.55, 5)];
}
function paintPalm(r, pal) {
  return [{ d: PALM_D, fill: pal[0], stroke: '#1f2937', strokeWidth: 2.5 }, ...brush(r, pal, 14, 40, 84, 100, 4, 13, 10)];
}

function build(id, name, palm, segment, meta) {
  const parts = { palm: { ref: PALM_REF, shapes: palm } };
  for (const f of Object.keys(LEN)) for (let i = 0; i < 3; i++) parts[`${f}_${['base', 'mid', 'tip'][i]}`] = { length: LEN[f][i], shapes: segment(f, i) };
  return { format: 1, id, name, author: 'Finger Fight', license: 'CC0 (made for Finger Fight)', parts, overlays: [], ...meta };
}

export const GEOMETRIC_META = { category: 'scifi', tint: { default: '#38bdf8', map: { '#38bdf8': 'main', '#7dd3fc': 'light', '#0ea5e9': 'mid', '#0369a1': 'dark' },
  swatches: ['#ef4444', '#f97316', '#facc15', '#22c55e', '#22d3ee', '#3b82f6', '#a855f7', '#ec4899', '#f8fafc'] } };
export const PAINTING_META = { category: 'human' };

export function geometricJson(level = GC_DEFAULT) {
  const l = cleanGc(level) || GC_DEFAULT;
  return build('lowpoly', 'Geometric', polyPalm(l), (f, i) => polySegment(f, i, l), GEOMETRIC_META);
}
export function paintingJson(seed = 1) {
  const s = cleanSd(seed) ?? 1, r = rng(s * 7919 + 13), pal = paintPalette(r);
  const palm = paintPalm(r, pal), segs = {};
  for (const f of Object.keys(LEN)) for (let i = 0; i < 3; i++) segs[f + i] = paintSegment(f, i, r, pal);
  return build('painting', 'Painting', palm, (f, i) => segs[f + i], PAINTING_META);
}

/** The generators by skin id: id -> (params) -> skin JSON. [params]: {gc, sd}. */
export const GENERATED = Object.freeze({ lowpoly: p => geometricJson(p.gc), painting: p => paintingJson(p.sd) });
/** The numbers that must travel with a picture of this hand so the opponent draws the same one (nothing for other hands). */
export const paramsKey = (id, p) => (id === 'lowpoly' ? 'gc' + (cleanGc(p.gc) || GC_DEFAULT) : id === 'painting' ? 'sd' + (cleanSd(p.sd) ?? 1) : '');
