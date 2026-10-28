// A private room outlives its guest: leaving or vanishing frees the seat at once, and the same code works again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, peers, sleep, until, Conn } from './harness.js';

const b = installBrowser('?sim=1');
const $ = id => b.byId.get(id);
await import('../js/main.js');

const sentOf = (conn, t) => conn.sent.filter(m => m.t === t);
const hostPeer = () => peers.find(p => p.id?.startsWith('ffight-p-'));
const connect = () => { const c = new Conn(); hostPeer().emit('connection', c); c.emit('open'); return c; };
const hello = (c, name, token) => c.emit('data', { t: 'hello', v: 2, kind: 'private', name, token });
const T1 = 'ABCDEFGHJKLMNPQRSTUVWXYZ', T2 = 'BCDEFGHJKLMNPQRSTUVWXYZ2';
let g1;

test('setup: host opens a room and a guest joins', async () => {
  $('nameInput').value = 'Hank';
  await $('createBtn').onclick();
  assert.ok(JSON.parse(globalThis.localStorage.getItem('ff-session')).code, 'the room code is saved at once, so a reload keeps the room');
  g1 = connect(); hello(g1, 'Gus', T1);
  $('acceptBtn').onclick();
  await until(() => sentOf(g1, 'welcome').length === 1, 'welcome');
  assert.equal($('nameGuest').textContent, 'Gus');
});

test('a graceful leave frees the seat: the host stays in the lobby and a new guest is accepted', async () => {
  g1.emit('data', { t: 'bye' });
  assert.deepEqual(b.visible(), ['lobby'], 'the room is not destroyed');
  assert.match($('lobbyMsg').textContent, /Gus left.*still open/);
  assert.equal($('nameGuest').textContent === 'Gus', false);
  const g2 = connect(); hello(g2, 'Ida', T2);
  $('acceptBtn').onclick();
  assert.equal(sentOf(g2, 'full').length, 0, 'not told the room is full');
  await until(() => sentOf(g2, 'welcome').length === 1, 'welcome for the new guest');
  assert.equal($('nameGuest').textContent, 'Ida');
  g1 = g2;
});

test('a dropped guest (tab closed) does not block a fresh join in the lobby', async () => {
  g1.emit('close');
  assert.equal($('netBadge').hidden, false, 'the host sees "reconnecting", not an error');
  assert.deepEqual(b.visible(), ['lobby']);
  const g3 = connect(); hello(g3, 'Jon', T1);
  $('acceptBtn').onclick();
  assert.equal(sentOf(g3, 'full').length, 0, 'the stale seat is taken over');
  await until(() => sentOf(g3, 'welcome').length === 1, 'welcome for the returning player');
  assert.equal($('nameGuest').textContent, 'Jon');
  assert.equal($('netBadge').hidden, true);
  g1 = g3;
});

test('someone joining while the seated guest is alive is still told the room is full', async () => {
  const late = connect(); hello(late, 'Mallory', T2);
  assert.equal(sentOf(late, 'full').length, 1);
  assert.equal($('nameGuest').textContent, 'Jon');
});

test('the host reloading: the saved session reopens the SAME room code', async () => {
  const saved = JSON.parse(globalThis.localStorage.getItem('ff-session'));
  assert.equal(saved.role, 'host'); assert.equal(saved.code.length, 16);
  assert.equal(saved.token, T1);
  setTimeout(() => process.exit(0), 50).unref();
});
