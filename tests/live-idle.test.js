import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser } from './harness.js';
import { makeHand, ALL, FAN } from './helpers.js';
const b = installBrowser('?');
globalThis.Path2D ??= class {};
const { HandCam } = await import('../js/hands.js');
const C = await import('../js/cosmetics.js');
await C.loadCatalog();

test('real camera render loop animates a stationary hand at 12.5 tracking fps, including try-on and match puppet modes', () => {
  const oldPerf = globalThis.performance, oldRaf = globalThis.requestAnimationFrame, oldMedia = globalThis.matchMedia;
  let now = 1000, next, reduced = false, transforms = [];
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = cb => { next = cb; return 1; };
  globalThis.matchMedia = () => ({ matches: reduced });
  const hand = makeHand(ALL, FAN); let tracked = hand; const original = JSON.stringify(hand);
  const ctx = new Proxy({}, { get: (_, k) => k === 'setTransform' ? (...a) => transforms.push(a) : () => {}, set: () => true });
  const video = b.byId.get('video');
  Object.assign(video, { videoWidth: 640, videoHeight: 480, readyState: 2, currentTime: 1 });
  const canvas = { width: 640, height: 480, getContext: () => ctx };
  const cam = new HandCam(video, canvas);
  cam.landmarker = { detectForVideo: () => ({ landmarks: tracked ? [tracked] : [] }) };
  const errors = []; cam.onError = e => errors.push(e);
  try {
    for (const mode of ['puppet', 'photo-puppet']) {
      cam.setOverlay(mode, 'mechanical', []);
      cam.run();
      for (let i = 0; i < 60; i++) { now += 80; video.currentTime++; next(); }
      assert.equal(cam.hd[0].animating, false, 'slow camera still disables expensive spring physics');
      const t = cam.hd[0].animTime; assert.ok(t > 0, 'idle clock keeps advancing');
      transforms = []; now += 80; video.currentTime++; next(); const a = transforms;
      transforms = []; now += 80; video.currentTime++; next();
      assert.notDeepEqual(transforms, a, 'gears turn even with identical landmarks');
      reduced = true; now += 80; video.currentTime++; next();
      assert.equal(cam.hd[0].animTime, null);
      reduced = false; cam.pause();
    }
    cam.setOverlay('puppet', 'painting', []);
    cam.run();
    const frame = n => { for (let i = 0; i < n; i++) { now += 80; video.currentTime++; next(); } };
    frame(4); const seed = C.gen.sd;
    tracked = makeHand({}); frame(5);
    assert.notEqual(C.gen.sd, seed, 'a real camera fist rerolls the Painting seed');
    const painted = C.gen.sd; frame(10);
    assert.equal(C.gen.sd, painted, 'holding the fist keeps the painting');
    assert.deepEqual(cam.overlay.rec.skin.parts, C.resolveLoadout('painting', []).skin.parts);
    assert.equal(cam.snap({ mode: 'puppet', skin: 'painting' }).sd, painted, 'snap sends the painting actually drawn');
    tracked = hand; frame(4); tracked = makeHand({}); frame(4);
    assert.notEqual(C.gen.sd, painted, 'reopening rearms the gesture');
    assert.deepEqual(errors, []);
    assert.equal(JSON.stringify(hand), original, 'counting landmarks untouched');
  } finally { cam.pause(); globalThis.performance = oldPerf; globalThis.requestAnimationFrame = oldRaf; globalThis.matchMedia = oldMedia; }
});
