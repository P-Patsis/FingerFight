// The puppet hand: a 2D rig that poses a SKIN (a set of named vector parts, see SKINS.md) on the 21 MediaPipe landmarks.
// Pure geometry first (rigPlan: no canvas, testable), then a thin canvas renderer. No camera pixels, no 3D, no dependencies.
//
// Landmarks: 0 wrist; thumb 1-4; index 5-8; middle 9-12; ring 13-16; pinky 17-20 (MCP, PIP, DIP, TIP for the fingers).
// Every finger is three segments (base, mid, tip) between consecutive landmarks; the palm is one shape mapped onto the
// triangle wrist / index knuckle / pinky knuckle; each segment is a shape whose pivot is its origin and which points up (-y).

import { parseMeta } from './layers.js';

export const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'];
export const SEGMENT_NAMES = ['base', 'mid', 'tip'];
/** Landmark ids at the start of each finger chain: [first joint, ..., tip]. The thumb chain starts at its CMC joint (1). */
export const CHAIN = { thumb: [1, 2, 3, 4], index: [5, 6, 7, 8], middle: [9, 10, 11, 12], ring: [13, 14, 15, 16], pinky: [17, 18, 19, 20] };
export const PART_NAMES = ['palm', ...FINGER_NAMES.flatMap(f => SEGMENT_NAMES.map(s => f + '_' + s))];
/** Draw order when a skin does not give its own: palm first, then thumb, then each finger from base to tip. */
export const DEFAULT_ORDER = PART_NAMES;

/** part name -> [from landmark, to landmark] for the 15 segments. */
export const SEGMENTS = Object.fromEntries(FINGER_NAMES.flatMap(f => SEGMENT_NAMES.map((s, i) => [f + '_' + s, [CHAIN[f][i], CHAIN[f][i + 1]]])));

const COLOR = /^(none|#[0-9a-fA-F]{3,8})$/;                      // plain colours only: no url(), no named references
const PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]{1,4000}$/;      // path data only
const num = v => typeof v === 'number' && Number.isFinite(v);
const pt = v => Array.isArray(v) && v.length === 2 && v.every(num);

export function parseShapes(list, where) {
  if (!Array.isArray(list) || !list.length || list.length > 12) throw new Error(where + ': shapes must be a list of 1-12 shapes');
  return list.map((s, i) => {
    const at = where + ' shape ' + i;
    if (!s || typeof s.d !== 'string' || !PATH.test(s.d)) throw new Error(at + ': "d" must be SVG path data');
    for (const k of ['fill', 'stroke']) if (s[k] !== undefined && !(typeof s[k] === 'string' && COLOR.test(s[k]))) throw new Error(at + ': ' + k + ' must be a #colour or "none"');
    if (s.strokeWidth !== undefined && !(num(s.strokeWidth) && s.strokeWidth >= 0 && s.strokeWidth <= 40)) throw new Error(at + ': strokeWidth must be 0-40');
    if (s.opacity !== undefined && !(num(s.opacity) && s.opacity >= 0 && s.opacity <= 1)) throw new Error(at + ': opacity must be 0-1');
    return { d: s.d, fill: s.fill ?? 'none', stroke: s.stroke ?? 'none', strokeWidth: s.strokeWidth ?? 0, opacity: s.opacity ?? 1 };
  });
}

// ---- rig extensions: a web membrane between fingers, and fingers drawn PAST the tip ---------------------------------------
// Both are optional skin fields, and both are DRAWING ONLY: rigPlan reads the landmarks and never changes them, so finger counting
// (gestures.js, which reads the tracker's landmarks) cannot be affected.
//   "web":    { "fill": "#6dbf4b", "stroke": "#2f6b36", "strokeWidth": 1.6, "opacity": 0.95, "reach": 0.7, "scallop": 0.25 }
//   "extend": { "len": 0.9, "pieces": 3, "droop": 1.2, "fingers": ["index", ...] }   (a skin or a layer item)
// A web is one membrane per gap (index-middle, middle-ring, ring-pinky), anchored on the landmarks of BOTH neighbouring fingers, so it spans
// the gap however far the fingers spread. An extension continues each finger beyond its tip landmark along the finger's own direction, in
// `pieces` links that turn toward screen-down by `droop` radians in total, drawn with the base hand's own mid / tip shapes (so it always
// matches the hand's colours, shape and recolouring).
export const WEB_GAPS = Object.freeze([['index', 'middle'], ['middle', 'ring'], ['ring', 'pinky']]);
const WEB_ROOT = 0.04;                                   // the membrane starts just past the knuckle landmark (a share of the finger length)

