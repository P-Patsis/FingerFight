import test from 'node:test';
import assert from 'node:assert/strict';
import { SKINS, skinById, statesFromCount, drawAvatar, FINGERS } from '../js/avatars.js';

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

test('every skin draws every count, with one numbered fingertip per raised finger', () => {
  assert.ok(SKINS.length >= 8);
  assert.equal(new Set(SKINS.map(s => s.id)).size, SKINS.length, 'unique ids');
  for (const skin of SKINS) {
    for (let n = 0; n <= 10; n++) {
      const ctx = fakeCtx();
      const tips = drawAvatar(ctx, 240, 180, statesFromCount(n), skin);
      assert.equal(tips.length, n, skin.id + ' count ' + n);
      for (const t of tips) { assert.ok(FINGERS.includes(t.finger)); assert.ok(Number.isFinite(t.x) && Number.isFinite(t.y)); }
      assert.ok(ctx.calls.includes('fill'), 'something was drawn');
    }
  }
});

test('no hand draws a question mark; unknown skin ids fall back', () => {
  const ctx = fakeCtx();
  assert.deepEqual(drawAvatar(ctx, 240, 180, [], SKINS[0]), []);
  assert.ok(ctx.calls.includes('fillText'));
  assert.equal(skinById('nope').id, SKINS[0].id);
  assert.equal(skinById('gold').id, 'gold');
});

test('tips stay inside the picture, at the sizes the game uses', () => {
  for (const [w, h] of [[240, 180], [240, 320], [240, 135]]) {
    for (let n = 1; n <= 10; n++) {
      for (const t of drawAvatar(fakeCtx(), w, h, statesFromCount(n), SKINS[0])) {
        assert.ok(t.x > 0 && t.x < w && t.y > 0 && t.y < h, w + 'x' + h + ' count ' + n + ' tip ' + Math.round(t.x) + ',' + Math.round(t.y));
      }
    }
  }
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
  assert.equal(drawFromMessage(fakeCtx(), 240, 180, { view: 'avatar', skin: 'gold', hands, lm: null, ar: 1.33 }).length, 5);
  assert.equal(drawFromMessage(fakeCtx(), 240, 180, { view: 'skeleton', skin: 'gold', hands, lm, ar: 1.33 }).length, 5);
  // views that need a photo (or a skeleton with no landmarks) fall back to the cartoon hand
  assert.equal(drawFromMessage(fakeCtx(), 240, 180, { view: 'photo', skin: 'gold', hands, lm: null, ar: 1.33 }).length, 5);
  assert.equal(drawFromMessage(fakeCtx(), 240, 180, { view: 'skeleton', skin: 'gold', hands, lm: null, ar: 1.33 }).length, 5);
});
