// Random match: anti-grief forfeit ends the match (back to the menu, nothing held), and the screen wake lock is held
// during a random fight exactly as in a private one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, peers, network, FakePeer, until } from './harness.js';

const b = installBrowser('?sim=1');
const $ = id => b.byId.get(id);
const locks = [];
Object.defineProperty(globalThis.navigator, 'wakeLock', {
  value: { request: async () => { const l = { released: false, release: async () => { l.released = true; }, addEventListener() {} }; locks.push(l); return l; } },
  configurable: true,
});
await import('../js/main.js');

const picture = (over = {}) => ({ view: 'puppet', skin: 'robot', hands: [{ thumb: false, index: false, middle: false, ring: false, pinky: false }], lm: null, ar: 1.333, photo: '', ...over });
let stranger, conn, got = [];
const of = t => got.filter(m => m.t === t);

test('a random match is found and starts; the screen wake lock is held during the fight', async () => {
  $('randomBtn').onclick();
  await until(() => network.has('ffight-r-0'), 'a waiting slot');
  stranger = new FakePeer();
  conn = stranger.connect('ffight-r-0');
  conn.on('data', m => got.push(m));
  conn.on('open', () => conn.send({ t: 'hello', v: 2, kind: 'random', name: 'Ghost' }));
  await until(() => b.visible()[0] === 'lobby' && of('welcome').length, 'lobby');
  assert.equal(locks.length, 0, 'no lock in the lobby');
  conn.send({ t: 'ready', ready: true });
  await until(() => of('start').length, 'auto start', 8000);
  await until(() => b.visible()[0] === 'game', 'game screen');
  await until(() => locks.length === 1, 'wake lock requested for a random match');
  assert.equal(locks[0].released, false);
});

test('three idle rounds in a random match: the match ends at the menu, nothing is held, the lock is released', async () => {
  await until(() => of('reveal').length === 1, 'host reveal 1', 20000);
  conn.send({ t: 'guess', n: 1, guess: null, ...picture() });
  await until(() => of('round').length === 2, 'round 2', 20000);
  conn.send({ t: 'reveal', n: 2, count: 0, gesture: null, noHand: true, ...picture() });
  await until(() => of('round').length === 3, 'round 3', 25000);
  assert.equal(b.visible()[0], 'game', 'two idle rounds only warn');
  assert.equal(locks[0].released, false, 'still awake mid-match');
  await until(() => of('reveal').length === 2, 'host reveal 3', 20000);
  conn.send({ t: 'guess', n: 3, guess: null, ...picture() });

  await until(() => b.visible()[0] === 'menu', 'forfeit returns to the menu', 25000);
  assert.match($('menuMsg').textContent, /Ghost showed no hand for 3 rounds in a row/);
  assert.match($('menuMsg').textContent, /wins by forfeit/);
  await until(() => conn.open === false, 'the connection to the stranger is closed');
  assert.equal(network.has('ffight-r-0'), false, 'no slot is held');
  assert.equal(locks[0].released, true, 'screen may sleep again');
  setTimeout(() => process.exit(0), 50).unref();
});