const inRange = (v, lo, hi) => num(v) && v >= lo && v <= hi;
/** Checks a skin's "web" (missing = no web = null). */
export function parseWeb(w, id = 'skin') {
  if (w === undefined || w === null) return null;
  if (typeof w !== 'object' || Array.isArray(w)) throw new Error(id + ': web must be an object');
  if (typeof w.fill !== 'string' || !/^#[0-9a-fA-F]{3,8}$/.test(w.fill)) throw new Error(id + ': web.fill must be a #colour');
  if (w.stroke !== undefined && !(typeof w.stroke === 'string' && COLOR.test(w.stroke))) throw new Error(id + ': web.stroke must be a #colour or "none"');
  if (w.strokeWidth !== undefined && !inRange(w.strokeWidth, 0, 40)) throw new Error(id + ': web.strokeWidth must be 0-40');
  if (w.opacity !== undefined && !inRange(w.opacity, 0, 1)) throw new Error(id + ': web.opacity must be 0-1');
  if (w.reach !== undefined && !inRange(w.reach, 0.2, 1)) throw new Error(id + ': web.reach must be 0.2-1');
  if (w.scallop !== undefined && !inRange(w.scallop, 0, 0.6)) throw new Error(id + ': web.scallop must be 0-0.6');
  return { fill: w.fill, stroke: w.stroke ?? 'none', strokeWidth: w.strokeWidth ?? 0, opacity: w.opacity ?? 1, reach: w.reach ?? 0.7, scallop: w.scallop ?? 0.25 };
}
/** Checks an "extend" (missing = none = null). */
export function parseExtend(e, id = 'skin') {
  if (e === undefined || e === null) return null;
  if (typeof e !== 'object' || Array.isArray(e)) throw new Error(id + ': extend must be an object');
  if (!inRange(e.len, 0.05, 2)) throw new Error(id + ': extend.len must be 0.05-2 (a share of the finger length)');
  const pieces = e.pieces === undefined ? 3 : e.pieces;
  if (!(Number.isInteger(pieces) && pieces >= 1 && pieces <= 4)) throw new Error(id + ': extend.pieces must be a whole number 1-4');
  const droop = e.droop === undefined ? 0 : e.droop;
  if (!inRange(droop, 0, 2)) throw new Error(id + ': extend.droop must be 0-2 (radians)');
  const fingers = e.fingers === undefined ? FINGER_NAMES.slice() : e.fingers;
  if (!Array.isArray(fingers) || !fingers.length || fingers.some((f, i) => !FINGER_NAMES.includes(f) || fingers.indexOf(f) !== i)) throw new Error(id + ': extend.fingers must list finger names once each');
  return { len: e.len, pieces, droop, fingers: fingers.slice() };
}
/** Checks a skin's "sand" (the grains of a sand hand; see js/sand.js). Missing = not a sand hand = null. */
export function parseSand(s, id = 'skin') {
  if (s === undefined || s === null) return null;
  if (typeof s !== 'object' || Array.isArray(s)) throw new Error(id + ': sand must be an object');
  for (const k of ['color', 'color2']) if (typeof s[k] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(s[k])) throw new Error(id + ': sand.' + k + ' must be #rrggbb');
  return { color: s.color.toLowerCase(), color2: s.color2.toLowerCase() };
}

/**
 * Checks a skin file's JSON and returns the normalised skin; throws an Error that says what is wrong.
 * A part may be {"use": "other_part"} to share another part's definition (one finger shape for all fingers).
 */
export function parseSkin(json) {
  if (!json || typeof json !== 'object') throw new Error('skin: not an object');
  if (json.format !== 1) throw new Error('skin: unknown format ' + json.format);
  if (typeof json.id !== 'string' || !/^[a-z]{1,12}$/.test(json.id)) throw new Error('skin: id must be 1-12 lower-case letters');
  const name = typeof json.name === 'string' && json.name.trim() ? json.name.trim().slice(0, 24) : json.id;
  const parts = {};
  for (const p of PART_NAMES) {
    let def = json.parts?.[p];
    for (let hops = 0; def && def.use !== undefined && hops < 4; hops++) def = json.parts?.[def.use];
    if (!def || def.use !== undefined) throw new Error('skin ' + json.id + ': missing part ' + p);
    const out = { shapes: parseShapes(def.shapes, p) };
    if (p === 'palm') {
      const r = def.ref;
      if (!r || !pt(r.wrist) || !pt(r.index) || !pt(r.pinky)) throw new Error('skin ' + json.id + ': palm.ref needs wrist, index and pinky points');
      const det = (r.index[0] - r.wrist[0]) * (r.pinky[1] - r.wrist[1]) - (r.index[1] - r.wrist[1]) * (r.pinky[0] - r.wrist[0]);
      if (Math.abs(det) < 1) throw new Error('skin ' + json.id + ': palm.ref points must not be in a line');
      out.ref = { wrist: r.wrist, index: r.index, pinky: r.pinky };
    } else {
      if (!(num(def.length) && def.length > 0 && def.length <= 1000)) throw new Error('skin ' + json.id + ': ' + p + '.length must be a positive number');
      out.length = def.length;
    }
    parts[p] = out;
  }
  const overlays = (json.overlays || []).map((o, i) => {
    if (!o || !PART_NAMES.includes(o.part)) throw new Error('skin ' + json.id + ': overlay ' + i + ' names an unknown part');
    return { part: o.part, shapes: parseShapes(o.shapes, 'overlay ' + i) };
  });
  const order = json.order === undefined ? DEFAULT_ORDER : json.order;
  if (!Array.isArray(order) || order.some(p => !PART_NAMES.includes(p))) throw new Error('skin ' + json.id + ': order must list known part names');
  return { id: json.id, name, author: typeof json.author === 'string' ? json.author.slice(0, 40) : '', parts, overlays, order, web: parseWeb(json.web, json.id), extend: parseExtend(json.extend, json.id), sand: parseSand(json.sand, json.id), ...parseMeta(json, 'base') };
}

// ---- rig math (pixel space in, canvas matrices out) --------------------------------------------------------------------

/** 3 reference points -> 3 target points, as a canvas matrix [a, b, c, d, e, f] (handles rotation, scale, skew and mirroring). */
export function affineFrom3(r0, r1, r2, p0, p1, p2) {
  const r1x = r1[0] - r0[0], r1y = r1[1] - r0[1], r2x = r2[0] - r0[0], r2y = r2[1] - r0[1];
  const p1x = p1.x - p0.x, p1y = p1.y - p0.y, p2x = p2.x - p0.x, p2y = p2.y - p0.y;
  const det = r1x * r2y - r1y * r2x;
  if (Math.abs(det) < 1e-9) return null;
  const a = (p1x * r2y - p2x * r1y) / det, c = (p2x * r1x - p1x * r2x) / det;
  const b = (p1y * r2y - p2y * r1y) / det, d = (p2y * r1x - p1y * r2x) / det;
  return [a, b, c, d, p0.x - (a * r0[0] + c * r0[1]), p0.y - (b * r0[0] + d * r0[1])];
}

/** Matrix that puts a segment's pivot (0,0) on A and its end (0,-length) on B, with its width scaled by [sx]. */
export function segmentMatrix(A, B, length, sx) {
  const dx = B.x - A.x, dy = B.y - A.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const ux = dx / len, uy = dy / len;                   // local "up" (0,-1) must point along A->B
  const sin = ux, cos = -uy, sy = len / length;
  return [cos * sx, sin * sx, -sin * sy, cos * sy, A.x, A.y];
}

/**
 * Which side of the hand an item is on: 'back' (nail polish always; a tattoo may say so), 'palm', or 'both' (rings, gloves, most tattoos).
 * [back]: true = the back of this hand faces the camera (nails show), false = the palm faces it (nails hidden), undefined = not known
 * (simulator poses, old pictures): everything is drawn, as before.
 */
export function sideOf(L) { return L.layer === 'nails' ? 'back' : L.side || 'both'; }
export function sideShown(L, back) {
  const side = sideOf(L);
  if (side === 'both' || back === undefined || back === null) return true;
  return side === 'back' ? back === true : back === false;
}
/** HandLandmarker's "Left" / "Right" label assumes a MIRRORED image, but the camera frame is not mirrored (the page mirrors only the display), so the real hand is the other one.
 *  If a phone test shows nails on the palm side, flip this constant. */
export const LABEL_MIRRORED = true;
/**
 * Which way a hand faces: true = the BACK of the hand is toward the camera, false = the palm is, undefined = cannot tell.
 * [lm]: 21 points of the raw (unmirrored) camera image, y down. [side]: the model's 'Left' / 'Right' label. The two knuckle edges and the wrist
 * give a turn direction (cross product) that flips when the hand is turned over; it also differs between a left and a right hand, hence the label.
 * Derived: a RIGHT hand with its palm to the camera has the thumb side on the image right, giving a negative cross; a LEFT hand the opposite.
 */
export function handBack(lm, side) {
  if (side !== 'Left' && side !== 'Right') return undefined;
  if (!Array.isArray(lm) || lm.length < 21 || !lm[0] || !lm[5] || !lm[17]) return undefined;
  const cross = (lm[5].x - lm[0].x) * (lm[17].y - lm[0].y) - (lm[5].y - lm[0].y) * (lm[17].x - lm[0].x);
  if (!Number.isFinite(cross) || Math.abs(cross) < 1e-6) return undefined;
  const real = LABEL_MIRRORED ? (side === 'Right' ? 'Left' : 'Right') : side;
  const palm = real === 'Right' ? cross < 0 : cross > 0;
  return !palm;
}

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const f1 = v => Math.round(v * 10) / 10;
const at = p => f1(p.x) + ' ' + f1(p.y);
const clamp01 = v => Math.min(1, Math.max(0, v));

/** The part of a finger's landmark chain between fractions [s0] and [s1] of its length, as points (the joints in between are kept, so it follows a curled finger). */
export function chainSlice(lm, finger, s0, s1) {
  const pts = CHAIN[finger].map(i => lm[i]), seg = [];
  let total = 0;
  for (let k = 0; k < pts.length - 1; k++) { seg.push(dist2(pts[k], pts[k + 1])); total += seg[k]; }
  const pointAt = s => {
    let d = clamp01(s) * total;
    for (let k = 0; k < seg.length; k++) {
      if (d <= seg[k] || k === seg.length - 1) { const t = seg[k] > 0 ? Math.min(1, d / seg[k]) : 0; return { x: pts[k].x + (pts[k + 1].x - pts[k].x) * t, y: pts[k].y + (pts[k + 1].y - pts[k].y) * t }; }
      d -= seg[k];
    }
  };
  const out = [pointAt(s0)];
  let acc = 0;
  for (let k = 0; k < seg.length - 1; k++) { acc += seg[k]; const s = total > 0 ? acc / total : 0; if (s > s0 + 1e-6 && s < s1 - 1e-6) out.push(pts[k + 1]); }
  out.push(pointAt(s1));
  return out;
}

/**
 * The web membranes of one hand (pure geometry, pixel points in and out): one per gap between neighbouring fingers. Each is a polygon whose
 * two long sides are slices of the neighbouring fingers' own landmark chains (so it is pinned to both fingers and stretches / contracts as they
 * spread or close) and whose free edge is a scallop curve dipping back toward the knuckles. Returns [{pair, fill, edge}] as path data in pixel space.
 */
export function webGeometry(lm, web) {
  const out = [];
  for (const [fa, fb] of WEB_GAPS) {
    const A = chainSlice(lm, fa, WEB_ROOT, web.reach), B = chainSlice(lm, fb, WEB_ROOT, web.reach);
    const a0 = A[0], a1 = A[A.length - 1], b0 = B[0], b1 = B[B.length - 1];
    const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 }, m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
    const k = web.scallop * 2;                           // the curve's middle ends up `scallop` of the way from the free edge to the knuckles
    const c = { x: m1.x + (m0.x - m1.x) * k, y: m1.y + (m0.y - m1.y) * k };
    const edge = 'M ' + at(a1) + ' Q ' + at(c) + ' ' + at(b1);
    const fill = 'M ' + A.map(at).join(' L ') + ' Q ' + at(c) + ' ' + at(b1) + ' L ' + B.slice(0, -1).reverse().map(at).join(' L ') + ' Z';
    out.push({ pair: [fa, fb], fill, edge });
  }
  return out;
}

