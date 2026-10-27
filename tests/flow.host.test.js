// Drives the real js/main.js as the HOST of a PRIVATE match (simulator mode) against a scripted guest: a declined
// stranger, then a friend who is accepted, then two whole games (a correct guess; a critical hit) and a clean exit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, peers, network, sleep, until, Conn } from './harness.js';

const b = installBrowser('?sim=1');
const $ = id => b.byId.get(id);
await import('../js/main.js');

const sentOf = (conn, t) => conn.sent.filter(m => m.t === t);
const simButton = (sel, value) => $('bottomContent').querySelectorAll(sel).find(x => Object.values(x.dataset)[0] === value);
let conn;                                   // the accepted friend's connection (the test's side of it is `conn.remote`)
const hostPeer = () => peers.find(p => p.id?.startsWith('ffight-p-'));
const connect = () => { const c = new Conn(); hostPeer().emit('connection', c); c.emit('open'); return c; };
const picture = (over = {}) => ({ view: 'avatar', skin: 'gold', hands: [{ thumb: false, index: true, middle: false, ring: false, pinky: false }], lm: null, ar: 1.333, photo: '', ...over });

test('the menu offers create / join / random; creating a match gives a long unique code', async () => {
  assert.deepEqual(b.visible(), ['menu']);
  for (const id of ['createBtn', 'joinBtn', 'randomBtn']) assert.ok($(id), id);
  $('nameInput').value = 'Hank';
  await $('createBtn').onclick();
  assert.deepEqual(b.visible(), ['lobby']);
  assert.match($('roomCode').textContent, /^([A-HJ-NP-Z2-9]{4}-){3}[A-HJ-NP-Z2-9]{4}$/, '16 characters in 4 groups');
  const code = $('roomCode').textContent.replaceAll('-', '');
  assert.equal(hostPeer().id, 'ffight-p-' + code);
  assert.equal($('privateBox').hidden, false);
  assert.equal($('randomNote').hidden, true);
});

test('copy puts the code on the clipboard', async () => {
  let copied = null;
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async t => { copied = t; } } }, configurable: true });
  await $('copyBtn').onclick();
  assert.equal(copied, $('roomCode').textContent);
});

test('someone with the wrong protocol or match kind is turned away', async () => {
  const c = connect();
  c.emit('data', { t: 'hello', v: 1, kind: 'private', name: 'Old' });
  assert.deepEqual(sentOf(c, 'rejected').length, 1);
  const c2 = connect();
  c2.emit('data', { t: 'hello', v: 2, kind: 'random', name: 'Wrong' });
  assert.equal(sentOf(c2, 'rejected').length, 1, 'a random-match hello is not accepted into a private match');
  assert.equal($('joinPrompt').hidden, true);
});

test('a joiner is shown to the host; declining sends them away and the room stays open', async () => {
  const stranger = connect();
  stranger.emit('data', { t: 'hello', v: 2, kind: 'private', name: 'Strang<b>er' });
  assert.equal($('joinPrompt').hidden, false);
  assert.match($('joinText').textContent, /Strangb?er wants to join/);
  assert.equal(sentOf(stranger, 'welcome').length, 0, 'nothing is revealed before the host accepts');
  $('rejectBtn').onclick();
  assert.equal(sentOf(stranger, 'rejected').length, 1);
  assert.equal($('joinPrompt').hidden, true);
  assert.equal($('nameGuest').textContent, 'Waiting…');
});

test('a friend joins and is accepted; both get ready; the host configures the fight', async () => {
  conn = connect();
  conn.emit('data', { t: 'hello', v: 2, kind: 'private', name: 'Guest<script>' });
  assert.equal($('joinPrompt').hidden, false);
  $('acceptBtn').onclick();
  assert.equal($('nameGuest').textContent, 'Guestscript', 'markup characters stripped');
  assert.equal(sentOf(conn, 'welcome')[0].name, 'Hank');
  assert.equal($('startBtn').disabled, true, 'not startable until both cameras are ready');
  conn.emit('data', { t: 'ready', ready: true });
  await until(() => !$('startBtn').disabled, 'start enabled once both are ready');

  // a third connection is told the room is full
  const late = connect();
  assert.equal(late.sent.filter(m => m.t === 'full').length, 1, 'a third connection is told the match is full');

  const click = step => $('settingsCard').fire('click', { target: { closest: () => ({ dataset: { step } }) } });
  click('hits:-1'); click('hits:-1'); click('seconds:-1'); click('seconds:-1');
  $('bgPicker').children[3].onclick();
  assert.deepEqual(sentOf(conn, 'settings').at(-1).settings, { seconds: 3, hits: 1, maxFingers: 10, background: 3 });
  assert.equal($('stage').className, 'bg-3');
});

