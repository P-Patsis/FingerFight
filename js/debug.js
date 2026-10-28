// The calibration / debug panel. It shows, live, WHY the camera decided what it did, and lets you move the thresholds.
//   - the finger count the game would use, how many hands, the gesture, the frame rate
//   - for each hand: the model's own confidence (the raw landmark score) and, per finger, the measured ratio next to the
//     threshold that turns it into UP or down
//   - a slider for every tunable value (see TUNING in gestures.js), saved on this phone, plus Copy (puts the numbers on the
//     clipboard so they can be pasted into a message) and Reset
// Nothing here is sent over the network.
import { TUNING, TUNING_RANGES, DEFAULT_TUNING, setTuning, resetTuning, saveTuning } from './gestures.js';

const LABELS = {
  extend: 'Finger up when tip/joint ratio >', thumb: 'Thumb up when ratio >', minScore: 'Ignore hands with confidence <',
  frames: 'Frames that vote at the snap', sideMin: 'Sideways angle min (deg)', sideMax: 'Sideways angle max (deg)',
};
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const f2 = v => (Number.isFinite(v) ? v.toFixed(2) : '–');

/** One line per hand and finger. Pure text, so it is easy to test. */
export function formatSample(s) {
  if (!s) return 'No frames yet. Hold a hand in view.';
  const lines = [`count ${s.count ?? 0}  |  hands ${s.hands?.length ?? 0}  |  gesture ${s.gesture || '-'}  |  ${s.fps ? Math.round(s.fps) : '–'} fps`];
  if (!s.hands?.length) lines.push('no hand detected');
  (s.hands || []).forEach((_, i) => {
    const sc = s.scores?.[i];
    lines.push(`hand ${i + 1}: ${sc?.side || '?'}  confidence ${sc && sc.score !== null ? f2(sc.score) : 'n/a'}${TUNING.minScore > 0 && sc && sc.score !== null && sc.score < TUNING.minScore ? '  (below minimum)' : ''}`);
    const d = s.dbg?.[i];
    if (d) for (const f of FINGERS) lines.push(`  ${f.padEnd(6)} ${f2(d[f].ratio)} vs ${f2(d[f].threshold)}  ${d[f].up ? 'UP' : 'down'}`);
  });
  return lines.join('\n');
}

export function createDebugPanel(parent, { onChange } = {}) {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const panel = el('div', 'dbg-panel');
  panel.id = 'dbgPanel';
  panel.hidden = true;
  const pre = el('pre', 'dbg-text', formatSample(null));
  const sliders = el('div', 'dbg-sliders');
  const inputs = {};
  for (const [k, [lo, hi, step]] of Object.entries(TUNING_RANGES)) {
    const row = el('label', 'dbg-row');
    const name = el('span', '', LABELS[k] || k);
    const val = el('b', '', String(TUNING[k]));
    const input = el('input');
    input.type = 'range'; input.min = String(lo); input.max = String(hi); input.step = String(step); input.value = String(TUNING[k]);
    input.oninput = () => { setTuning({ [k]: Number(input.value) }); val.textContent = String(TUNING[k]); input.value = String(TUNING[k]); saveTuning(); onChange?.(k, TUNING[k]); };
    inputs[k] = { input, val };
    row.append(name, val, input);
    sliders.append(row);
  }
  const bar = el('div', 'dbg-bar');
  const copy = el('button', 'btn small ghost', 'Copy numbers'); copy.type = 'button';
  const reset = el('button', 'btn small ghost', 'Reset'); reset.type = 'button';
  let last = null;
  copy.onclick = async () => {
    const report = JSON.stringify({ tuning: { ...TUNING }, defaults: { ...DEFAULT_TUNING }, sample: last && { count: last.count, gesture: last.gesture, fps: last.fps, scores: last.scores, dbg: last.dbg } }, null, 1);
    try { await navigator.clipboard.writeText(report); copy.textContent = 'Copied'; } catch { copy.textContent = 'Copy failed'; }
    setTimeout(() => { copy.textContent = 'Copy numbers'; }, 1500);
  };
  reset.onclick = () => {
    resetTuning();
    for (const [k, { input, val }] of Object.entries(inputs)) { input.value = String(TUNING[k]); val.textContent = String(TUNING[k]); }
    onChange?.('reset', null);
  };
  bar.append(copy, reset);
  const details = el('details', 'dbg-details');
  details.append(el('summary', '', 'Thresholds (drag to tune; saved on this phone)'), sliders);
  panel.append(pre, details, bar);
  parent.append(panel);

  let lastDraw = 0;
  return {
    el: panel,
    get visible() { return !panel.hidden; },
    show(on) { panel.hidden = !on; },
    /** Called for every camera frame; the text is redrawn at most about 8 times a second. */
    update(sample) {
      last = sample;
      const now = Date.now();
      if (panel.hidden || now - lastDraw < 120) return;
      lastDraw = now;
      pre.textContent = formatSample(sample);
    },
  };
}
