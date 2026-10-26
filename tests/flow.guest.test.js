// Drives the real js/main.js as the GUEST (simulator mode) against a scripted host: join by link, lobby, two games.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, peers, sleep, until } from './harness.js';

const b = installBrowser('?sim=1&room=ABCD');
const $ = id => b.byId.get(id);
await import('../js/main.js');

const sentOf = (conn, t) => conn.sent.filter(m => m.t === t);
const simButton = (sel, value) => $('bottomContent').querySelectorAll(sel).find(x => Object.values(x.dataset)[0] === value);
const SETTINGS = { seconds: 3, hits: 1, crits: true, background: 2 };
let conn;

test('the shared link pre-fills the room code; joining sends hello', async () => {
  assert.equal($('codeInput').value, 'ABCD');
  $('nameInput').value = 'Gina';
  await $('joinBtn').onclick();
  conn = peers.at(-1).conn;
  assert.deepEqual(b.visible(), ['lobby']);
  assert.equal($('roomCode').textContent, 'ABCD');
  assert.deepEqual(sentOf(conn, 'hello')[0], { t: 'hello', v: 1, name: 'Gina' });
});

test('the host welcomes the guest; settings are shown and locked; the guest says ready', async () => {
  conn.emit('data', { t: 'welcome', v: 1, name: 'Hank<b>', settings: SETTINGS, ready: true });
  assert.equal($('nameHost').textContent, 'Hankb');
  assert.equal($('stage').className, 'bg-2');
  assert.equal($('startBtn').hidden, true, 'only the host starts');
  assert.ok($('settingsCard').classList.contains('locked'));
  // a guest cannot change settings
  $('settingsCard').fire('click', { target: { closest: () => ({ dataset: { step: 'hits:1' } }) } });
  assert.equal($('valHits').textContent, '1');
  await until(() => sentOf(conn, 'ready').some(m => m.ready === true), 'guest reports its camera ready');
});

test('game 1: the guest guesses with fingers and is right; the host (pointer) loses', async () => {
  conn.emit('data', { t: 'start', settings: SETTINGS });
  assert.deepEqual(b.visible(), ['game']);
  conn.emit('data', { t: 'round', n: 5 });                                  // out of order: ignored
  conn.emit('data', { t: 'round', n: 1 });
  await until(() => simButton('[data-count]', '4'), 'the guesser also gets camera controls (no number pad)');
  assert.equal($('bottomContent').querySelectorAll('[data-g]').length, 0, 'the guesser has no gesture controls');
  simButton('[data-count]', '4').onclick();
  await until(() => sentOf(conn, 'guess').length === 1, 'the guesser snaps and sends at 0', 9000);
  const g = sentOf(conn, 'guess')[0];
  assert.equal(g.n, 1); assert.equal(g.guess, 4); assert.ok(g.photo.startsWith('data:image/jpeg;base64,'));

  conn.emit('data', { t: 'reveal', n: 1, count: 99, gesture: null, noHand: false, photo: '' });     // invalid
  conn.emit('data', { t: 'reveal', n: 1, count: 4, gesture: 'rude', noHand: false, photo: '' });    // invalid gesture
  await sleep(150);
  assert.equal($('topContent').children[0].textContent, '✋ ???', 'nothing invalid was accepted');
  conn.emit('data', { t: 'reveal', n: 1, count: 4, gesture: null, noHand: false, photo: '' });
  await until(() => b.visible()[0] === 'over', 'game over', 20000);
  assert.equal($('overTitle').textContent, 'YOU WIN!');
  assert.equal($('againBtn').disabled, true, 'only the host can start a rematch');
  assert.match($('againBtn').textContent, /host/i);
});

test('game 2 (rematch): the guest guesses wrong and takes a critical hit', async () => {
  conn.emit('data', { t: 'start', settings: SETTINGS });
  conn.emit('data', { t: 'round', n: 1 });
  await until(() => simButton('[data-count]', '2'), 'controls again');
  simButton('[data-count]', '2').onclick();
  await until(() => sentOf(conn, 'guess').length === 2, 'guess sent', 9000);
  conn.emit('data', { t: 'reveal', n: 1, count: 5, gesture: 'sideways', noHand: false, photo: '' });
  await until(() => b.visible()[0] === 'over', 'game over', 20000);
  assert.equal($('overTitle').textContent, 'YOU LOSE');
  setTimeout(() => process.exit(0), 50).unref();
});
