// Camera and network safety, in isolation: the camera is truly switched off after use, and strangers are reached
// only through the relay (so they never learn an IP address).
import test from 'node:test';
import assert from 'node:assert/strict';
import { HandCam } from '../js/hands.js';
import { Link, newPeer } from '../js/net.js';

function fakeCamera() {
  const tracks = [{ readyState: 'live', stop() { this.readyState = 'ended'; } }];
  const stream = { getTracks: () => tracks };
  Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: { getUserMedia: async () => stream } }, configurable: true });
  const video = { srcObject: null, classList: { toggle() {} }, play: async () => {}, pause() {}, videoWidth: 640, videoHeight: 480 };
  const canvas = { getContext: () => ({ clearRect() {} }), classList: { toggle() {} }, width: 0, height: 0 };
  return { tracks, cam: new HandCam(video, canvas), video };
}

test('the camera is off until a guess window opens and is really off (tracks stopped) after release()', async () => {
  const { tracks, cam, video } = fakeCamera();
  assert.equal(cam.cameraOn, false, 'not on before startCamera');
  assert.equal(await cam.startCamera(), null);
  assert.equal(cam.cameraOn, true);
  cam.samples = [{ has: true, count: 3, gesture: null, hands: [] }];
  cam.release();
  assert.equal(tracks[0].readyState, 'ended', 'the track is stopped, so the phone camera light goes out');
  assert.equal(cam.cameraOn, false);
  assert.equal(video.srcObject, null, 'the video element holds no stream');
  assert.deepEqual(cam.samples, [], 'old frames are forgotten');
});

test('stopCamera is safe to call when no camera was ever started', () => {
  const { cam } = fakeCamera();
  cam.stopCamera(); cam.release();
  assert.equal(cam.cameraOn, false);
});

test('relay-only connections for strangers; normal ones otherwise', () => {
  const seen = [];
  globalThis.Peer = function (...a) { seen.push(a); };
  newPeer('x', true); newPeer(null, true); newPeer('y', false);
  assert.equal(seen[0][1].config.iceTransportPolicy, 'relay');
  assert.equal(seen[1][0].config.iceTransportPolicy, 'relay');
  assert.equal(seen[2][1].config.iceTransportPolicy, undefined);
  const l = new Link({}, { relay: true });
  assert.equal(l.relay, true);
  assert.equal(new Link({}).relay, false);
});

test('the page ships a content-security policy with no plugins, no <base>, no form posts', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /Content-Security-Policy[^>]*object-src 'none'[^>]*base-uri 'none'[^>]*form-action 'none'/);
  assert.match(html, /no-referrer/);
});

test('a camera that arrives AFTER release() is switched off again (permission prompt still open when the player left)', async () => {
  const tracks = [{ readyState: 'live', stop() { this.readyState = 'ended'; } }];
  let grant;
  const pending = new Promise(r => { grant = () => r({ getTracks: () => tracks, getVideoTracks: () => tracks }); });
  Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: { getUserMedia: () => pending } }, configurable: true });
  const video = { srcObject: null, classList: { toggle() {} }, play: async () => {}, pause() {}, videoWidth: 640, videoHeight: 480 };
  const cam = new HandCam(video, { getContext: () => ({ clearRect() {} }), classList: { toggle() {} }, width: 0, height: 0 });
  const started = cam.startCamera();
  cam.release();                                   // the player leaves while the camera is still starting
  grant();
  assert.equal(await started, 'cancelled');
  assert.equal(tracks[0].readyState, 'ended', 'the late stream was stopped, not left running');
  assert.equal(cam.cameraOn, false);
  assert.equal(video.srcObject, null);
});

test('if the camera ends by itself (permission revoked, unplugged) the game is told and nothing keeps running', async () => {
  const handlers = [];
  const tracks = [{ readyState: 'live', stop() { this.readyState = 'ended'; }, addEventListener: (e, h) => handlers.push([e, h]) }];
  const stream = { getTracks: () => tracks, getVideoTracks: () => tracks };
  Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: { getUserMedia: async () => stream } }, configurable: true });
  const video = { srcObject: null, classList: { toggle() {} }, play: async () => {}, pause() {}, videoWidth: 640, videoHeight: 480 };
  const cam = new HandCam(video, { getContext: () => ({ clearRect() {} }), classList: { toggle() {} }, width: 0, height: 0 });
  let lost = 0; cam.onLost = () => lost++;
  assert.equal(await cam.startCamera(), null);
  assert.ok(handlers.some(([e]) => e === 'ended'), 'listens for the track ending');
  tracks[0].readyState = 'ended';
  handlers.find(([e]) => e === 'ended')[1]();      // the OS ended the track
  assert.equal(lost, 1);
  assert.equal(cam.cameraOn, false);
  assert.equal(video.srcObject, null);
});
