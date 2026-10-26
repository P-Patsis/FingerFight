// Drives the real js/main.js as the HOST (simulator mode) against a scripted guest, through two whole games:
// game 1 ends on a correct guess, game 2 on a critical hit. Also checks that bad messages are ignored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, peers, sleep, until, Conn } from './harness.js';

const b = installBrowser('?sim=1');
const $ = id => b.byId.get(id);
await import('../js/main.js');

const sentOf = (conn, t) => conn.sent.filter(m => m.t === t);
const simButton = (sel, value) => $('bottomContent').querySelectorAll(sel).find(x => Object.values(x.dataset)[0] === value);
const conn = new Conn();

test('menu shows first; the host creates a room', async () => {
  assert.deepEqual(b.visible(), ['menu']);
  $('nameInput').value = 'Hank';
  await $('createBtn').onclick();
  assert.deepEqual(b.visible(), ['lobby']);
  assert.match($('roomCode').textContent, /^[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(peers.at(-1).id, 'ffight-' + $('roomCode').textContent);
});

test('a guest joins (name cleaned), both get ready, the host configures the fight', async () => {
  peers.at(-1).emit('connection', conn);
  conn.emit('open');
  conn.emit('data', { t: 'hello', v: 1, name: 'Guest<script>' });
  assert.equal($('nameGuest').textContent, 'Guestscript', 'markup characters stripped');
  assert.equal(sentOf(conn, 'welcome')[0].name, 'Hank');
  assert.equal($('startBtn').disabled, true, 'not startable until both cameras are ready');
  conn.emit('data', { t: 'ready', ready: true });
  await until(() => !$('startBtn').disabled, 'start button enabled once both are ready');

  const click = step => $('settingsCard').fire('click', { target: { closest: () => ({ dataset: { step } }) } });
  click('hits:-1'); click('hits:-1'); click('seconds:-1'); click('seconds:-1');
  $('bgPicker').children[3].onclick();
  const last = sentOf(conn, 'settings').at(-1).settings;
  assert.deepEqual(last, { seconds: 3, hits: 1, crits: true, background: 3 });
  assert.equal($('stage').className, 'bg-3');
});

test('game 1: the host points, the guesser is right, the host loses', async () => {
  $('startBtn').onclick();
  assert.equal(sentOf(conn, 'start').length, 1);
  assert.deepEqual(b.visible(), ['game']);
  await until(() => sentOf(conn, 'round').length === 1, 'round 1 announced');
  assert.equal(sentOf(conn, 'round')[0].n, 1);
  await until(() => simButton('[data-count]', '4'), 'camera (simulator) controls for the pointer');
  simButton('[data-count]', '4').onclick();
  await until(() => sentOf(conn, 'reveal').length === 1, 'the pointer snaps and sends at 0', 9000);
  const rev = sentOf(conn, 'reveal')[0];
  assert.equal(rev.count, 4); assert.equal(rev.noHand, false); assert.equal(rev.gesture, null);
  assert.ok(rev.photo.startsWith('data:image/jpeg;base64,'));

  conn.emit('data', { t: 'guess', n: 1, guess: 99, photo: '' });          // invalid: ignored
  conn.emit('data', { t: 'guess', n: 7, guess: 4, photo: '' });           // wrong round: ignored
  conn.emit('data', { t: 'guess', n: 1, guess: 4, photo: 'http://evil/x.jpg' });   // bad photo: ignored
  await sleep(150);
  assert.equal($('topContent').children[0].textContent, '✋ ???', 'still waiting: nothing invalid was accepted');

  conn.emit('data', { t: 'guess', n: 1, guess: 4, photo: '' });           // right: the guesser holds up 4 fingers too
  await until(() => b.visible()[0] === 'over', 'game over screen', 20000);
  assert.equal($('overTitle').textContent, 'YOU LOSE');
  assert.ok($('botHp').children[0].classList.contains('lost'), 'host health bar emptied');
  assert.equal($('againBtn').disabled, false, 'the host can start a rematch');
});

test('game 2 (rematch): a wrong guess plus a middle finger is a critical hit; the host wins', async () => {
  $('againBtn').onclick();
  assert.equal(sentOf(conn, 'start').length, 2);
  await until(() => sentOf(conn, 'round').length === 2, 'round 1 of the rematch');
  await until(() => simButton('[data-count]', '4'), 'controls again');
  simButton('[data-count]', '4').onclick();
  simButton('[data-g]', 'middle').onclick();
  await until(() => sentOf(conn, 'reveal').length === 2, 'reveal sent', 9000);
  assert.equal(sentOf(conn, 'reveal')[1].gesture, 'middle');
  conn.emit('data', { t: 'guess', n: 1, guess: 3, photo: '' });           // wrong
  await until(() => b.visible()[0] === 'over', 'game over', 20000);
  assert.equal($('overTitle').textContent, 'YOU WIN!');
  assert.ok($('topHp').children[0].classList.contains('lost'), 'the guest health bar emptied');
});

test('the opponent leaving returns to the menu with a message', () => {
  conn.emit('data', { t: 'bye' });
  assert.deepEqual(b.visible(), ['menu']);
  assert.match($('menuMsg').textContent, /closed|left/);
  setTimeout(() => process.exit(0), 50).unref();
});