/**
 * The links of one finger's extension past its tip landmark (pure geometry): [{a, b, last}], a and b the link's two end points in pixels.
 * The first link starts ON the tip landmark and runs along the finger's direction (dip -> tip); each following link turns toward screen-down
 * (gravity) a little more, `droop` radians in all, so a floppy finger sags. A finger that is folded over shortens its extension (a fist does not
 * sprout long fingers). Returns [] for a finger that cannot be posed. The landmarks are only read.
 */
export function extensionPieces(lm, finger, ext) {
  const ids = CHAIN[finger], pts = ids.map(i => lm[i]);
  if (pts.some(p => !p || !num(p.x) || !num(p.y))) return [];
  let chain = 0;
  for (let k = 0; k < 3; k++) chain += dist2(pts[k], pts[k + 1]);
  let dx = pts[3].x - pts[2].x, dy = pts[3].y - pts[2].y;
  const dl = Math.hypot(dx, dy);
  if (!(dl > 1e-6) || !(chain > 0)) return [];
  dx /= dl; dy /= dl;
  const straight = dist2(pts[0], pts[3]) / chain;
  const total = ext.len * chain * (0.3 + 0.7 * clamp01((straight - 0.4) / 0.5));
  const n = ext.pieces, L = total / n, out = [];
  let x = pts[3].x, y = pts[3].y;
  for (let k = 0; k < n; k++) {
    const want = ext.droop * 2 * (k + 1) / (n * (n + 1));            // the steps add up to `droop`, growing toward the end
    const angle = Math.atan2(Math.abs(dx), dy);                      // angle between the direction and screen-down (0 = already hanging)
    const turn = Math.min(want, angle), sgn = dx >= 0 ? 1 : -1, cos = Math.cos(turn * sgn), sin = Math.sin(turn * sgn);
    [dx, dy] = [dx * cos - dy * sin, dx * sin + dy * cos];
    const nx = x + dx * L, ny = y + dy * L;
    out.push({ a: { x, y }, b: { x: nx, y: ny }, last: k === n - 1 });
    x = nx; y = ny;
  }
  return out;
}

