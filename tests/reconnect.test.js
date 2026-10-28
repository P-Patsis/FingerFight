// A dropped connection in a private match: the host keeps the seat for the same player (resume token), turns
// strangers away, re-syncs a fight in progress, and a missing/forged token never gets the seat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, peers, sleep, until, Conn } from './harness.js';

const b = installBrowser('?sim=1');
const $ = id => b.byId.get(id);
await import('../js/main.js');

const sentOf = (conn, t) => conn.sent.filter(m => m.t === t);
const hostPeer = () => peers.find(p => p.id?.startsWith('ffight-p-'));
const connect = () => { const c = new Conn(); hostPeer().emit('connection', c); c.emit('open'); return c; };
const TOKEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
let conn;

test('setup: host creates a match and accepts a guest who offers a resume token', async () => {
  $('nameInput').value = 'Hank';
  await $('createBtn').onclick();
  conn = connect();
  conn.emit('data', { t: 'hello', v: 2, kind: 'private', name: 'Gus', token: TOKEN });
  $('acceptBtn').onclick();
  assert.equal(sentOf(conn, 'welcome').length, 1);
  conn.emit('data', { t: 'ready', ready: true });
  const saved = JSON.parse(globalThis.localStorage.getItem('ff-session'));
  assert.equal(saved.role, 'host'); assert.equal(saved.token, TOKEN);
});

test('a drop shows "reconnecting" and keeps the lobby; a wrong token is refused', async () => {
  conn.emit('close');
  assert.equal($('netBadge').hidden, false);
  assert.deepEqual(b.visible(), ['lobby'], 'the match is not thrown away');
  const forger = connect();
  forger.emit('data', { t: 'resume', token: 'ZZZZZZZZZZZZZZZZZZZZZZZZ' });
  assert.equal(sentOf(forger, 'full').length, 1);
  assert.equal(sentOf(forger, 'resumed').length, 0);
  assert.equal($('netBadge').hidden, false, 'still waiting for the real guest');
});

test('the real guest comes back with the token and is taken back', async () => {
  const c = connect();
  c.emit('data', { t: 'resume', token: TOKEN });
  assert.equal(sentOf(c, 'resumed').length, 1);
  assert.equal($('netBadge').hidden, true);
  assert.equal(sentOf(c, 'settings').length >= 1, true, 'the host re-sends the settings');
  conn = c;
});

test('a drop in the middle of a fight: the round is replayed, hit points are re-synced, nobody loses a hit', async () => {
  $('startBtn').onclick();
  await until(() => sentOf(conn, 'round').length === 1, 'round 1 announced');
  conn.emit('close');
  assert.equal($('netBadge').hidden, false);
  const stranger = connect();                       // a fight is on: the seat is reserved for the token holder only
  stranger.emit('data', { t: 'hello', v: 2, kind: 'private', name: 'Mallory' });
  assert.equal(sentOf(stranger, 'full').length, 1, 'nobody takes the seat in the middle of a fight');
  const c = connect();
  c.emit('data', { t: 'resume', token: TOKEN });
  const sync = sentOf(c, 'sync')[0];
  assert.ok(sync, 'host sends a sync');
  assert.deepEqual(sync.health, { host: 3, guest: 3 }, 'default 3 hits each');
  assert.equal(sync.round, 0, 'round 1 had not finished, so it is replayed');
  await until(() => sentOf(c, 'round').length === 1, 'the round is announced again', 6000);
  assert.equal(sentOf(c, 'round')[0].n, 1);
  assert.deepEqual(b.visible(), ['game']);
});

test('leaving clears the saved session', async () => {
  $('leaveBtn').onclick();
  assert.equal(globalThis.localStorage.getItem('ff-session'), null);
  assert.equal($('rejoinBtn').hidden, true);
});
