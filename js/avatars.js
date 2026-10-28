// Cartoon hand avatars: the privacy-friendly way to show your fingers. Only canvas drawing, no camera pixels.
// A hand is described by which fingers are up: {thumb, index, middle, ring, pinky} (see gestures.js fingerStates).

export const SKINS = [
  { id: 'light',  name: 'Light',  base: '#f6d3b0', line: '#b9855a', accent: '#e9b38a', deco: 'none' },
  { id: 'tan',    name: 'Tan',    base: '#d9a066', line: '#8a5a2b', accent: '#c4884a', deco: 'none' },
  { id: 'dark',   name: 'Dark',   base: '#8d5a3b', line: '#4a2c17', accent: '#744a2f', deco: 'none' },
  { id: 'robot',  name: 'Robot',  base: '#9aa5b1', line: '#3b4450', accent: '#e2e8f0', deco: 'rivets' },
  { id: 'zombie', name: 'Zombie', base: '#8bc34a', line: '#33691e', accent: '#c5e1a5', deco: 'stitches' },
  { id: 'gold',   name: 'Gold',   base: '#fbbf24', line: '#92400e', accent: '#fff3b0', deco: 'shine' },
  { id: 'alien',  name: 'Alien',  base: '#a78bfa', line: '#4c1d95', accent: '#ddd6fe', deco: 'dots' },
  { id: 'lava',   name: 'Lava',   base: '#f97316', line: '#7c2d12', accent: '#fde047', deco: 'cracks' },
];

export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];   // numbering order for the little labels

export const skinById = id => SKINS.find(s => s.id === id) || SKINS[0];

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

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function paint(ctx, skin, lineWidth) {
  ctx.fillStyle = skin.base; ctx.fill();
  ctx.lineWidth = lineWidth; ctx.strokeStyle = skin.line; ctx.stroke();
}

const FINGER_X = { index: -1.6, middle: -0.55, ring: 0.5, pinky: 1.55 };
const FINGER_LEN = { index: 2.7, middle: 3.1, ring: 2.7, pinky: 2.0 };

/**
 * Draws one hand with its wrist centre at (cx, baseY); [u] is the unit size. Returns the fingertips of the raised
 * fingers as [{finger, x, y}].
 */
function drawHand(ctx, cx, baseY, u, st, skin, mirror) {
  const tips = [];
  const palmTop = baseY - 3.6 * u;
  const lw = Math.max(1.5, u * 0.14);
  ctx.save();
  if (mirror) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }

  // raised fingers behind the palm
  for (const name of ['index', 'middle', 'ring', 'pinky']) {
    if (!st[name]) continue;
    const x = cx + FINGER_X[name] * u, top = palmTop - FINGER_LEN[name] * u + 0.4 * u;
    roundRect(ctx, x - 0.475 * u, top, 0.95 * u, palmTop - top + 0.8 * u, 0.475 * u);
    paint(ctx, skin, lw);
    ctx.beginPath(); ctx.lineWidth = lw * 0.7; ctx.strokeStyle = skin.line;    // two knuckle creases
    for (const k of [0.45, 0.95]) { ctx.moveTo(x - 0.3 * u, top + k * u * 1.2 + 0.5 * u); ctx.lineTo(x + 0.3 * u, top + k * u * 1.2 + 0.5 * u); }
    ctx.stroke();
    tips.push({ finger: name, x: mirror ? 2 * cx - x : x, y: top });
  }

  // palm
  roundRect(ctx, cx - 2.3 * u, palmTop, 4.6 * u, 3.6 * u, 1.0 * u);
  paint(ctx, skin, lw);
  deco(ctx, skin, cx, palmTop, u);

  // folded fingers: knuckle bumps on the palm
  for (const name of ['index', 'middle', 'ring', 'pinky']) {
    if (st[name]) continue;
    const x = cx + FINGER_X[name] * u;
    roundRect(ctx, x - 0.5 * u, palmTop - 0.3 * u, 1.0 * u, 1.5 * u, 0.5 * u);
    paint(ctx, skin, lw);
  }

  // thumb
  if (st.thumb) {
    ctx.save();
    ctx.translate(cx - 2.2 * u, baseY - 1.6 * u);
    ctx.rotate(-0.8);
    roundRect(ctx, -0.5 * u, -2.5 * u, 1.0 * u, 2.7 * u, 0.5 * u);
    paint(ctx, skin, lw);
    ctx.restore();
    const a = -0.8, tx = cx - 2.2 * u, ty = baseY - 1.6 * u, len = 2.5 * u;
    const px = tx + len * Math.sin(a), py = ty - len * Math.cos(a);
    tips.unshift({ finger: 'thumb', x: mirror ? 2 * cx - px : px, y: py });
  } else {
    roundRect(ctx, cx - 1.8 * u, baseY - 2.1 * u, 2.2 * u, 1.0 * u, 0.5 * u);
    paint(ctx, skin, lw);
  }
  ctx.restore();
  return tips;
}