/** The extension that applies to a hand: the last worn item that has one, else the skin's own. Null = none. */
export function activeExtend(skin, layers = []) {
  for (let i = layers.length - 1; i >= 0; i--) if (layers[i]?.extend) return layers[i].extend;
  return skin?.extend || null;
}
/** Where an extension reaches, as pixel points (for fitting a picture so the long fingers are not cut off). */
export function extensionEnds(lm, skin, layers = []) {
  const ext = activeExtend(skin, layers), out = [];
  if (!ext || !Array.isArray(lm) || lm.length < 21 || lm.slice(0, 21).some(p => !p || !num(p.x) || !num(p.y))) return out;
  for (const f of ext.fingers) for (const p of extensionPieces(lm, f, ext)) out.push(p.b);
  return out;
}
const IDENTITY = [1, 0, 0, 1, 0, 0];
/** Plan steps for one hand's extension of [fingers]: each link is the hand's own mid (inner links) or tip (last link) shape for that finger. */
function extensionSteps(lm, skin, ext, sx, finger, tag) {
  const steps = [];
  for (const p of extensionPieces(lm, finger, ext)) {
    const part = skin.parts[finger + (p.last ? '_tip' : '_mid')];
    const m = segmentMatrix(p.a, p.b, part.length, sx);
    if (m) steps.push({ part: finger + '_ext' + tag, m, shapes: part.shapes });
  }
  return steps;
}

