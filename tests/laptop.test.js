// Desktop/laptop robustness, the camera warning, and hiding the live picture for drawn views.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, until } from './harness.js';
import { makeHand, ALL } from './helpers.js';
import { cameraWarning, CAMERA_WARNING, VIEWS } from '../js/logic.js';
import { loadSkins } from '../js/skins.js';

test('the camera warning belongs to the photo views only', () => {
  for (const v of VIEWS) assert.equal(cameraWarning(v), v.startsWith('photo-') ? CAMERA_WARNING : '', v);
  assert.equal(cameraWarning('skeleton'), ''); assert.equal(cameraWarning('puppet'), '');
  assert.equal(cameraWarning('blur'), CAMERA_WARNING, 'an old photo view still counts as a photo');
  assert.equal(cameraWarning('nonsense'), '');
});

test('the warning text shows on the page only while a photo view is chosen, and the photo buttons carry the hint', async () => {
  const mk = mode => {
    const b = installBrowser('?sim=1');
    globalThis.localStorage.setItem('ff-mode', mode);      // after the install, which starts with an empty store
    return b;
  };
  for (const mode of VIEWS) {
    const b = mk(mode);
    await import('../js/main.js?w=' + mode);
    b.byId.get('profileBtn').onclick();
    const note = b.byId.get('styleNote').textContent;
    assert.equal(/^Warning: this sends a real photo of you to your opponent\.$/.test(note), mode.startsWith('photo-'), mode + ': ' + note);
    const buttons = [...b.byId.get('modePicker').children];
    for (const btn of buttons) assert.equal(btn.children.some(c => /real photo/.test(c.textContent)), btn.dataset.mode.startsWith('photo-'), btn.dataset.mode);
  }
});

function camWith(video, detect, log = []) {
  const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => log.push(k)), set: (t, k, v) => { t[k] = v; return true; } });
  return import('../js/hands.js').then(({ HandCam }) => {
    const cam = new HandCam(video, { width: 640, height: 480, getContext: () => ctx2d, classList: { toggle() {} } });
    cam.landmarker = { detectForVideo: detect };
    return cam;
  });
}
const videoEl = () => { const v = installBrowser('?').byId.get('video'); Object.assign(v, { videoWidth: 640, videoHeight: 480, readyState: 4, currentTime: 0 }); return v; };
const frames = (video, n) => { let c = 0; globalThis.requestAnimationFrame = f => { if (c++ < n) setTimeout(() => { video.currentTime += 0.1; f(); }, 0); }; };

test('a puppet that throws while drawing is caught: skeleton instead, the error named once, tracking keeps going', async () => {
  await loadSkins();
  globalThis.Path2D = class { constructor() { throw new TypeError('Path2D is not a constructor here'); } };
  try {
    const video = videoEl(); const errors = [];
    const cam = await camWith(video, () => ({ landmarks: [makeHand(ALL)] }));
    cam.onError = e => errors.push(e);
    cam.setOverlay('puppet', 'cartoon');
    const got = []; cam.onFrame = s => got.push(s);
    frames(video, 6); cam.run();
    await until(() => got.length >= 4, 'frames keep coming', 2000);
    cam.running = false;
    assert.equal(cam.overlay.puppet, false, 'the puppet is switched off after its first failure');
    assert.equal(errors.filter(e => /Puppet could not be drawn/.test(e)).length, 1, 'reported once, with the error name');
  } finally { delete globalThis.Path2D; }
});

test('an error on every frame is rate-limited and the loop gives up with a visible message instead of spinning', async () => {
  const video = videoEl(); const errors = []; let calls = 0;
  const cam = await camWith(video, () => { calls++; const e = new Error('GPU exploded'); e.name = 'RuntimeError'; throw e; });
  cam.onError = e => errors.push(e);
  cam.backoffMs = 1; frames(video, 100000); cam.run();
  await until(() => !cam.running, 'the loop stops', 15000);
  assert.ok(calls <= 45, 'bounded attempts: ' + calls);
  assert.match(errors[0], /RuntimeError: GPU exploded/);
  assert.match(errors.at(-1), /tracking stopped after repeated errors/);
});

test('a GPU delegate that fails on the first frame is replaced by the CPU one', async () => {
  const video = videoEl(); const errors = []; let made = [];
  const cam = await camWith(video, () => { throw new Error('GPU is not available'); });
  cam.delegate = 'GPU';
  cam.make = async d => { made.push(d); return { detectForVideo: () => ({ landmarks: [makeHand(ALL)] }) }; };
  cam.onError = e => errors.push(e);
  const got = []; cam.onFrame = s => got.push(s);
  frames(video, 20); cam.run();
  await until(() => got.length > 0, 'frames after the fallback', 3000);
  cam.running = false;
  assert.deepEqual(made, ['CPU']);
});

test('the live picture is hidden for skeleton and puppet and shown only for the photo views', () => {
  return camWith({ classList: { toggle(c, on) { this.last = [c, on]; } } }, () => ({})).then(cam => {
    const video = cam.video;
    for (const v of VIEWS) { cam.setOverlay(v, 'cartoon'); assert.deepEqual(video.classList.last, ['feed-hidden', !v.startsWith('photo-')], v); }
  });
});

test('a camera whose video will not play, or is refused, gives a message with the error name instead of hanging', async () => {
  const { HandCam } = await import('../js/hands.js');
  const video = videoEl(); video.play = async () => { throw Object.assign(new Error('no way'), { name: 'NotSupportedError' }); };
  const track = { stop() {}, addEventListener() {}, getSettings: () => ({}) };
  globalThis.navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [track], getVideoTracks: () => [track] }) };
  const cam = new HandCam(video, { width: 1, height: 1, getContext: () => ({}), classList: { toggle() {} } });
  assert.match(await cam.startCamera(), /NotSupportedError: no way/);
  globalThis.navigator.mediaDevices = { getUserMedia: async () => { throw Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' }); } };
  assert.match(await cam.startCamera(), /NotFoundError: Requested device not found/);
});

test('settings cards: the slot wrappers span the screen so every card has the same width and sits centred', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  for (const id of ['styleSlot', 'styleSlotProfile', 'appSlot', 'appSlotProfile']) assert.match(css, new RegExp('#' + id + '[^{]*\\{[^}]*width: 100%'), id);
});
