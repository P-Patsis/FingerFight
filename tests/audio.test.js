import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const { sfx, music, TRACKS } = await import('../js/audio.js');
const fx = await import('../js/fx.js');

test('every sound effect and the music player are safe to call before any tap (no audio context yet)', () => {
  for (const n of ['ui', 'tick', 'fight', 'roundStart', 'roundEnd', 'whoosh', 'hit', 'block', 'miss', 'ko', 'win', 'lose']) assert.doesNotThrow(() => sfx[n](), n);
  assert.doesNotThrow(() => { music.setArena(2); music.stop(); music.resume(); music.pauseSoon(); });
});

test('mute and volume are remembered (localStorage), clamped, and survive a broken localStorage', () => {
  sfx.setMuted(true); assert.equal(store.get('ff-muted'), '1'); assert.equal(sfx.muted, true);
  sfx.setMuted(false); assert.equal(store.get('ff-muted'), '0');
  sfx.setVolume(0.4); assert.equal(store.get('ff-vol'), '0.4'); assert.equal(sfx.volume, 0.4);
  sfx.setVolume(7); assert.equal(sfx.volume, 1); sfx.setVolume(-3); assert.equal(sfx.volume, 0);
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.doesNotThrow(() => { sfx.setMuted(true); sfx.setVolume(0.5); });
});

test('one music file per arena exists, is an Ogg, and the whole audio folder is under 4 MB', () => {
  assert.equal(TRACKS.length, 5, 'five arenas');
  let total = 0;
  for (const t of TRACKS) {
    const f = path.join(root, t);
    assert.ok(fs.existsSync(f), 'missing ' + t);
    const b = fs.readFileSync(f);
    assert.equal(b.subarray(0, 4).toString(), 'OggS', t + ' is not an Ogg file');
    total += b.length;
  }
  assert.ok(total < 4 * 1024 * 1024, 'audio is ' + total + ' bytes');
});

test('every track is credited with a source URL and the CC0 licence', () => {
  const credits = fs.readFileSync(path.join(root, 'assets/audio/CREDITS.md'), 'utf8');
  for (const t of TRACKS) {
    const name = path.basename(t);
    const row = credits.split('\n').find(l => l.includes('`' + name + '`'));
    assert.ok(row, name + ' is not in CREDITS.md');
    assert.match(row, /https:\/\/opengameart\.org\/content\//, name + ' has no source URL');
  }
  assert.match(credits, /CC0/);
});

test('effects never throw without a browser (decoration must not break a match)', () => {
  for (const f of ['burst', 'confetti', 'rain', 'flash', 'shake', 'combo', 'wipe', 'clearFx']) assert.doesNotThrow(() => fx[f](10, 10, {}), f);
  assert.equal(typeof fx.reducedMotion(), 'boolean');
});

const log = [];          // shared by the two tests below: the audio context is created once, by the first of them
test('all audio pauses when the page is hidden or blurred and resumes when it is visible and focused; mute and volume are untouched', () => {
  globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const gain = () => ({ gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() { return this; }, disconnect() {} });
  class FakeCtx {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createGain() { return gain(); }
    suspend() { this.state = 'suspended'; log.push('suspend'); }
    resume() { this.state = 'running'; log.push('resume'); }
  }
  globalThis.window = { AudioContext: FakeCtx };
  sfx.setMuted(false); sfx.setVolume(0.6);
  sfx.unlock();
  assert.equal(sfx.background, false);
  sfx.setBackground(true);                                  // hidden / blurred
  assert.deepEqual(log, ['suspend']); assert.equal(sfx.background, true);
  sfx.setBackground(true); assert.deepEqual(log, ['suspend'], 'asking twice does nothing more');
  sfx.unlock();                                             // a stray tap-handler while away must not restart the sound
  assert.deepEqual(log, ['suspend'], 'still paused');
  sfx.setBackground(false);                                 // visible and focused again
  assert.deepEqual(log, ['suspend', 'resume']);
  assert.equal(sfx.muted, false); assert.equal(sfx.volume, 0.6, 'mute and volume state are the same as before');
  sfx.setMuted(true); sfx.setBackground(true); sfx.setBackground(false);
  assert.equal(sfx.muted, true, 'a muted game stays muted after coming back');
  sfx.setMuted(false);
  delete globalThis.window;
});

test('the page events drive it: visibilitychange / blur / pagehide pause, visible + focus / pageshow resume', async () => {
  const { bindPageFocus } = await import('../js/audio.js');
  log.length = 0; sfx.setBackground(false); log.length = 0;
  const mk = () => { const l = {}; return { l, addEventListener: (t, f) => { l[t] = f; } }; };
  const doc = Object.assign(mk(), { hidden: false, focused: true, hasFocus() { return this.focused; } }), win = mk();
  bindPageFocus(doc, win);
  doc.hidden = true; doc.l.visibilitychange();
  assert.deepEqual(log, ['suspend'], 'hidden tab: paused');
  doc.hidden = false; doc.focused = false; doc.l.visibilitychange();
  assert.deepEqual(log, ['suspend'], 'visible but not focused: still paused');
  doc.focused = true; win.l.focus();
  assert.deepEqual(log, ['suspend', 'resume'], 'visible and focused: playing again');
  win.l.blur(); assert.equal(sfx.background, true);
  doc.hasFocus = () => true; win.l.pageshow(); assert.equal(sfx.background, false);
  win.l.pagehide(); assert.equal(sfx.background, true); win.l.focus(); assert.equal(sfx.background, false);
  delete globalThis.window;
});
