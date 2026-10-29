// Live try-on (Test snap) in the Store and the Profile: the camera turns on, draws everything worn on the real hand in the worn order,
// follows live changes, fires the snap effect, turns off when the screen is left, and says why when it cannot start.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, until, sleep } from './harness.js';

const b = installBrowser('?');                       // not the simulator: the real HandCam class, with its camera and model faked below
const $ = id => b.byId.get(id);
const { HandCam } = await import('../js/hands.js');
const events = [], cams = [];
let startErr = null, loadErr = null, startDelay = 0;
HandCam.prototype.load = async function () { cams.push(this); if (loadErr) throw new Error(loadErr); };
HandCam.prototype.startCamera = async function () {
  events.push('start');
  if (startDelay) await sleep(startDelay);
  if (startErr) return startErr;
  this.stream = { getTracks: () => [{ readyState: 'live', stop() { events.push('stop'); } }] };
  return null;
};
HandCam.prototype.run = function () { this.running = true; events.push('run'); };
await import('../js/main.js');
const cam = () => cams.at(-1);
const stack = () => cam().overlay.rec.layers.map(l => l.id);
const cards = () => $('storeGrid').children.filter(c => c.matches('.item-card'));
const card = id => cards().find(c => c.dataset.id === id);
const reset = () => { events.length = 0; startErr = null; loadErr = null; startDelay = 0; };

test('Test snap in the Store turns the camera on and draws what is worn, in the worn order, on the live hand', async () => {
  reset();
  await until(() => catalogReady(), 'catalogue');
  $('storeBtn').onclick();
  card('whiteglove').onclick(); card('goldring').onclick();
  await $('storeSnap').onclick();
  assert.deepEqual(events, ['start', 'run']);
  assert.equal($('camBox').parentElement, $('wearBox'), 'the camera view sits in the Wearing card');
  assert.equal($('camBox').hidden, false); assert.equal($('storePreview').hidden, true);
  assert.equal($('wearCamOff').hidden, false);
  assert.equal(cam().overlay.puppet, true, 'the puppet is drawn on the live hand');
  assert.deepEqual(stack(), ['whiteglove', 'goldring'], 'in the order worn');
  // live changes follow: another item, a reorder, a colour
  card('silverring').onclick();
  assert.deepEqual(stack(), ['whiteglove', 'goldring', 'silverring']);
  const row = id => $('wearList').children.find(li => li.dataset.id === id);
  row('silverring').children.find(c => c.dataset.act === 'down').onclick();
  assert.deepEqual(stack(), ['whiteglove', 'silverring', 'goldring']);
  card('nailpolish').onclick();
  row('nailpolish').children.find(c => c.dataset.act === 'color').onclick();
  row('nailpolish').children.find(c => c.dataset.picker).children.find(x => x.dataset.color === '#22d3ee').onclick();
  assert.equal(cam().overlay.rec.layers.find(l => l.id === 'nailpolish').parts.index_tip[0].fill, '#22d3ee');
  // the snap button now fires the snap effect on the live hand
  let bursts = 0; const orig = cam().particles.trigger.bind(cam().particles);
  cam().particles.trigger = (n, h) => { bursts += n === 'snap' ? 1 : 0; return orig(n, h); };
  await $('storeSnap').onclick();
  assert.equal(bursts, 1); assert.deepEqual(events, ['start', 'run'], 'no second camera start');
  // leaving the screen switches the camera off
  $('storeBack').onclick();
  assert.ok(events.includes('stop'), 'tracks stopped'); assert.equal(cam().cameraOn, false);
  assert.equal($('camBox').hidden, true); assert.equal($('camBox').parentElement, b.byId.get('camBox').parentElement);
  assert.notEqual($('camBox').parentElement, $('wearBox'));
  assert.equal($('storePreview').hidden, false);
});

test('the Camera off button and the Profile work the same way', async () => {
  reset();
  $('profileBtn').onclick();
  await $('storeSnap').onclick();
  assert.deepEqual(events, ['start', 'run']); assert.equal($('wearCard').parentElement, $('wearSlotProfile'));
  assert.equal($('camBox').parentElement, $('wearBox'));
  $('wearCamOff').onclick();
  assert.ok(events.includes('stop')); assert.equal($('camBox').hidden, true); assert.equal($('wearCamOff').hidden, true);
  await $('storeSnap').onclick();                                   // and back on
  assert.equal(events.filter(e => e === 'start').length, 2);
  $('profileBack').onclick();
  assert.equal(cam().cameraOn, false, 'leaving the Profile switches it off');
});

test('a camera that cannot start says why and never hangs; the Test snap button works again afterwards', async () => {
  reset();
  startErr = 'Camera permission denied. Allow the camera in the browser site settings, then reload.';
  $('storeBtn').onclick();
  await $('storeSnap').onclick();
  assert.equal($('wearMsg').textContent, startErr);
  assert.equal($('camBox').hidden, true); assert.equal($('storePreview').hidden, false); assert.equal($('storeSnap').disabled, false); assert.equal($('wearCamOff').hidden, true);
  reset(); loadErr = 'Failed to fetch';
  await $('storeSnap').onclick();
  assert.match($('wearMsg').textContent, /Could not load the hand model \(Failed to fetch\)/);
  assert.equal($('storeSnap').disabled, false);
  reset();
  await $('storeSnap').onclick();
  assert.equal(cam().cameraOn, true, 'works once the problem is gone');
  $('storeBack').onclick();
});

test('leaving while the camera is still starting switches it off again', async () => {
  reset(); startDelay = 60;
  $('storeBtn').onclick();
  const pending = $('storeSnap').onclick();
  await sleep(10);
  $('storeBack').onclick();                                         // before the camera answered
  await pending;
  assert.equal(cam().cameraOn, false, 'no camera left running'); assert.equal($('camBox').hidden, true);
  assert.equal($('wearCamOff').hidden, true);
});

import { catalogReady } from '../js/cosmetics.js';
