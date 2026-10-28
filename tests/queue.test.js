// Random queue: a searcher looks at every slot at once and joins the player who has been waiting longest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, FakePeer, sleep } from './harness.js';

installBrowser('?sim=1');
const { Link } = await import('../js/net.js');

function waitingHost(slot, waitedMs) {
  const l = new Link({ keepRoom: () => true }, { relay: false });
  l.queueSince = Date.now() - waitedMs;
  return l.host('ffight-r-' + slot).then(() => l);
}
const ids = Array.from({ length: 8 }, (_, i) => 'ffight-r-' + i);

test('with several players waiting, the one who has waited longest is chosen (not the lowest slot)', async () => {
  await waitingHost(1, 5_000);
  await waitingHost(4, 61_000);
  await waitingHost(6, 20_000);
  let opened = 0;
  const j = new Link({ onOpen: () => { opened++; } });
  const id = await j.joinAny(ids, 3000, 200);
  assert.equal(id, 'ffight-r-4');
  assert.equal(opened, 1, 'only the chosen connection is used');
  assert.equal(j.conn.open, true);
});

test('nobody waiting: rejects "no-room" quickly, from one signalling connection', async () => {
  const before = (await import('./harness.js')).peers.length;
  const j = new Link({});
  await assert.rejects(j.joinAny(ids.map(i => i + '-empty'), 3000, 200), /no-room/);
  assert.equal((await import('./harness.js')).peers.length - before, 1, 'one Peer for all slots');
});

test('a full room is ignored; the searcher takes the waiting one', async () => {
  const full = new FakePeer('ffight-r-7');
  full.on('connection', c => c.send({ t: 'full' }));
  const j = new Link({});
  const id = await j.joinAny(ids, 3000, 200);
  assert.notEqual(id, 'ffight-r-7');
  setTimeout(() => process.exit(0), 50).unref();
});
