// Playtest polish: default max 5, fewer fingers every 5 rounds (with a notice), warning text, turn messages, HIT! timing,
// camera auto-start rule, profile preview.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULTS, normalizeSettings, effectiveMax, shrinkNotice, SHRINK_EVERY, SHRINK_FLOOR, CAMERA_WARNING, cameraWarning, turnMessage, TURN_SHOW, TURN_GUESS, HIT_MS, autoCameraWanted } from '../js/logic.js';
import { drawViewPreview } from '../js/avatars.js';
import { getSkin } from '../js/skins.js';

test('the default finger limit is 5 and can still be raised to 10', () => {
  assert.equal(DEFAULTS.maxFingers, 5);
  assert.equal(normalizeSettings({}).maxFingers, 5);
  assert.equal(normalizeSettings({ maxFingers: 10 }).maxFingers, 10);
  assert.equal(normalizeSettings({ maxFingers: 99 }).maxFingers, 10);
  assert.equal(normalizeSettings({ maxFingers: 7 }).maxFingers, 7);
});

test('fewer fingers: the ceiling drops by 1 after every 5 rounds, floor 3', () => {
  assert.equal(SHRINK_EVERY, 5); assert.equal(SHRINK_FLOOR, 3);
  const s = normalizeSettings({ shrink: true, maxFingers: 8 });
  const seq = []; for (let r = 1; r <= 31; r++) seq.push(effectiveMax(s, r));
  assert.deepEqual(seq.slice(0, 5), [8, 8, 8, 8, 8]);
  assert.deepEqual(seq.slice(5, 10), [7, 7, 7, 7, 7]);
  assert.deepEqual(seq.slice(10, 15), [6, 6, 6, 6, 6]);
  assert.equal(seq[25], 3); assert.equal(seq[30], 3);
});

test('players are told when the ceiling changes, and only then', () => {
  const s = normalizeSettings({ shrink: true, maxFingers: 5 });
  const notes = [1, 2, 5, 6, 7, 10, 11, 12, 30].map(r => shrinkNotice(s, r));
  assert.deepEqual(notes, ['', '', '', 'Max fingers is now 4', '', '', 'Max fingers is now 3', '', '']);
  assert.equal(shrinkNotice(normalizeSettings({ maxFingers: 5 }), 6), '', 'nothing when the option is off');
});

test('photo warning text is exact and only photo views carry it', () => {
  assert.equal(CAMERA_WARNING, 'Warning: this sends a real photo of you to your opponent.');
  assert.equal(cameraWarning('photo-puppet'), CAMERA_WARNING);
  assert.equal(cameraWarning('photo-skeleton'), CAMERA_WARNING);
  assert.equal(cameraWarning('puppet'), ''); assert.equal(cameraWarning('skeleton'), '');
});

test('turn messages', () => {
  assert.equal(TURN_SHOW, 'Your turn to show fingers'); assert.equal(TURN_GUESS, 'Your turn to guess');
  assert.equal(turnMessage(true), 'Your turn to show fingers'); assert.equal(turnMessage(false), 'Your turn to guess');
});

test('HIT! feedback stays half a second longer than before (1300 ms)', () => {
  assert.equal(HIT_MS, 1300 + 500);
  const src = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.ok(src.includes("showBanner('HIT!', text, HIT_MS, 'good')"), 'the banner says HIT! for HIT_MS');
});

test('camera auto-start: one try, never while busy or after a failure, never when ready', () => {
  assert.equal(autoCameraWanted({ ready: false, busy: false, failed: false }), true);
  assert.equal(autoCameraWanted({ ready: true }), false);
  assert.equal(autoCameraWanted({ busy: true }), false);
  assert.equal(autoCameraWanted({ failed: true }), false);
  assert.equal(autoCameraWanted(), true);
});

test('the lobby starts the camera by itself and shows the button only on failure', () => {
  const src = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.ok(/autoCameraWanted\(\{ ready: camReady, busy: camBusy, failed: camAutoFailed \}\)\) enableCamera\(\)/.test(src));
  assert.ok(src.includes("$('camBtn').hidden = camReady || camBusy;"));
  assert.ok(src.includes("camAutoFailed = true; $('camBtn').disabled = false"), 'failure shows the button again');
});

function fakeCtx() {
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (k === 'calls' ? calls : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => { calls.push(k); }), set: () => true });
  return ctx;
}
test('the profile preview draws every view; photo views get a stand-in picture, never real pixels', () => {
  const skin = getSkin('plain');
  for (const [mode, camera, hand] of [['skeleton', false, 'skeleton'], ['puppet', false, 'puppet'], ['photo-skeleton', true, 'skeleton'], ['photo-puppet', true, 'puppet']]) {
    const r = drawViewPreview(fakeCtx(), 240, 150, mode, skin);
    assert.deepEqual(r, { camera, hand }, mode);
  }
});

test('markup: preview canvas, compact non-sticky code box, floating join panel, no bar behind the back button, badge wraps', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.ok(html.includes('id="viewPreview"'));
  assert.ok(/\.lobby-top \{[^}]*position: static/.test(css), 'the code box no longer sticks over the settings');
  assert.ok(!/\.lobby-top \{ top: /.test(css));
  assert.ok(/#joinPrompt \{[^}]*position: fixed/.test(css), 'the join request floats on top');
  assert.ok(/\.topbar \{[^}]*background: none/.test(css), 'no bar behind the back button');
  assert.ok(/\.net-badge \{[^}]*white-space: normal/.test(css) && /\.net-badge \{[^}]*max-width: calc\(100vw/.test(css), 'the connection text wraps inside the screen');
  assert.ok(html.includes('id="copyBtn"') && html.includes('id="shareBtn"'));
});
