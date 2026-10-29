import test from 'node:test';
import assert from 'node:assert/strict';
import { statesFromCount, FINGERS, drawPuppetPicture, landmarksOf } from '../js/avatars.js';
import { loadSkins, skinIds, getSkin } from '../js/skins.js';
import { installBrowser } from './harness.js';
installBrowser('?');                                   // gives the skin loader a fetch that reads assets/skins from disk

/** A canvas context that records calls and never fails. */
function fakeCtx() {
  const calls = [];
  return new Proxy({ calls }, {
    get: (t, k) => (k in t ? t[k] : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => { calls.push(k); }),
    set: () => true,
  });
}
const up = st => Object.values(st).filter(Boolean).length;

test('counts 0..10 split into at most two hands that add up', () => {
  for (let n = 0; n <= 10; n++) {
    const hands = statesFromCount(n);
    assert.ok(hands.length <= 2);
    assert.equal(hands.reduce((s, h) => s + up(h), 0), n, 'count ' + n);
  }
  assert.equal(statesFromCount(0).length, 1, 'zero fingers is one closed fist, not "no hand"');
  assert.deepEqual(statesFromCount(2)[0], { thumb: false, index: true, middle: true, ring: false, pinky: false });
  assert.equal(statesFromCount(99).reduce((s, h) => s + up(h), 0), 10, 'clamped');
});

test('the puppet picture draws every count from finger data alone, one numbered fingertip per raised finger, inside the picture', async () => {
  await loadSkins();
  assert.ok(skinIds().length >= 3, 'the built-in skins loaded');
  for (const id of skinIds()) {
    for (let n = 0; n <= 10; n++) {
      const hands = statesFromCount(n);
      const { lms, ar } = landmarksOf({ hands, lm: null });
      const tips = drawPuppetPicture(fakeCtx(), 240, 180, lms, hands, ar, getSkin(id));
      assert.equal(tips.length, n, id + ' count ' + n);
      for (const t of tips) { assert.ok(FINGERS.includes(t.finger)); assert.ok(t.x > 0 && t.x < 240 && t.y > 0 && t.y < 180, id + ' count ' + n + ' tip ' + Math.round(t.x) + ',' + Math.round(t.y)); }
    }
  }
});

test('no hand draws a question mark', () => {
  const ctx = fakeCtx();
  assert.deepEqual(drawFromMessage(ctx, 240, 180, { view: 'puppet', skin: 'cartoon', hands: [], lm: null, ar: 1 }), []);
  assert.ok(ctx.calls.includes('fillText'));
});

import { drawSkeletonPicture, drawFromMessage } from '../js/avatars.js';

test('the skeleton picture numbers the raised fingertips and stays inside', () => {
  const lm = [Array.from({ length: 21 }, (_, i) => [100 + i * 40, 900 - i * 40])];
  const hands = [{ thumb: false, index: true, middle: true, ring: false, pinky: false }];
  const tips = drawSkeletonPicture(fakeCtx(), 240, 180, lm, hands, 1.333);
  assert.deepEqual(tips.map(t => t.finger), ['index', 'middle']);
  for (const t of tips) assert.ok(t.x >= 0 && t.x <= 240 && t.y >= 0 && t.y <= 180);
});

test('a message is drawn from its finger data only (never from an image)', () => {
  const hands = [{ thumb: true, index: true, middle: true, ring: true, pinky: true }];
  const lm = [Array.from({ length: 21 }, () => [500, 500])];
  assert.equal(drawFromMessage(fakeCtx(), 240, 180, { view: 'puppet', skin: 'cartoon', hands, lm: null, ar: 1.33 }).length, 5);
  assert.equal(drawFromMessage(fakeCtx(), 240, 180, { view: 'avatar', skin: 'gold', hands, lm: null, ar: 1.33 }).length, 5, 'an older phone\'s cartoon view is shown as the puppet');
  assert.equal(drawFromMessage(fakeCtx(), 240, 180, { view: 'skeleton', skin: 'gold', hands, lm, ar: 1.33 }).length, 5);
  // views that need a photo (or a skeleton with no landmarks) fall back to the drawn twin
  assert.equal(drawFromMessage(fakeCtx(), 240, 180, { view: 'photo-puppet', skin: 'cartoon', hands, lm: null, ar: 1.33 }).length, 5);
  assert.equal(drawFromMessage(fakeCtx(), 240, 180, { view: 'skeleton', skin: 'gold', hands, lm: null, ar: 1.33 }).length, 5);
});
