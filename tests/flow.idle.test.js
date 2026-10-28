// Anti-grief end to end: a guest who shows no hand for 3 rounds in a row forfeits, so the host is not left waiting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, peers, sleep, until, Conn } from './harness.js';

const b = installBrowser('?sim=1');
const $ = id => b.byId.get(id);
await import('../js/main.js');

const sentOf = (conn, t) => conn.sent.filter(m => m.t === t);
const hostPeer = () => peers.find(p => p.id?.startsWith('ffight-p-'));
const picture = (over = {}) => ({ view: 'avatar', skin: 'gold', hands: [{ thumb: false, index: false, middle: false, ring: false, pinky: false }], lm: null, ar: 1.333, photo: '', ...over });
let conn;

test('a guest who never shows a hand forfeits after 3 rounds; the host wins and the room stays', async () => {
  $('nameInput').value = 'Hank';
  await $('createBtn').onclick();
  conn = new Conn(); hostPeer().emit('connection', conn); conn.emit('open');
  conn.emit('data', { t: 'hello', v: 2, kind: 'private', name: 'Ghost' });
  $('acceptBtn').onclick();
  conn.emit('data', { t: 'ready', ready: true });
  await until(() => !$('startBtn').disabled, 'start enabled');
  const click = step => $('settingsCard').fire('click', { target: { closest: () => ({ dataset: { step } }) } });
  for (let i = 0; i < 7; i++) click('hits:1');          // 10 hits: nobody can be knocked out in 3 rounds
  click('seconds:-1'); click('seconds:-1');
  $('startBtn').onclick();

  // round 1: the guest guesses (no hand), round 2: the guest points (no hand), round 3: the guest guesses (no hand)
  await until(() => sentOf(conn, 'reveal').length === 1, 'host reveal 1', 15000);
  conn.emit('data', { t: 'guess', n: 1, guess: null, ...picture() });
  await until(() => sentOf(conn, 'round').length === 2, 'round 2', 15000);
  conn.emit('data', { t: 'reveal', n: 2, count: 0, gesture: null, noHand: true, ...picture() });
  await until(() => sentOf(conn, 'round').length === 3, 'round 3', 20000);
  assert.equal(b.visible()[0], 'game', 'two idle rounds only warn: the match goes on');
  await until(() => sentOf(conn, 'reveal').length === 2, 'host reveal 3', 15000);
  conn.emit('data', { t: 'guess', n: 3, guess: null, ...picture() });

  await until(() => b.visible()[0] === 'lobby', 'forfeit returns both to the lobby', 20000);
  assert.match($('lobbyMsg').textContent, /Ghost showed no hand for 3 rounds in a row, so Hank wins by forfeit/);
  assert.equal($('nameGuest').textContent, 'Ghost', 'the room is kept with the same guest');
  assert.equal(conn.open, true, 'the connection stays up');
  // the room is still alive and both are still ready (cameras were already enabled): the host can start another fight at once
  assert.equal($('startBtn').disabled, false);
});