/**
 * Where every part of [skin] goes for one hand. [lm]: 21 {x, y} points in PIXELS. Returns [{part, m, shapes}] in draw
 * order, ready for the renderer (overlays follow the part they belong to, in that part's transform). Hands that cannot
 * be posed (collapsed or missing points) give an empty plan.
 */
export function rigPlan(lm, skin, layers = [], back) {
  if (!Array.isArray(lm) || lm.length < 21 || lm.slice(0, 21).some(p => !p || !num(p.x) || !num(p.y))) return [];
  const palm = skin.parts.palm;
  const ref = palm.ref;
  const refW = Math.hypot(ref.index[0] - ref.pinky[0], ref.index[1] - ref.pinky[1]);
  const palmW = Math.hypot(lm[5].x - lm[17].x, lm[5].y - lm[17].y);
  if (!(refW > 0) || !(palmW > 0)) return [];
  const sx = palmW / refW;                              // finger thickness follows the size of the hand, lengths follow the landmarks
  const matrices = {};
  matrices.palm = affineFrom3(ref.wrist, ref.index, ref.pinky, lm[0], lm[5], lm[17]);
  for (const [name, [a, b]] of Object.entries(SEGMENTS)) matrices[name] = segmentMatrix(lm[a], lm[b], skin.parts[name].length, sx);
  const plan = [];
  const itemExt = layers.some(L => L?.extend), skinExt = !itemExt && skin.extend;            // a worn item's extension replaces the hand's own
  let webDone = !skin.web;
  const pushWeb = () => {                                // the membrane sits just over the palm and under every finger
    webDone = true;
    const shape = (d, fill, stroke, w) => ({ d, fill, stroke, strokeWidth: w * sx, opacity: skin.web.opacity });
    for (const g of webGeometry(lm, skin.web)) {
      plan.push({ part: 'web', m: IDENTITY, shapes: [shape(g.fill, skin.web.fill, 'none', 0)] });
      if (skin.web.stroke !== 'none' && skin.web.strokeWidth > 0) plan.push({ part: 'web', m: IDENTITY, shapes: [shape(g.edge, 'none', skin.web.stroke, skin.web.strokeWidth)] });
    }
  };
  for (const name of skin.order) {
    if (!matrices[name]) continue;
    if (!webDone && name !== 'palm') pushWeb();
    plan.push({ part: name, m: matrices[name], shapes: skin.parts[name].shapes });
    for (const o of skin.overlays) if (o.part === name) plan.push({ part: name + '+', m: matrices[name], shapes: o.shapes });
    if (skinExt && name.endsWith('_tip') && skinExt.fingers.includes(name.slice(0, -4))) plan.push(...extensionSteps(lm, skin, skinExt, sx, name.slice(0, -4), ''));
  }
  if (!webDone) pushWeb();
  // cosmetic layers (tattoo, nails, ring, glove...): one whole pass each, in z-order, so a glove covers a ring on ANY finger.
  // Each layer item gives shapes per named part; they ride the same matrices as the base hand's parts.
  for (const L of layers) {
    if (sideShown(L, back)) {
      for (const name of PART_NAMES) {
        const shapes = L.parts?.[name];
        if (shapes && matrices[name]) plan.push({ part: name + '@' + L.id, m: matrices[name], shapes });
      }
    }
    if (L.extend && L === layers.findLast(x => x?.extend)) for (const f of L.extend.fingers) plan.push(...extensionSteps(lm, skin, L.extend, sx, f, '@' + L.id));   // fingers longer than the tracked tip, in the hand's own colours
  }
  return plan;
}

