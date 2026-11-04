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
  const hand = makeHand(ALL, FAN), original = JSON.stringify(hand);
  const ctx = new Proxy({}, { get: (_, k) => k === 'setTransform' ? (...a) => transforms.push(a) : () => {}, set: () => true });
  const video = b.byId.get('video');
  Object.assign(video, { videoWidth: 640, videoHeight: 480, readyState: 2, currentTime: 1 });
  const canvas = { width: 640, height: 480, getContext: () => ctx };
  const cam = new HandCam(video, canvas);
  cam.landmarker = { detectForVideo: () => ({ landmarks: [hand] }) };
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
    assert.deepEqual(errors, []);
    assert.equal(JSON.stringify(hand), original, 'counting landmarks untouched');
  } finally { cam.pause(); globalThis.performance = oldPerf; globalThis.requestAnimationFrame = oldRaf; globalThis.matchMedia = oldMedia; }
});
