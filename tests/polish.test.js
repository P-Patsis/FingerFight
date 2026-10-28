// Gameplay polish: skeleton scaling, anti-grief, shrinking finger limit, wake lock, camera flip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawSkeletonPicture } from '../js/avatars.js';
import { normalizeSettings, effectiveMax, trackIdle, newIdle, IDLE_ROUNDS, SHRINK_FLOOR, resolveRound } from '../js/logic.js';
import { createWakeLock } from '../js/wake.js';
import { HandCam } from '../js/hands.js';

// ---- skeleton scaling -------------------------------------------------------------------------------------------
function pointCtx() {
  const pts = [];
  return { pts, ctx: new Proxy({}, { get: (_, k) => (k === 'moveTo' || k === 'lineTo' ? (x, y) => pts.push([x, y]) : () => {}), set: () => true }) };
}
const hand = (cx, cy, size) => Array.from({ length: 21 }, (_, i) => [Math.round(cx + Math.cos(i) * size), Math.round(cy + Math.sin(i * 1.7) * size)]);
const span = pts => ({ w: Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0])), h: Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1])) });

test('a hand far from the camera (tiny in the frame) is drawn large and centred in the picture', () => {
  for (const [cx, cy] of [[100, 100], [500, 500], [900, 880]]) {
    const { pts, ctx } = pointCtx();
    drawSkeletonPicture(ctx, 240, 180, [hand(cx, cy, 25)], [], 1.333, false);
    const s = span(pts);
    assert.ok(s.h > 180 * 0.6 || s.w > 240 * 0.6, `fills the area (got ${Math.round(s.w)}x${Math.round(s.h)}) for a hand at ${cx},${cy}`);
    assert.ok(Math.min(...pts.map(p => p[0])) >= 0 && Math.max(...pts.map(p => p[0])) <= 240 && Math.min(...pts.map(p => p[1])) >= 0 && Math.max(...pts.map(p => p[1])) <= 180, 'stays inside the picture');
  }
});

test('a near (big) hand and two hands still fit the picture; a degenerate single point does not blow up', () => {
  for (const lms of [[hand(500, 500, 450)], [hand(250, 500, 200), hand(750, 500, 200)], [Array.from({ length: 21 }, () => [500, 500])]]) {
    const { pts, ctx } = pointCtx();
    drawSkeletonPicture(ctx, 240, 180, lms, [], 1.333, false);
    assert.ok(pts.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[0] >= -1 && p[0] <= 241 && p[1] >= -1 && p[1] <= 181));
  }
});

// ---- anti-grief -------------------------------------------------------------------------------------------------
test('anti-grief: the idle limit is a clear constant (3) and a warning comes one round before the forfeit', () => {
  assert.equal(IDLE_ROUNDS, 3);
  let s = trackIdle(newIdle(), { host: false, guest: true });
  assert.deepEqual([s.idle.guest, s.warn, s.forfeit], [1, [], null]);
  s = trackIdle(s.idle, { host: false, guest: true });
  assert.deepEqual([s.idle.guest, s.warn, s.forfeit], [2, ['guest'], null], 'warned after 2');
  s = trackIdle(s.idle, { host: false, guest: true });
  assert.equal(s.forfeit, 'guest', 'forfeit on the 3rd');
});

test('anti-grief: seeing a hand resets the counter; both idle forfeits nobody', () => {
  let s = trackIdle(newIdle(), { host: true, guest: false });
  s = trackIdle(s.idle, { host: true, guest: false });
  s = trackIdle(s.idle, { host: false, guest: false });
  assert.equal(s.idle.host, 0);
  s = trackIdle(s.idle, { host: true, guest: true }); s = trackIdle(s.idle, { host: true, guest: true }); s = trackIdle(s.idle, { host: true, guest: true });
  assert.equal(s.forfeit, null);
});

test('anti-grief: an idle round never scores for or against anyone', () => {
  assert.equal(resolveRound({ pointer: 'host', count: 0, guess: 3, noHand: true }).damage, 0);
  assert.equal(resolveRound({ pointer: 'host', count: 3, guess: null, noHand: false }).damage, 0);
});

// ---- reduce fingers over time -----------------------------------------------------------------------------------
test('shrink is OFF by default and survives normalisation only when exactly true', () => {
  assert.equal(normalizeSettings({}).shrink, false);
  assert.equal(normalizeSettings({ shrink: 'yes' }).shrink, false);
  assert.equal(normalizeSettings({ shrink: true }).shrink, true);
  assert.equal(effectiveMax(normalizeSettings({}), 50), 10, 'off = never changes');
});

test('shrink lowers the limit every 2 rounds down to the floor, never above the host limit', () => {
  const on = normalizeSettings({ shrink: true });
  assert.deepEqual([1, 2, 3, 4, 5, 13, 14, 40].map(r => effectiveMax(on, r)), [10, 10, 9, 9, 8, 4, 4, SHRINK_FLOOR]);
  const five = normalizeSettings({ shrink: true, maxFingers: 5 });
  assert.deepEqual([1, 3, 5, 99].map(r => effectiveMax(five, r)), [5, 4, 3, 3]);
  assert.equal(effectiveMax(normalizeSettings({ shrink: true, maxFingers: 2 }), 30), 2, 'a limit already below the floor stays');
});

