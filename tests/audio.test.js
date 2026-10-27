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
