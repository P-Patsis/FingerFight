// The phone's Back button and the Leave button: Back from a room asks first and keeps the room if you say no; Leave is confirmed too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, peers, until, Conn } from './harness.js';

const b = installBrowser('?sim=1');
const $ = id => b.byId.get(id);
let pushes = 0, backs = 0, answer = false, asked = [];
const listeners = [];
globalThis.addEventListener = (t, f) => { if (t === 'popstate') listeners.push(f); };
globalThis.history.pushState = () => { pushes++; };
globalThis.history.back = () => { backs++; };
globalThis.confirm = msg => { asked.push(msg); return answer; };
await import('../js/main.js');
const pressBack = () => listeners.forEach(f => f());           // the browser has already removed our history entry

const sentOf = (conn, t) => conn.sent.filter(m => m.t === t);
const hostPeer = () => peers.find(p => p.id?.startsWith('ffight-p-'));
let conn;

test('entering a room adds one history entry; Back asks, and "stay" keeps the room, the connection and the guest', async () => {
  $('nameInput').value = 'Hank';
  await $('createBtn').onclick();
  assert.deepEqual(b.visible(), ['lobby']); assert.equal(pushes, 1);
  conn = new Conn(); hostPeer().emit('connection', conn); conn.emit('open');
  conn.emit('data', { t: 'hello', v: 2, kind: 'private', name: 'Gus', token: 'ABCDEFGHJKLMNPQRSTUVWXYZ' });
  $('acceptBtn').onclick();
  answer = false;
  pressBack();
  assert.equal(asked.length, 1); assert.match(asked[0], /Leave this room/);
  assert.deepEqual(b.visible(), ['lobby'], 'still in the room');
  assert.equal(pushes, 2, 'the history entry was put back, so the next Back asks again');
  assert.equal(sentOf(conn, 'bye').length, 0, 'the opponent was not told anything');
  assert.equal($('nameGuest').textContent, 'Gus');
});

test('Back then "leave" tells the opponent and returns to the menu', async () => {
  answer = true;
  pressBack();
  assert.deepEqual(b.visible(), ['menu']);
  assert.equal(sentOf(conn, 'bye').length, 1);
  assert.equal(globalThis.localStorage.getItem('ff-session'), null);
});

test('the Leave button is confirmed too, and "no" keeps everything', async () => {
  answer = true; asked = [];
  await $('createBtn').onclick();
  assert.deepEqual(b.visible(), ['lobby']);
  answer = false;
  $('leaveBtn').onclick();
  assert.equal(asked.length, 1); assert.deepEqual(b.visible(), ['lobby']);
  answer = true;
  const before = backs;
  $('leaveBtn').onclick();
  assert.deepEqual(b.visible(), ['menu']);
  assert.equal(backs, before + 1, 'our own history entry is removed again');
  listeners.forEach(f => f());                                 // the browser reports that programmatic Back: it must be ignored
  assert.deepEqual(b.visible(), ['menu']);
});

test('Profile opens and Back returns to the menu without any question', async () => {
  asked = [];
  $('profileBtn').onclick();
  assert.deepEqual(b.visible(), ['profile']);
  pressBack();
  assert.deepEqual(b.visible(), ['menu']);
  assert.equal(asked.length, 0);
});

test('Back on the menu itself does nothing of ours (the browser is free to leave the page)', () => {
  pressBack();
  assert.deepEqual(b.visible(), ['menu']);
  setTimeout(() => process.exit(0), 50).unref();
});
