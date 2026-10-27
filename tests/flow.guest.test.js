// Drives the real js/main.js as the GUEST of a PRIVATE match (simulator mode): join through a shared link, be declined once,
// join again, be accepted, then two games. A friend's real photo is displayed; the guesser's own message never carries one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, peers, network, FakePeer, sleep, until } from './harness.js';

const CODE = 'ABCDEFGHJKLMNPQR';
const b = installBrowser('?sim=1', '#room=ABCD-EFGH-JKLM-NPQR');
const $ = id => b.byId.get(id);
await import('../js/main.js');

const SETTINGS = { seconds: 3, hits: 1, crits: true, background: 2 };
const simButton = (sel, value) => $('bottomContent').querySelectorAll(sel).find(x => Object.values(x.dataset)[0] === value);
const picture = (over = {}) => ({ view: 'avatar', skin: 'gold', hands: [{ thumb: false, index: true, middle: true, ring: true, pinky: true }], lm: null, ar: 1.333, photo: '', ...over });

// The test plays the HOST: a fake peer holding the room id and answering the guest's hello.
let hostConn, hostPeer, hello;
function openRoom() {
  hostPeer = new FakePeer('ffight-p-' + CODE);
  hostPeer.on('connection', c => { hostConn = c; c.on('data', m => { if (m.t === 'hello') hello = m; }); });
}
const sentByGuest = t => hostConn.received.filter(m => m.t === t);

test('the shared link fills in the code and is then removed from the address bar', () => {
  assert.equal($('codeInput').value, 'ABCD-EFGH-JKLM-NPQR');
  assert.equal(globalThis.history.calls.length, 1, 'the fragment is cleared after reading');
  assert.equal(globalThis.history.calls[0][2], '/fingerfight/?sim=1', 'only the #fragment is removed; the rest of the address stays');
});

test('a wrong code says there is no such match', async () => {
  $('codeInput').value = '1111-2222-3333-4444';
  await $('joinBtn').onclick();
  assert.match($('menuMsg').textContent, /no match with that code/i);
  assert.deepEqual(b.visible(), ['menu']);
  $('codeInput').value = 'tooshort';
  await $('joinBtn').onclick();
  assert.match($('menuMsg').textContent, /16 letters and digits/);
});

test('joining: the guest says hello and waits for the host to accept; a decline sends it back to the menu', async () => {
  openRoom();
  await sleep(20);
  $('codeInput').value = 'abcd-efgh-jklm-npqr';                  // pasted in lower case with dashes
  $('nameInput').value = 'Gina';
  await $('joinBtn').onclick();
  assert.deepEqual(b.visible(), ['lobby']);
  await until(() => hello, 'hello reaches the host');
  assert.match(hello.token, /^[A-Z0-9]{24}$/, 'a resume token is offered');
  delete hello.token;
  assert.deepEqual(hello, { t: 'hello', v: 2, kind: 'private', name: 'Gina' });
  assert.equal($('lobbyMsg').textContent, 'Waiting for the host to accept you…');
  hostConn.send({ t: 'rejected' });
  await until(() => b.visible()[0] === 'menu', 'declined: back to the menu');
  assert.match($('menuMsg').textContent, /declined/i);
});

test('joining again; accepted; settings shown and locked; guest reports ready', async () => {
  hello = null;
  await $('joinBtn').onclick();
  await until(() => hello, 'second hello');
  hostConn.send({ t: 'welcome', v: 2, kind: 'private', name: 'Hank<b>', settings: SETTINGS, ready: true });
  await until(() => $('nameHost').textContent === 'Hankb', 'welcome processed');
  assert.equal($('stage').className, 'bg-2');
  assert.equal($('startBtn').hidden, true, 'only the host starts');
  assert.ok($('settingsCard').classList.contains('locked'));
  $('settingsCard').fire('click', { target: { closest: () => ({ dataset: { step: 'hits:1' } }) } });
  assert.equal($('valHits').textContent, '1', 'a guest cannot change settings');
  assert.equal($('privateBox').hidden, true, 'the guest does not see the host controls');
  await until(() => sentByGuest('ready').some(m => m.ready === true), 'guest reports its camera ready');
});

test('a welcome of the wrong kind is ignored', async () => {
  const before = $('nameHost').textContent;
  hostConn.send({ t: 'welcome', v: 2, kind: 'random', name: 'Evil', settings: SETTINGS, ready: true });
  await sleep(40);
  assert.equal($('nameHost').textContent, before);
});

test('game 1: the guesser shows 4 fingers and is right; the friend\'s photo is displayed', async () => {
  hostConn.send({ t: 'start', settings: SETTINGS });
  await until(() => b.visible()[0] === 'game', 'game screen');
  hostConn.send({ t: 'round', n: 5 });                                      // out of order: ignored
  hostConn.send({ t: 'round', n: 1 });
  await until(() => simButton('[data-count]', '4'), 'the guesser also gets camera controls (no number pad)');
  assert.equal($('bottomContent').querySelectorAll('[data-g]').length, 0, 'the guesser has no gesture controls');
  simButton('[data-count]', '4').onclick();
  await until(() => sentByGuest('guess').length === 1, 'the guesser snaps and sends at 0', 9000);
  const g = sentByGuest('guess')[0];
  assert.equal(g.n, 1); assert.equal(g.guess, 4); assert.equal(g.view, 'avatar'); assert.equal(g.photo, '');

  for (const bad of [{ count: 99 }, { gesture: 'rude' }, { photo: 'http://evil/x.jpg', view: 'photo' }]) {
    hostConn.send({ t: 'reveal', n: 1, count: 4, gesture: null, noHand: false, ...picture(), ...bad });
  }
  await sleep(150);
  assert.equal($('topContent').children[0].textContent, '✋ ???', 'nothing invalid was accepted');
  hostConn.send({ t: 'reveal', n: 1, count: 4, gesture: null, noHand: false, ...picture({ view: 'photo', photo: 'data:image/jpeg;base64,AAAA' }) });
  await until(() => $('topContent').children[0]?.className === 'reveal', 'result shown', 5000);
  const card = $('topContent').children[0];
  assert.equal(card.children[0].tagName, 'IMG', "the friend's real photo is displayed in a private match");
  assert.equal(card.children[0].src, 'data:image/jpeg;base64,AAAA');
  await until(() => b.visible()[0] === 'over', 'game over', 20000);
  assert.equal($('overTitle').textContent, 'YOU WIN!');
  assert.equal($('againBtn').disabled, true);
});

test('game 2: a friend sending a cartoon is drawn locally; a critical hit takes the guesser out', async () => {
  hostConn.send({ t: 'start', settings: SETTINGS });
  hostConn.send({ t: 'round', n: 1 });
  await until(() => simButton('[data-count]', '2'), 'controls again');
  simButton('[data-count]', '2').onclick();
  await until(() => sentByGuest('guess').length === 2, 'guess sent', 9000);
  hostConn.send({ t: 'reveal', n: 1, count: 5, gesture: 'sideways', noHand: false, ...picture() });
  await until(() => $('topContent').children[0]?.className === 'reveal', 'result shown', 5000);
  assert.equal($('topContent').children[0].children[0].tagName, 'CANVAS', 'a cartoon is drawn by this phone, not received');
  await until(() => b.visible()[0] === 'over', 'game over', 20000);
  assert.equal($('overTitle').textContent, 'YOU LOSE');
  setTimeout(() => process.exit(0), 50).unref();
});
