// Pictures of a hand that never contain camera pixels: the puppet and the skeleton, drawn from finger data / landmarks.
// A hand is described by which fingers are up: {thumb, index, middle, ring, pinky} (see gestures.js fingerStates).
import { normalizeView } from './logic.js';
import { drawPuppet, statesToLandmarks, extensionEnds } from './puppet.js';
import { HandDynamics } from './dynamics.js';
import { getSkin } from './skins.js';
import { resolveLoadout } from './cosmetics.js';
import { snapshot } from './particles.js';
import { cleanColor, SKELETON_STYLE_IDS, DEFAULT_SKELETON_STYLE } from './layers.js';

// (The hand itself is the puppet: puppet.js poses a swappable skin from skins.js on the landmarks.)

/** The skeleton lines' default colour; the player can pick another (a plain #rrggbb, also sent to the opponent as `sk`). */
export const SKELETON_COLOR = '#22d3ee';
/**
 * One skeleton hand in a style. [P]: the 21 joints in pixels ({x, y}); [lw]: the base line width; [color]: the bone colour (plain #rrggbb).
 * Plain strokes and fills only (no shadow blur: that is slow on phones); the glow is a wide faint stroke under the line.
 */
export function drawBones(ctx, P, color, lw, style = DEFAULT_SKELETON_STYLE) {
  const id = SKELETON_STYLE_IDS.includes(style) ? style : DEFAULT_SKELETON_STYLE;
  const col = cleanColor(color) || SKELETON_COLOR;
  const width = { classic: 1, thin: 0.45, bold: 2.1, dashed: 1.2, glow: 1, joints: 0.55 }[id] * lw;
  const stroke = () => { for (const [a, b] of BONES) { ctx.beginPath(); ctx.moveTo(P[a].x, P[a].y); ctx.lineTo(P[b].x, P[b].y); ctx.stroke(); } };
  if (id === 'glow') {
    ctx.save(); ctx.globalAlpha = 0.28; ctx.lineWidth = lw * 4; ctx.lineCap = 'round'; ctx.strokeStyle = col; stroke(); ctx.restore();
  }
  ctx.lineWidth = width; ctx.strokeStyle = col;
  if (id === 'dashed') ctx.setLineDash?.([lw * 2.2, lw * 1.6]);
  stroke();
  if (id === 'dashed') ctx.setLineDash?.([]);
  const r = { classic: 1.1, thin: 0.9, bold: 1.5, dashed: 1.4, glow: 1.1, joints: 2.6 }[id] * lw;
  ctx.fillStyle = id === 'joints' ? col : id === 'glow' ? '#ffffff' : '#fbbf24';
  for (const p of P) { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, r), 0, 7); ctx.fill(); }
  if (id === 'joints') { ctx.fillStyle = '#fbbf24'; for (const p of P) { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.2, r * 0.4), 0, 7); ctx.fill(); } }
}

export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];   // numbering order for the little labels

/** Splits a total (0..10) over two hands, filling index, middle, ring, pinky, thumb on each. 0 is one closed fist. */
export function statesFromCount(count) {
  const order = ['index', 'middle', 'ring', 'pinky', 'thumb'];
  const n = Math.max(0, Math.min(10, Math.round(count)));
  const hands = [];
  if (n === 0) return [{ thumb: false, index: false, middle: false, ring: false, pinky: false }];
  for (let left = n; left > 0; left -= 5) {
    const up = Math.min(5, left);
    const st = { thumb: false, index: false, middle: false, ring: false, pinky: false };
    for (let i = 0; i < up; i++) st[order[i]] = true;
    hands.push(st);
  }
  return hands;
}

/** Little numbered discs above the raised fingertips: 1, 2, 3 ... */
export function annotate(ctx, tips, r) {
  ctx.save();
  ctx.font = 'bold ' + Math.round(r * 1.5) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  tips.forEach((t, i) => {
    const y = Math.max(r + 1, t.y - r * 1.4);
    ctx.beginPath(); ctx.arc(t.x, y, r, 0, 7); ctx.fillStyle = '#0f172a'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fde047'; ctx.stroke();
    ctx.fillStyle = '#fde047'; ctx.fillText(String(i + 1), t.x, y + 1);
  });
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Skeleton picture: the hand's 21 landmarks drawn on a plain backdrop (no camera pixels)
// ---------------------------------------------------------------------------------------------
export const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
export const TIP_ID = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };

