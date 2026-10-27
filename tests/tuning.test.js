// The calibration hooks: every threshold is in one clamped, saved config, and the debug panel text shows the numbers behind a decision.
import test from 'node:test';
import assert from 'node:assert/strict';
const mem = new Map();
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
import { makeHand, ALL, FAN } from './helpers.js';
const g = await import('../js/gestures.js');
const { formatSample } = await import('../js/debug.js');

test('tuning values are clamped, unknown keys ignored, saved and loaded, and reset', () => {
  g.setTuning({ extend: 9, frames: 1, bogus: 5, moutza: 'x' });
  assert.equal(g.TUNING.extend, 1.5); assert.equal(g.TUNING.frames, 3); assert.equal(g.TUNING.bogus, undefined); assert.equal(g.TUNING.moutza, g.DEFAULT_TUNING.moutza);
  g.setTuning({ extend: 1.2 }); g.saveTuning();
  g.resetTuning(); assert.equal(g.TUNING.extend, g.DEFAULT_TUNING.extend);
  mem.set('ff-tune', JSON.stringify({ extend: 1.3, thumb: 99 }));
  g.loadTuning(); assert.equal(g.TUNING.extend, 1.3); assert.equal(g.TUNING.thumb, 1.3, 'out-of-range saved values are clamped');
  g.resetTuning();
});

test('the thresholds really drive the decision: a very strict "extend" turns raised fingers into down fingers', () => {
  const hand = makeHand(ALL, FAN);
  assert.equal(g.countHand(hand, 1.333), 5);
  g.setTuning({ extend: 1.5 });
  assert.ok(g.countHand(hand, 1.333) < 5, 'stricter threshold, fewer fingers');
  g.resetTuning();
  assert.equal(g.countHand(hand, 1.333), 5);
});

test('fingerDebug reports the measured ratio, the threshold and the same verdict as fingerStates', () => {
  const hand = makeHand({ index: true, thumb: true });
  const d = g.fingerDebug(hand, 1.333), s = g.fingerStates(hand, 1.333);
  for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
    assert.equal(d[f].up, s[f], f);
    assert.ok(Number.isFinite(d[f].ratio) && d[f].threshold > 0, f);
  }
});

test('the panel text shows count, confidence and per-finger ratios (and copes with no hand / no frames)', () => {
  assert.match(formatSample(null), /No frames yet/);
  assert.match(formatSample({ count: 0, hands: [], scores: [], fps: 0 }), /no hand detected/);
  const hand = makeHand({ index: true });
  const txt = formatSample({ count: 1, gesture: null, fps: 24.4, hands: [hand], scores: [{ score: 0.973, side: 'Right' }], dbg: [g.fingerDebug(hand, 1)] });
  assert.match(txt, /count 1/); assert.match(txt, /24 fps/); assert.match(txt, /Right\s+confidence 0\.97/); assert.match(txt, /index\s+\d\.\d\d vs 1\.05\s+UP/); assert.match(txt, /pinky .* down/);
});
