// The real-camera path: HandCam.snap() on synthetic hand samples (no camera needed). Whatever it produces must pass the
// same validators the opponent's phone applies, for every reveal style.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser } from './harness.js';
import { makeHand, ALL, FAN } from './helpers.js';
import { countHands, classifyHands } from '../js/gestures.js';

const b = installBrowser('?');
const { HandCam } = await import('../js/hands.js');
const { validReveal, validGuessMsg, VIEWS, SAFE_VIEWS } = await import('../js/logic.js');

function camWith(hands, { facing = 'user', frames = 7 } = {}) {
  const video = b.byId.get('video'); video.videoWidth = 640; video.videoHeight = 480;
  const cam = new HandCam(video, b.byId.get('overlayCanvas'));
  cam.facing = facing;
  const aspect = 640 / 480;
  const sample = { has: hands.length > 0, count: countHands(hands, aspect), gesture: classifyHands(hands, aspect), hands };
  cam.samples = Array.from({ length: frames }, () => sample);
  return cam;
}
const open = makeHand(ALL, FAN), peace = makeHand({ index: true, middle: true }, { index: -8, middle: 8 }), middle = makeHand({ middle: true });

test('every style produces a message the opponent accepts; only photo styles carry a photo', () => {
  for (const view of VIEWS) {
    const m = camWith([peace]).snap({ mode: view, skin: 'robot' });
    assert.equal(m.view, view); assert.equal(m.skin, 'robot'); assert.equal(m.count, 2); assert.equal(m.noHand, false);
    assert.ok(validReveal(m, true), view + ' passes as a reveal');
    assert.ok(validGuessMsg({ guess: m.count, ...m }, true), view + ' passes as a guess');
    if (SAFE_VIEWS.includes(view)) {
      assert.equal(m.photo, '', view + ' has no photo');
      assert.ok(validReveal(m, false), view + ' is allowed against a random opponent');
    } else {
      assert.ok(m.photo.startsWith('data:image/jpeg;base64,'), view + ' has a photo');
      assert.ok(!validReveal(m, false), view + ' is refused by a random opponent');
    }
  }
});

test('finger data matches the count; two hands add up; a fist is a hand with no fingers up', () => {
  const m = camWith([open, peace]).snap({ mode: 'avatar' });
  assert.equal(m.count, 7); assert.equal(m.hands.length, 2);
  assert.equal(m.hands.flatMap(h => Object.values(h)).filter(Boolean).length, 7);
  const fist = camWith([makeHand({})]).snap({ mode: 'avatar' });
  assert.equal(fist.count, 0); assert.equal(fist.noHand, false); assert.equal(fist.hands.length, 1);
  assert.deepEqual(Object.values(fist.hands[0]), [false, false, false, false, false]);
  assert.ok(validReveal(fist, false));
});

test('gestures are reported; landmarks are integers 0..1000 and mirrored for a selfie camera', () => {
  const m = camWith([middle]).snap({ mode: 'skeleton' });
  assert.equal(m.gesture, 'middle');
  assert.equal(m.lm.length, 1); assert.equal(m.lm[0].length, 21);
  const raw = middle[8];
  assert.equal(m.lm[0][8][0], Math.round((1 - raw.x) * 1000), 'front camera: mirrored');
  assert.equal(m.lm[0][8][1], Math.round(raw.y * 1000));
  const back = camWith([middle], { facing: 'environment' }).snap({ mode: 'skeleton' });
  assert.equal(back.lm[0][8][0], Math.round(raw.x * 1000), 'back camera: not mirrored');
  assert.equal(m.ar, 640 / 480);
});

test('no hand seen: count 0, no landmarks, no photo, still a valid message', () => {
  const none = camWith([], { frames: 7 }).snap({ mode: 'photo' });
  assert.equal(none.noHand, true); assert.equal(none.count, 0); assert.equal(none.lm, null); assert.deepEqual(none.hands, []); assert.equal(none.photo, '');
  assert.ok(validReveal(none, true));
  const brief = camWith([peace], { frames: 7 }); brief.samples = brief.samples.map((s, i) => (i < 5 ? { ...s, has: false, hands: [], count: 0, gesture: null } : s));
  assert.equal(brief.snap({ mode: 'avatar' }).noHand, true, 'a hand seen in fewer than half the recent frames does not count');
  assert.equal(new HandCam(b.byId.get('video'), b.byId.get('overlayCanvas')).snap({}).noHand, true, 'no frames at all');
});

test('an unknown style or skin falls back safely', () => {
  const m = camWith([peace]).snap({ mode: 'hologram', skin: '../../etc' });
  assert.equal(m.view, 'avatar'); assert.match(m.skin, /^[a-z]{1,12}$/);
  assert.ok(validReveal(m, false));
});