test('game 1: the host points, the guesser is right, the host loses', async () => {
  $('startBtn').onclick();
  assert.deepEqual(b.visible(), ['game']);
  await until(() => sentOf(conn, 'round').length === 1, 'round 1 announced');
  await until(() => simButton('[data-count]', '4'), 'camera (simulator) controls for the pointer');
  simButton('[data-count]', '4').onclick();
  await until(() => sentOf(conn, 'reveal').length === 1, 'the pointer snaps and sends at 0', 9000);
  const rev = sentOf(conn, 'reveal')[0];
  assert.equal(rev.count, 4); assert.equal(rev.noHand, false); assert.equal(rev.gesture, null);
  assert.equal(rev.view, 'avatar', 'default reveal style is the cartoon hand'); assert.equal(rev.photo, '', 'no image leaves the phone');
  assert.equal(rev.hands[0].index && rev.hands[0].pinky, true, 'finger data for 4 fingers');

  for (const bad of [{ guess: 99, ...picture() }, { guess: 4, ...picture({ view: 'gif' }) }, { guess: 4, ...picture({ photo: 'http://evil/x.jpg' }) }, { guess: 4 }]) {
    conn.emit('data', { t: 'guess', n: 1, ...bad });
  }
  conn.emit('data', { t: 'guess', n: 7, guess: 4, ...picture() });         // wrong round
  await sleep(150);
  assert.equal($('topContent').children[0].textContent, '✋ ???', 'still waiting: nothing invalid was accepted');

  conn.emit('data', { t: 'guess', n: 1, guess: 4, ...picture() });         // right
  await until(() => b.visible()[0] === 'over', 'game over screen', 20000);
  assert.equal($('overTitle').textContent, 'YOU LOSE');
  assert.ok($('botHp').children[0].classList.contains('lost'));
  assert.equal($('againBtn').disabled, false);
});

test('game 2 (rematch): wrong guess + middle finger is only a miss (and the filter hides it); the host then wins', async () => {
  $('againBtn').onclick();
  assert.equal(sentOf(conn, 'start').length, 2);
  await until(() => sentOf(conn, 'round').length === 2, 'round 1 of the rematch');
  await until(() => simButton('[data-count]', '4'), 'controls again');
  simButton('[data-count]', '4').onclick();
  simButton('[data-g]', 'middle').onclick();
  await until(() => sentOf(conn, 'reveal').length === 2, 'reveal sent', 9000);
  assert.equal(sentOf(conn, 'reveal')[1].gesture, 'middle', 'the gesture is still detected and sent');
  conn.emit('data', { t: 'guess', n: 1, guess: 3, ...picture() });
  await until(() => $('topContent').children[0]?.className === 'reveal', 'reveal shown', 5000);
  assert.ok(!/MIDDLE/i.test($('topContent').textContent), 'the filter is on by default: the gesture is not named');
  assert.equal($('topHp').children[0].classList.contains('lost'), false, 'no damage for a wrong guess');
  await until(() => sentOf(conn, 'round').length === 3, 'round 2: the guest points', 12000);
  await until(() => simButton('[data-count]', '2'), 'guess controls');
  simButton('[data-count]', '2').onclick();
  conn.emit('data', { t: 'reveal', n: 2, count: 2, gesture: null, noHand: false, ...picture() });
  await until(() => b.visible()[0] === 'over', 'game over', 20000);
  assert.equal($('overTitle').textContent, 'YOU WIN!');
  assert.ok($('topHp').children[0].classList.contains('lost'));
});

test('the opponent leaving after the fight keeps the result screen, with a message and no rematch; Leave returns to the menu', () => {
  conn.emit('data', { t: 'bye' });
  assert.deepEqual(b.visible(), ['over']);
  assert.match($('overMsg').textContent, /opponent has left/);
  assert.equal($('againBtn').disabled, true);
  $('overLeave').onclick();
  assert.deepEqual(b.visible(), ['menu']);
  setTimeout(() => process.exit(0), 50).unref();
});