// ---- canvas renderer ----------------------------------------------------------------------------------------------------

const pathCache = new WeakMap();                         // shape -> Path2D, built once per shape
function pathOf(shape) {
  let p = pathCache.get(shape);
  if (!p) { p = new Path2D(shape.d); pathCache.set(shape, p); }
  return p;
}

/** Draws a plan made by rigPlan. Needs Path2D (every browser); where it is missing nothing is drawn. */
export function drawPlan(ctx, plan, alpha = 1) {
  if (typeof Path2D === 'undefined' || !(alpha > 0.01)) return;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const step of plan) {
    ctx.setTransform(...step.m);
    for (const s of step.shapes) {
      const p = pathOf(s);
      ctx.globalAlpha = s.opacity * alpha;
      if (s.fill !== 'none') { ctx.fillStyle = s.fill; ctx.fill(p); }
      if (s.stroke !== 'none' && s.strokeWidth > 0) { ctx.lineWidth = s.strokeWidth; ctx.strokeStyle = s.stroke; ctx.stroke(p); }
    }
  }
  ctx.restore();                                         // restores the caller's transform and alpha
}

/** One call: pose [skin] on each hand ([hands]: lists of 21 {x, y} pixel points) and draw it. */
export function drawPuppet(ctx, hands, skin, layers = [], backs = [], alphas = null) {
  hands.forEach((lm, i) => drawPlan(ctx, rigPlan(lm, skin, layers, backs?.[i]), alphas?.[i] ?? 1));   // alphas: a sand hand that is crumbling fades as its grains take over
}

