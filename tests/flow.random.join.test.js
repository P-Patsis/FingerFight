// Random matchmaking, path 2: a host is already waiting in slot 3, so the searcher looks at all slots at once (0-2 empty, 1 full), joins 3 and is welcomed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, FakePeer, sleep, until } from './harness.js';

const b = installBrowser('?sim=1');
const $ = id => b.byId.get(id);
await import('../js/main.js');

const simButton = (sel, value) => $('bottomContent').querySelectorAll(sel).find(x => Object.values(x.dataset)[0] === value);
const picture = (over = {}) => ({ view: 'skeleton', skin: 'gold', hands: [{ thumb: false, index: true, middle: false, ring: false, pinky: false }],
  lm: [Array.from({ length: 21 }, (_, i) => [100 + i * 20, 900 - i * 20])], ar: 1.333, photo: '', ...over });
const SETTINGS = { seconds: 3, hits: 3, crits: true, background: 0 };

let hostConn, hello;
const hellos = [];
// slot 1: a room that is already full; slot 3: a host that welcomes the searcher
const fullHost = new FakePeer('ffight-r-1');
fullHost.on('connection', c => { c.send({ t: 'full' }); });          // like the real room: 'full' the moment someone connects
const host = new FakePeer('ffight-r-3');
host.on('connection', c => {
  hostConn = c;
  c.on('data', m => { if (m.t === 'hello') { hello = m; hellos.push('slot3'); c.send({ t: 'welcome', v: 2, kind: 'random', name: 'Fighter 7777', settings: SETTINGS, ready: false }); } });
});

test('the searcher skips empty slots and a full one, joins the waiting host in slot 3 with a generated name', async () => {
  await sleep(20);
  await $('randomBtn').onclick();                       // resolves once matched
  assert.deepEqual(hellos, ['slot3'], 'slots 0 and 2 were empty, slot 1 said full straight away, slot 3 welcomed');
  assert.deepEqual(b.visible(), ['lobby']);
  assert.equal(hello.kind, 'random');
  assert.equal(hello.name, 'Fighter', 'the profile name, not a generated one');
  assert.equal($('nameHost').textContent, 'Fighter 7777');
  assert.equal($('randomNote').hidden, false);
  assert.equal($('randomBtn').hidden, false, 'search UI is reset');
});

test('against a random host: skeleton reveals are drawn locally, photo-carrying messages are refused', async () => {
  hostConn.send({ t: 'ready', ready: true });
  hostConn.send({ t: 'start', settings: SETTINGS });
  await until(() => b.visible()[0] === 'game', 'game');
  hostConn.send({ t: 'round', n: 1 });
  await until(() => simButton('[data-count]', '3'), 'guesser controls');
  simButton('[data-count]', '3').onclick();
  await until(() => hostConn.received.some(m => m.t === 'guess'), 'guess sent', 9000);
  const g = hostConn.received.find(m => m.t === 'guess');
  assert.equal(g.photo, ''); assert.ok(['puppet', 'skeleton'].includes(g.view));

  const photo = 'data:image/jpeg;base64,AAAA';
  hostConn.send({ t: 'reveal', n: 1, count: 3, gesture: null, noHand: false, ...picture({ view: 'photo', photo }) });
  hostConn.send({ t: 'reveal', n: 1, count: 3, gesture: null, noHand: false, ...picture({ photo }) });     // skeleton view but a photo tucked in
  await sleep(200);
  assert.equal($('topContent').children[0].textContent, '✋ ???', 'refused');
  hostConn.send({ t: 'reveal', n: 1, count: 3, gesture: null, noHand: false, ...picture() });
  await until(() => $('topContent').children[0]?.className === 'reveal', 'skeleton reveal accepted', 5000);
  assert.equal($('topContent').children[0].children[0].tagName, 'CANVAS', 'drawn locally from landmarks');
  setTimeout(() => process.exit(0), 50).unref();
});
