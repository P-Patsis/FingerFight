// Local stats: wins / losses / matches, the numbers shown and guessed, the favourite number, storage that fails, and the Stats screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser } from './harness.js';
import { Stats, favouriteOf, STATS_KEY } from '../js/stats.js';

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };

test('matches, wins and losses count up and are remembered', () => {
  const st = mem(), s = new Stats(st);
  assert.deepEqual([s.matches, s.wins, s.losses], [0, 0, 0]);
  s.recordMatch(true); s.recordMatch(true); s.recordMatch(false);
  assert.deepEqual([s.matches, s.wins, s.losses], [3, 2, 1]);
  const back = new Stats(st);
  assert.deepEqual([back.matches, back.wins, back.losses], [3, 2, 1], 'after a reload');
});

test('favourite number = the count shown most often; the favourite guess is tracked separately; ties go to the smaller number', () => {
  const s = new Stats(mem());
  assert.equal(s.favouriteShown, null); assert.equal(s.favouriteGuess, null);
  [3, 5, 5, 2, 5, 3].forEach(n => s.recordShown(n));
  [1, 1, 4].forEach(n => s.recordGuess(n));
  assert.deepEqual(s.favouriteShown, { n: 5, times: 3 }); assert.deepEqual(s.favouriteGuess, { n: 1, times: 2 });
  s.recordShown(3); s.recordShown(3);
  assert.deepEqual(s.favouriteShown, { n: 3, times: 4 });
  const tie = new Stats(mem()); tie.recordShown(7); tie.recordShown(2);
  assert.deepEqual(tie.favouriteShown, { n: 2, times: 1 });
  assert.equal(favouriteOf([0, 0, 0]), null);
});

test('junk is ignored: bad counts are not recorded, hostile or broken storage gives clean zeros, a throwing storage still works in memory', () => {
  const s = new Stats(mem());
  for (const bad of [-1, 11, 2.5, '3', null, undefined, NaN, {}]) { s.recordShown(bad); s.recordGuess(bad); }
  assert.equal(s.shown.reduce((a, b) => a + b), 0); assert.equal(s.guessed.reduce((a, b) => a + b), 0);
  const st = mem(); st.m.set(STATS_KEY, JSON.stringify({ w: -4, l: 'x', shown: [1, 'a', 3, null, 1e12], guessed: 'nope' }));
  const j = new Stats(st);
  assert.deepEqual([j.wins, j.losses], [0, 0]); assert.deepEqual(j.shown.slice(0, 5), [1, 0, 3, 0, 0]); assert.equal(j.shown.length, 11);
  st.m.set(STATS_KEY, '{not json'); assert.equal(new Stats(st).matches, 0);
  const broken = new Stats({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  assert.doesNotThrow(() => { broken.recordMatch(true); broken.recordShown(4); });
  assert.deepEqual([broken.wins, broken.shown[4]], [1, 1]);
  s.recordMatch(true); s.reset(); assert.equal(s.matches, 0);
});

test('the Stats screen: reachable from the menu, shows the numbers, goes back, and reset asks first', async () => {
  const b = installBrowser('?sim=1');
  const $ = id => b.byId.get(id);
  globalThis.localStorage.setItem(STATS_KEY, JSON.stringify({ w: 3, l: 1, shown: [0, 0, 0, 4, 1, 9, 0, 0, 0, 0, 0], guessed: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0] }));
  await import('../js/main.js');
  assert.deepEqual(b.visible(), ['menu']);
  $('statsBtn').onclick();
  assert.deepEqual(b.visible(), ['stats']);
  assert.equal($('stMatches').textContent, '4'); assert.equal($('stWins').textContent, '3'); assert.equal($('stLosses').textContent, '1'); assert.equal($('stRate').textContent, '75%');
  assert.match($('stFavShown').textContent, /^5 /); assert.match($('stFavShown').textContent, /9/); assert.match($('stFavGuess').textContent, /^1 /);
  globalThis.confirm = () => false; $('statsReset').onclick();
  assert.equal($('stMatches').textContent, '4', 'declined: nothing reset');
  globalThis.confirm = () => true; $('statsReset').onclick();
  assert.equal($('stMatches').textContent, '0'); assert.equal($('stFavShown').textContent, '-'); assert.equal($('stRate').textContent, '-');
  delete globalThis.confirm;
  $('statsBack').onclick();
  assert.deepEqual(b.visible(), ['menu']);
});