/**
 * Fits the hand(s) to a w x h picture, not the camera frame: a far-away hand is a small box inside a big frame, so the
 * bounding box of all points is scaled up to fill the area (aspect kept; [ar] = the frame's width / height, so nothing is
 * stretched). Returns a function from a landmark [x, y] (0..1000 units) to a pixel {x, y}.
 */
function fitter(lms, w, h, ar, pad, extra = []) {
  const xs = [...lms.flat(), ...extra].map(p => p[0] * ar), ys = [...lms.flat(), ...extra].map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const bw = Math.max(maxX - minX, 40), bh = Math.max(maxY - minY, 40);       // floor: a single point must not blow up
  const k = Math.min((w * (1 - 2 * pad)) / bw, (h * (1 - 2 * pad)) / bh);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return p => ({ x: w / 2 + (p[0] * ar - cx) * k, y: h / 2 + (p[1] - cy) * k });
}

function raisedTips(lms, hands, px) {
  const tips = [];
  lms.forEach((hand, hi) => { const st = hands[hi]; if (st) for (const f of FINGERS) if (st[f]) { const P = px(hand[TIP_ID[f]]); tips.push({ finger: f, x: P.x, y: P.y }); } });
  return tips;
}

/**
 * [lms]: up to two hands of 21 integer [x, y] points in 0..1000 (the camera frame). [hands]: finger states, used
 * to number the raised fingertips. [ar]: the camera frame's width / height, so the drawing is not stretched.
 */
export function drawSkeletonPicture(ctx, w, h, lms, hands, ar, withNumbers = true, color = SKELETON_COLOR, style = DEFAULT_SKELETON_STYLE) {
  ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h);
  const px = fitter(lms, w, h, ar, 0.1);
  lms.forEach(hand => drawBones(ctx, hand.map(px), color, Math.max(2, h * 0.016), style));
  const tips = raisedTips(lms, hands, px);
  if (withNumbers) annotate(ctx, tips, Math.max(8, h * 0.07));
  return tips;
}

/** Where fingers drawn past their tips end (as [x, y] landmark units), so the fitted picture leaves room for them. */
function reachOf(lms, ar, skin, layers) {
  const out = [];
  for (const hand of lms) for (const p of extensionEnds(hand.map(([x, y]) => ({ x: x * ar, y })), skin, layers)) out.push([p.x / ar, p.y]);
  return out;
}

/** Puppet picture: the skin posed on the landmarks, fitted to the picture like the skeleton (a little more room: it is wider than the bones). */
export function drawPuppetPicture(ctx, w, h, lms, hands, ar, skin, withNumbers = true, rec = null) {
  if (!rec?.noBg) { ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h); }       // noBg: the caller already painted the background (it draws under a transform)
  const px = fitter(lms, w, h, ar, 0.16, reachOf(lms, ar, skin, rec?.layers || []));
  const pts = lms.map(hand => hand.map(px));
  if (rec?.jolt) for (const hand of pts) for (const p of hand) { p.x += rec.jolt.x; p.y += rec.jolt.y; }        // the preview's demo shake (decoration)
  const hd = rec?.hd ? pts.map((hand, i) => (rec.hd[i] ??= new HandDynamics()).update(hand, rec.dt || 0, skin, rec.layers || [])) : null;   // a live preview: animations and physics run
  drawPuppet(ctx, pts, skin, rec?.layers || [], rec?.backs, rec?.alphas, hd);
  if (rec?.emitters?.length && !rec.live) snapshot(ctx, rec.emitters, pts, rec.seed || 'pic');   // a still of the effects; live previews animate them instead
  const tips = raisedTips(lms, hands, px);
  if (withNumbers) annotate(ctx, tips, Math.max(8, h * 0.07));
  return tips;
}

/** Profile preview: how my current choice looks to the viewer, drawn with the selected skin from a sample open hand.
 *  Photo views get a stand-in "camera picture" (a plain silhouette, never my real camera) with the hand drawn over it.
 *  Returns what was drawn: { camera: bool, hand: 'puppet' | 'skeleton' }. */