// ---- a pose for finger states (when there are no landmarks: simulator, filtered pictures, old clients) -----------------

const BASE_KNUCKLES = { index: [200, 520], middle: [300, 490], ring: [395, 510], pinky: [480, 570] };
const FINGER_UP = { index: [125, 95, 70], middle: [140, 105, 78], ring: [128, 95, 70], pinky: [98, 72, 55] };   // base, mid, tip lengths when raised
const SPLAY = { index: -0.10, middle: 0, ring: 0.08, pinky: 0.2 };

/**
 * A believable pose of a hand (palm to the camera, thumb on the left) as 21 [x, y] points, 0..1000 in y and 0..600 in x,
 * from which fingers are up. [shiftX] moves it sideways (to put two hands side by side), [mirror] flips it left-right.
 */
export function statesToLandmarks(st, shiftX = 0, mirror = false) {
  const lm = new Array(21);
  lm[0] = [300, 950];
  for (const f of ['index', 'middle', 'ring', 'pinky']) {
    const ids = CHAIN[f], [kx, ky] = BASE_KNUCKLES[f];
    lm[ids[0]] = [kx, ky];
    if (st[f]) {
      let x = kx, y = ky;
      FINGER_UP[f].forEach((len, i) => { x += Math.sin(SPLAY[f]) * len; y -= Math.cos(SPLAY[f]) * len; lm[ids[i + 1]] = [Math.round(x), Math.round(y)]; });
    } else {                                               // curled: up to the middle joint, then folded back down over the palm
      lm[ids[1]] = [kx, ky - 90]; lm[ids[2]] = [kx, ky - 20]; lm[ids[3]] = [kx, ky + 40];
    }
  }
  if (st.thumb) { lm[1] = [235, 830]; lm[2] = [165, 745]; lm[3] = [115, 660]; lm[4] = [80, 590]; }
  else { lm[1] = [235, 830]; lm[2] = [215, 740]; lm[3] = [275, 700]; lm[4] = [335, 725]; }
  return lm.map(([x, y]) => [Math.round((mirror ? 600 - x : x) + shiftX), y]);
}
