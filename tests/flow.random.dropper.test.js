// Random match, I am the one who dropped (copy of the random-host setup): nobody is waiting, so the searcher claims a slot and a stranger connects to it.
// Also: cancelling a search, and starting a new one straight after, must not interfere. Strangers only ever exchange drawn data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, peers, network, FakePeer, sleep, until } from './harness.js';

const b = installBrowser('?sim=1');
const $ = id => b.byId.get(id);
await import('../js/main.js');

const simButton = (sel, value) => $('bottomContent').querySelectorAll(sel).find(x => Object.values(x.dataset)[0] === value);
const picture = (over = {}) => ({ view: 'avatar', skin: 'zombie', hands: [{ thumb: false, index: true, middle: true, ring: true, pinky: false }], lm: null, ar: 1.333, photo: '', ...over });
const slotHeld = () => [...network.keys()].filter(k => k.startsWith('ffight-r-'));

test('searching shows a cancel button; with nobody around it claims a slot and waits', async () => {
  $('randomBtn').onclick();
  assert.equal($('cancelBtn').hidden, false); assert.equal($('randomBtn').hidden, true); assert.equal($('createBtn').disabled, true);
  await until(() => slotHeld().length === 1, 'a waiting slot is registered');
  assert.deepEqual(slotHeld(), ['ffight-r-0']);
  assert.match($('menuMsg').textContent, /Waiting for an opponent/);
});

test('cancelling frees the slot and restores the menu; a new search straight afterwards works normally', async () => {
  $('cancelBtn').onclick();
  assert.equal($('cancelBtn').hidden, true); assert.equal($('randomBtn').hidden, false); assert.equal($('createBtn').disabled, false);
  assert.match($('menuMsg').textContent, /cancelled/i);
  await until(() => slotHeld().length === 0, 'the slot is released');
  $('randomBtn').onclick();                                    // immediately search again
  await until(() => slotHeld().length === 1, 'waiting again');
  await sleep(400);                                            // the cancelled search finishes unwinding meanwhile
  assert.deepEqual(slotHeld(), ['ffight-r-0'], 'the stale search did not tear down the new one');
});

let stranger, conn, got = [];
test('a stranger connects and is accepted at once (no approval); the lobby is the safe one', async () => {
  stranger = new FakePeer();
  conn = stranger.connect('ffight-r-0');
  conn.on('data', m => got.push(m));
  conn.on('open', () => conn.send({ t: 'hello', v: 2, kind: 'random', name: 'Fighter 4242' }));
  await until(() => b.visible()[0] === 'lobby' && got.some(m => m.t === 'welcome'), 'matched: lobby and welcome sent');
  const welcome = got.find(m => m.t === 'welcome');
  assert.equal(welcome.kind, 'random');
  assert.equal(welcome.name, 'Fighter', 'random opponents see the profile name (no typed name here, so the default)');
  assert.equal($('joinPrompt').hidden, true);
  assert.equal($('randomNote').hidden, false); assert.equal($('privateBox').hidden, true);
  assert.equal($('settingsCard').hidden, true); assert.equal($('startBtn').hidden, true);
  assert.equal($('nameGuest').textContent, 'Fighter 4242');
  assert.equal($('randomBtn').hidden, false, 'search UI is reset');
});

test('photo reveal styles are unavailable against a random opponent and cannot be forced', async () => {
  const modes = $('modePicker').children;
  assert.deepEqual(modes.filter(x => x.disabled).map(x => x.dataset.mode).sort(), ['blur', 'photo', 'photo-skeleton']);
  modes.find(x => x.dataset.mode === 'photo').onclick();
  assert.notEqual(modes.find(x => x.classList.contains('sel')).dataset.mode, 'photo');
  assert.equal($('photoRow').hidden, true);
  assert.match($('styleNote').textContent, /only drawn data/i);
});

test('if MY connection died I lose, and say so', async () => {
  conn.send({ t: 'ready', ready: true });
  await until(() => got.some(m => m.t === 'round'), 'a fight is on', 8000);
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
  conn.close();
  await until(() => b.visible()[0] === 'menu', 'back at the menu');
  assert.match($('menuMsg').textContent, /You lost the match/);
  setTimeout(() => process.exit(0), 50).unref();
});