function deco(ctx, skin, cx, palmTop, u) {
  ctx.save();
  ctx.fillStyle = skin.accent; ctx.strokeStyle = skin.line; ctx.lineWidth = Math.max(1, u * 0.1);
  switch (skin.deco) {
    case 'rivets':
      for (const [dx, dy] of [[-1.5, 0.6], [1.5, 0.6], [-1.5, 3.0], [1.5, 3.0]]) { ctx.beginPath(); ctx.arc(cx + dx * u, palmTop + dy * u, 0.28 * u, 0, 7); ctx.fill(); ctx.stroke(); }
      break;
    case 'stitches':
      ctx.beginPath(); ctx.moveTo(cx - 1.4 * u, palmTop + 1.6 * u); ctx.lineTo(cx + 1.4 * u, palmTop + 1.2 * u);
      for (let i = -3; i <= 3; i++) { ctx.moveTo(cx + i * 0.4 * u, palmTop + 1.0 * u); ctx.lineTo(cx + i * 0.4 * u, palmTop + 1.9 * u); }
      ctx.stroke();
      break;
    case 'shine':
      ctx.beginPath(); ctx.arc(cx - 0.6 * u, palmTop + 1.2 * u, 0.9 * u, 3.4, 4.8); ctx.lineWidth = u * 0.3; ctx.strokeStyle = skin.accent; ctx.stroke();
      break;
    case 'dots':
      for (const [dx, dy] of [[-1, 1], [0.2, 1.8], [1.1, 1]]) { ctx.beginPath(); ctx.arc(cx + dx * u, palmTop + dy * u, 0.3 * u, 0, 7); ctx.fill(); }
      break;
    case 'cracks':
      ctx.beginPath(); ctx.strokeStyle = skin.accent; ctx.lineWidth = u * 0.18;
      ctx.moveTo(cx - 1.5 * u, palmTop + 0.5 * u); ctx.lineTo(cx - 0.5 * u, palmTop + 1.5 * u); ctx.lineTo(cx - 1 * u, palmTop + 2.4 * u); ctx.lineTo(cx + 0.3 * u, palmTop + 3.1 * u);
      ctx.moveTo(cx + 1.6 * u, palmTop + 0.6 * u); ctx.lineTo(cx + 0.8 * u, palmTop + 1.7 * u);
      ctx.stroke();
      break;
    default: break;
  }
  ctx.restore();
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

/**
 * The whole avatar picture: a plain backdrop and one or two cartoon hands showing [hands] (a list of finger states,
 * at most two). Returns the raised fingertips (already numbered by annotate).
 */
export function drawAvatar(ctx, w, h, hands, skin, withNumbers = true) {
  const g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, h) : null;
  if (g) { g.addColorStop(0, '#1e293b'); g.addColorStop(1, '#0f172a'); ctx.fillStyle = g; } else ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, h);
  const hs = hands.slice(0, 2);
  let tips = [];
  if (hs.length === 0) {
    ctx.fillStyle = '#94a3b8'; ctx.font = 'bold ' + Math.round(h * 0.5) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', w / 2, h / 2);
    return tips;
  }
  const baseY = h * 0.94;
  if (hs.length === 1) {
    const u = Math.min(w / 8, h / 8.4);
    tips = drawHand(ctx, w / 2, baseY, u, hs[0], skin, false);
  } else {
    // a raised thumb reaches about 3.9 units to the outside of each hand, so keep both hands well inside the picture
    const u = Math.min(w / 16, h / 8.4);
    tips = drawHand(ctx, w * 0.30, baseY, u, hs[0], skin, false).concat(drawHand(ctx, w * 0.70, baseY, u, hs[1], skin, true));
  }
  if (withNumbers) annotate(ctx, tips, Math.max(8, h * 0.07));
  return tips;
}

// ---------------------------------------------------------------------------------------------
// Skeleton picture: the hand's 21 landmarks drawn on a plain backdrop (no camera pixels)
// ---------------------------------------------------------------------------------------------
export const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
export const TIP_ID = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };

/**
 * [lms]: up to two hands of 21 integer [x, y] points in 0..1000 (the camera frame). [hands]: finger states, used
 * to number the raised fingertips. [ar]: the camera frame's width / height, so the drawing is not stretched.
 */
export function drawSkeletonPicture(ctx, w, h, lms, hands, ar, withNumbers = true) {
  ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h);
  // Fit the hand(s) to the picture, not the camera frame: a far-away hand is a small box inside a big frame, so
  // scale the bounding box of all points up to fill the area (aspect kept, frame aspect [ar] respected).
  const xs = lms.flat().map(p => p[0] * ar), ys = lms.flat().map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const bw = Math.max(maxX - minX, 40), bh = Math.max(maxY - minY, 40);       // floor: a single point must not blow up
  const pad = 0.1;
  const k = Math.min((w * (1 - 2 * pad)) / bw, (h * (1 - 2 * pad)) / bh);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const px = p => ({ x: w / 2 + (p[0] * ar - cx) * k, y: h / 2 + (p[1] - cy) * k });
  const tips = [];
  lms.forEach((hand, hi) => {
    ctx.lineWidth = Math.max(2, h * 0.016); ctx.strokeStyle = '#22d3ee';
    for (const [a, b] of BONES) { const A = px(hand[a]), B = px(hand[b]); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); }
    ctx.fillStyle = '#fbbf24';
    for (const p of hand) { const P = px(p); ctx.beginPath(); ctx.arc(P.x, P.y, Math.max(2.5, h * 0.018), 0, 7); ctx.fill(); }
    const st = hands[hi];
    if (st) for (const f of FINGERS) if (st[f]) { const P = px(hand[TIP_ID[f]]); tips.push({ finger: f, x: P.x, y: P.y }); }
  });
  if (withNumbers) annotate(ctx, tips, Math.max(8, h * 0.07));
  return tips;
}

/**
 * Draws the picture for a reveal/guess message onto [ctx] (w x h) WITHOUT using any image from the sender:
 * the skeleton view uses the landmarks, everything else the cartoon hand for the sender's skin.
 */
export function drawFromMessage(ctx, w, h, msg) {
  if (msg.view === 'skeleton' && msg.lm && msg.lm.length) return drawSkeletonPicture(ctx, w, h, msg.lm, msg.hands, msg.ar);
  return drawAvatar(ctx, w, h, msg.hands, skinById(msg.skin));
}