export function drawViewPreview(ctx, w, h, mode, skin, rec = null, skel = SKELETON_COLOR, skelStyle = DEFAULT_SKELETON_STYLE) {
  const puppet = String(mode).endsWith('puppet');
  const camera = String(mode).startsWith('photo');
  const lms = [statesToLandmarks({ thumb: true, index: true, middle: true, ring: true, pinky: true })];
  if (!camera) {
    if (puppet) drawPuppetPicture(ctx, w, h, lms, [], 1, skin, false, rec); else drawSkeletonPicture(ctx, w, h, lms, [], 1, false, skel, skelStyle);
    return { camera, hand: puppet ? 'puppet' : 'skeleton' };
  }
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#475569'); g.addColorStop(1, '#1e293b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#64748b';                                         // a head and shoulders, to read as "a camera picture of you"
  ctx.beginPath(); ctx.arc(w * 0.2, h * 0.32, h * 0.16, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(w * 0.2, h * 0.95, w * 0.17, h * 0.34, 0, 0, 7); ctx.fill();
  const px = fitter(lms, w * 0.6, h, 1, puppet ? 0.16 : 0.1, puppet ? reachOf(lms, 1, skin, rec?.layers || []) : []);        // the hand sits in the right 60% of the picture
  const at = p => { const q = px(p); return { x: q.x + w * 0.4, y: q.y }; };
  if (puppet) { const pts = lms.map(hand => hand.map(at)); drawPuppet(ctx, pts, skin, rec?.layers || [], rec?.backs); if (rec?.emitters?.length && !rec.live) snapshot(ctx, rec.emitters, pts, 'preview'); }
  else {
    for (const hand of lms) drawBones(ctx, hand.map(at), skel, Math.max(2, h * 0.016), skelStyle);
  }
  return { camera, hand: puppet ? 'puppet' : 'skeleton' };
}

/** The sender's landmarks, or a pose made from the finger states when there are none (simulator, filtered or old messages). */
export function landmarksOf(msg) {
  if (Array.isArray(msg.lm) && msg.lm.length) return { lms: msg.lm, ar: msg.ar || 1 };
  const hands = Array.isArray(msg.hands) ? msg.hands.slice(0, 2) : [];
  return { lms: hands.map((st, i) => statesToLandmarks(st, i * 700, i === 1)), ar: 1 };
}

/**
 * Draws the picture for a reveal/guess message onto [ctx] (w x h) WITHOUT using any image from the sender: the skeleton
 * views draw the bones, every other view the puppet in the sender's skin (this phone's copy of it). The photo itself, when
 * there is one, is shown by the caller; this is what appears when there is none (no hand, photos switched off).
 */
export function drawFromMessage(ctx, w, h, msg) {
  const view = normalizeView(msg.view) || 'puppet';
  const { lms, ar } = landmarksOf(msg);
  if (!lms.length) {
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#94a3b8'; ctx.font = 'bold ' + Math.round(h * 0.5) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', w / 2, h / 2);
    return [];
  }
  if (view === 'skeleton' || view === 'photo-skeleton') return drawSkeletonPicture(ctx, w, h, lms, msg.hands || [], ar, true, msg.sk, msg.ss);
  const rec = resolveLoadout(msg.skin, msg.lay ?? msg.cos, msg.bc, { gc: msg.gc, sd: msg.sd, fi: msg.fi });               // this phone's copies of the sender's skin and cosmetics (unknown ids are skipped)
  const backs = Array.isArray(msg.bk) ? msg.bk.slice(0, 2).map(x => (x === true || x === false ? x : undefined)) : [];     // which way the sender's hand faced (nails show on the back)
  return drawPuppetPicture(ctx, w, h, lms, msg.hands || [], ar, rec.skin, true, { ...rec, backs });
}

/** The sample open hand used by the Profile preview and the Store, as pixel points in a w x h picture: for animating particles on it. */
export function previewHandPx(w, h, skin = null, layers = []) {
  const lms = [statesToLandmarks({ thumb: true, index: true, middle: true, ring: true, pinky: true })];
  const px = fitter(lms, w, h, 1, 0.16, skin ? reachOf(lms, 1, skin, layers) : []);
  return lms.map(hand => hand.map(px));
}
