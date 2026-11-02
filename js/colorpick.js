// The colour maths of the in-app colour picker (hue slider + saturation/brightness square). Pure functions, no DOM: the picker UI is in main.js.
// Everything that leaves this file is a plain lower-case #rrggbb, the only colour form the app stores or sends.

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const hex2 = n => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');

/** h 0-360, s and v 0-1 -> '#rrggbb'. Out-of-range or non-numeric input is clamped (never NaN in the output). */
export function hsvToHex(h, s, v) {
  const H = ((Number.isFinite(h) ? h : 0) % 360 + 360) % 360, S = clamp(Number.isFinite(s) ? s : 0, 0, 1), V = clamp(Number.isFinite(v) ? v : 0, 0, 1);
  const c = V * S, x = c * (1 - Math.abs(((H / 60) % 2) - 1)), m = V - c;
  const [r, g, b] = H < 60 ? [c, x, 0] : H < 120 ? [x, c, 0] : H < 180 ? [0, c, x] : H < 240 ? [0, x, c] : H < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + hex2((r + m) * 255) + hex2((g + m) * 255) + hex2((b + m) * 255);
}

/** '#rrggbb' -> {h 0-360, s 0-1, v 0-1}; anything else gives white (h 0, s 0, v 1). */
export function hexToHsv(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return { h: 0, s: 0, v: 1 };
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
}

/** Paints the square for [hue]: saturation grows to the right, brightness upwards (plain gradients, cheap). */
export function drawSV(ctx, w, h, hue) {
  ctx.fillStyle = hsvToHex(hue, 1, 1); ctx.fillRect(0, 0, w, h);
  const white = ctx.createLinearGradient(0, 0, w, 0); white.addColorStop(0, '#ffffff'); white.addColorStop(1, '#ffffff00');
  ctx.fillStyle = white; ctx.fillRect(0, 0, w, h);
  const black = ctx.createLinearGradient(0, 0, 0, h); black.addColorStop(0, '#00000000'); black.addColorStop(1, '#000000');
  ctx.fillStyle = black; ctx.fillRect(0, 0, w, h);
}

/** A touch/mouse position inside the square -> saturation and brightness (0-1), clamped to the square. */
export function svAt(x, y, w, h) { return { s: clamp(x / (w || 1), 0, 1), v: clamp(1 - y / (h || 1), 0, 1) }; }
