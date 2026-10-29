// The puppet hand: a 2D rig that poses a SKIN (a set of named vector parts, see SKINS.md) on the 21 MediaPipe landmarks.
// Pure geometry first (rigPlan: no canvas, testable), then a thin canvas renderer. No camera pixels, no 3D, no dependencies.
//
// Landmarks: 0 wrist; thumb 1-4; index 5-8; middle 9-12; ring 13-16; pinky 17-20 (MCP, PIP, DIP, TIP for the fingers).
// Every finger is three segments (base, mid, tip) between consecutive landmarks; the palm is one shape mapped onto the
// triangle wrist / index knuckle / pinky knuckle; each segment is a shape whose pivot is its origin and which points up (-y).

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

function parseShapes(list, where) {
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
  return { id: json.id, name, author: typeof json.author === 'string' ? json.author.slice(0, 40) : '', parts, overlays, order };
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
 * Where every part of [skin] goes for one hand. [lm]: 21 {x, y} points in PIXELS. Returns [{part, m, shapes}] in draw
 * order, ready for the renderer (overlays follow the part they belong to, in that part's transform). Hands that cannot
 * be posed (collapsed or missing points) give an empty plan.
 */
export function rigPlan(lm, skin) {
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
  for (const name of skin.order) {
    if (!matrices[name]) continue;
    plan.push({ part: name, m: matrices[name], shapes: skin.parts[name].shapes });
    for (const o of skin.overlays) if (o.part === name) plan.push({ part: name + '+', m: matrices[name], shapes: o.shapes });
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
export function drawPlan(ctx, plan) {
  if (typeof Path2D === 'undefined') return;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const step of plan) {
    ctx.setTransform(...step.m);
    for (const s of step.shapes) {
      const p = pathOf(s);
      ctx.globalAlpha = s.opacity;
      if (s.fill !== 'none') { ctx.fillStyle = s.fill; ctx.fill(p); }
      if (s.stroke !== 'none' && s.strokeWidth > 0) { ctx.lineWidth = s.strokeWidth; ctx.strokeStyle = s.stroke; ctx.stroke(p); }
    }
  }
  ctx.restore();                                         // restores the caller's transform and alpha
}

/** One call: pose [skin] on each hand ([hands]: lists of 21 {x, y} pixel points) and draw it. */
export function drawPuppet(ctx, hands, skin) {
  for (const lm of hands) drawPlan(ctx, rigPlan(lm, skin));
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