// ---- wake lock --------------------------------------------------------------------------------------------------
function fakeEnv(supported = true) {
  const listeners = {};
  const locks = [];
  const nav = supported ? { wakeLock: { request: async () => { const l = { released: false, release: async () => { l.released = true; }, addEventListener() {} }; locks.push(l); return l; } } } : {};
  const doc = { hidden: false, addEventListener: (t, f) => { listeners[t] = f; } };
  return { nav, doc, locks, fire: () => listeners.visibilitychange() };
}

test('wake lock: taken while a match is wanted, released when it ends', async () => {
  const e = fakeEnv(); const w = createWakeLock(e);
  await w.want(true);
  assert.equal(w.active, true); assert.equal(e.locks.length, 1);
  await w.want(true);
  assert.equal(e.locks.length, 1, 'no second lock');
  await w.want(false);
  assert.equal(w.active, false); assert.equal(e.locks[0].released, true);
});

test('wake lock: released when the page hides, taken again on return while the match is still on', async () => {
  const e = fakeEnv(); const w = createWakeLock(e);
  await w.want(true);
  e.doc.hidden = true; e.fire(); await new Promise(r => setImmediate(r));
  assert.equal(w.active, false);
  e.doc.hidden = false; e.fire(); await new Promise(r => setImmediate(r));
  assert.equal(w.active, true); assert.equal(e.locks.length, 2);
  await w.want(false); e.doc.hidden = true; e.fire(); e.doc.hidden = false; e.fire(); await new Promise(r => setImmediate(r));
  assert.equal(w.active, false, 'not re-taken after the match ended');
});

test('wake lock: unsupported browser or a denied request is harmless', async () => {
  const w = createWakeLock(fakeEnv(false));
  assert.equal(w.supported, false);
  await w.want(true); await w.want(false);
  const denied = fakeEnv(); denied.nav.wakeLock.request = async () => { throw new Error('NotAllowedError'); };
  const d = createWakeLock(denied);
  await d.want(true);
  assert.equal(d.active, false);
});

// ---- camera flip ------------------------------------------------------------------------------------------------
function flipRig({ facingModeWorks }) {
  const asked = [];
  const mk = facing => { const t = { readyState: 'live', stop() { this.readyState = 'ended'; }, getSettings: () => ({ facingMode: facing, deviceId: facing === 'user' ? 'F' : 'B' }) }; return { getTracks: () => [t], getVideoTracks: () => [t] }; };
  const devices = [{ kind: 'videoinput', deviceId: 'F' }, { kind: 'videoinput', deviceId: 'B' }];
  const getUserMedia = async ({ video }) => {
    asked.push(video);
    if (video.deviceId) return mk(video.deviceId.exact === 'B' ? 'environment' : 'user');
    if (video.facingMode.exact && !facingModeWorks) throw Object.assign(new Error('x'), { name: 'OverconstrainedError' });
    return mk(video.facingMode.exact || video.facingMode.ideal);
  };
  Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: { getUserMedia, enumerateDevices: async () => devices } }, configurable: true });
  const classes = new Set();
  const video = { srcObject: null, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) }, play: async () => {}, pause() {}, videoWidth: 640, videoHeight: 480 };
  const canvas = { getContext: () => ({ clearRect() {} }), classList: { toggle() {} }, width: 0, height: 0 };
  return { cam: new HandCam(video, canvas), asked, classes, video };
}

test('flip: switches front -> back (exact facingMode), un-mirrors the view, and flips back again', async () => {
  const { cam, asked, classes } = flipRig({ facingModeWorks: true });
  assert.equal(await cam.startCamera(), null);
  assert.equal(classes.has('mirror'), true, 'front camera is mirrored');
  assert.equal(await cam.flip(), null);
  assert.equal(cam.facing, 'environment'); assert.equal(classes.has('mirror'), false);
  assert.deepEqual(asked.at(-1).facingMode, { exact: 'environment' });
  assert.equal(await cam.flip(), null);
  assert.equal(cam.facing, 'user'); assert.equal(classes.has('mirror'), true);
  assert.equal(cam.cameraOn, true);
});

test('flip: a browser that ignores facingMode falls back to choosing the other camera by id', async () => {
  const { cam, asked } = flipRig({ facingModeWorks: false });
  await cam.startCamera();
  assert.equal(await cam.flip(), null);
  assert.deepEqual(asked.at(-1).deviceId, { exact: 'B' });
  assert.equal(cam.facing, 'environment');
});

test('flip: with only one camera the old one is restored and a readable message comes back', async () => {
  const { cam } = flipRig({ facingModeWorks: false });
  navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'F' }];
  await cam.startCamera();
  const msg = await cam.flip();
  assert.match(msg, /No other camera/);
  assert.equal(cam.facing, 'user'); assert.equal(cam.cameraOn, true, 'the camera that worked is running again');
});

test('flip: does nothing (and does not turn the camera on) when the camera is off', async () => {
  const { cam } = flipRig({ facingModeWorks: true });
  assert.match(await cam.flip(), /off/);
  assert.equal(cam.cameraOn, false);
});
