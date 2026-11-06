import { pickColor, originalColor } from './pickerhelp.js';
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
  $('profileBtn').onclick();$('custBtn').onclick();
  const choose=(layer,id)=>{$('profileLayers').children.find(c=>c.dataset.value===layer).onclick();$('profileGrid').children.find(c=>c.dataset.id===id).onclick();};
  choose('glove','whiteglove');choose('ring','goldring');choose('ring','silverring');choose('nails','nailpolish');
  $('profileBack').onclick();$('storeBtn').onclick();
  await $('storeSnap').onclick();
  assert.deepEqual(events, ['start', 'run']);
  assert.equal($('camBox').parentElement, $('wearBox'), 'the camera view sits in the Wearing card');
  assert.equal($('camBox').hidden, false); assert.equal($('storePreview').hidden, true);
  assert.equal($('wearCamOff').hidden, false);
  assert.equal(cam().overlay.puppet, true, 'the puppet is drawn on the live hand');
  assert.deepEqual(stack(), ['whiteglove', 'goldring','silverring','nailpolish'], 'owned equipment comes from Customise');
  // The collection is equipped in Customise; reorder and colour changes still apply live in the Store.
  assert.deepEqual(stack(), ['whiteglove', 'goldring', 'silverring','nailpolish']);
  const row = id => $('wearList').children.find(li => li.dataset.id === id);
  row('silverring').children.find(c => c.dataset.act === 'down').onclick();
  assert.deepEqual(stack(), ['whiteglove', 'silverring', 'goldring','nailpolish']);
  $('storeLayers').children.find(x => x.dataset.value === 'nails').onclick();
  pickColor($('catColor'), '#25d3e4');
  assert.equal(cam().overlay.rec.layers.find(l => l.id === 'nailpolish').parts.index_tip[0].fill, '#25d3e4');
  // the snap button now fires the snap effect on the live hand
  let bursts = 0; const orig = cam().particles.trigger.bind(cam().particles);
  cam().particles.trigger = (n, h) => { bursts += n === 'snap' ? 1 : 0; return orig(n, h); };
  await $('storeSnap').onclick();
  assert.equal(bursts, 0,'the Store no longer has a fake snapshot action');assert.equal(cam().cameraOn,false,'camera button toggles off');
  await $('storeSnap').onclick();assert.equal(cam().cameraOn,true,'camera toggle can start it again');
  // leaving the screen switches the camera off
  $('storeBack').onclick();
  assert.ok(events.includes('stop'), 'tracks stopped'); assert.equal(cam().cameraOn, false);
  assert.equal($('camBox').hidden, true); assert.equal($('camBox').parentElement, b.byId.get('camBox').parentElement);
  assert.notEqual($('camBox').parentElement, $('wearBox'));
  assert.equal($('storePreview').hidden, false);
});

test('Camera off in the Store; and the Profile\'s merged panel: Customise turns the camera on, shows only Photo, Done / leaving turns it off', async () => {
  reset();
  $('storeBtn').onclick();
  await $('storeSnap').onclick();
  $('wearCamOff').onclick();
  assert.ok(events.includes('stop')); assert.equal($('camBox').hidden, true); assert.equal($('wearCamOff').hidden, true);
  $('storeBack').onclick();
  // PROFILE: one panel; the Customise button is the only way in, and it brings the camera with it
  reset();
  $('profileBtn').onclick();
  assert.equal($('custArea').hidden, true, 'closed until asked'); assert.equal(events.length, 0, 'opening the Profile does not touch the camera');
  assert.equal($('custOnly').hidden, false);
  $('tryBtn').onclick();                                             // "Try on (camera)" brings the camera
  await until(() => events.includes('run'), 'camera on');
  assert.deepEqual(events, ['start', 'run']);
  assert.equal($('custArea').hidden, false);
  assert.equal($('wearTop').parentElement, $('cWearTop')); assert.equal($('cWearTop').hidden, true, 'the puppet fitting pane is not shown beside the live camera'); assert.equal($('camBox').parentElement, $('liveBox'));
  assert.equal($('wearTop').classList.contains('pmode'), true, 'Profile mode hides Test snap and Camera off: no camera buttons at all in Profile mode');
  assert.equal(b.byId.get('wearPhoto'), undefined, 'the standalone Photo button is gone');
  // the TOP window shows the selected view itself, and NOTHING else: exactly one preview per selected view (no leftover puppet pane)
  const feedHidden = () => $('video').classList.contains('feed-hidden');
  const pick = m => $('modePicker').children.find(x => x.dataset.mode === m).onclick();
  const shown = () => ({ top: !$('viewPreviewBox').hidden, live: !$('liveBox').hidden, fit: !$('cWearTop').hidden, two: $('pzRow').classList.contains('two') });
  assert.equal($('camBox').parentElement, $('liveBox'), 'the camera is the top window in the Profile');
  pick('puppet'); assert.equal(cam().overlay.puppet, true); assert.equal(feedHidden(), true, 'Puppet: the puppet alone on the dark background');
  assert.deepEqual(shown(), { top: false, live: true, fit: false, two: false }, 'a puppet view on the live camera needs no second pane');
  pick('skeleton'); assert.equal(cam().overlay.puppet, false, 'Skeleton: the SKELETON (not the puppet)'); assert.equal(feedHidden(), true);
  assert.deepEqual(shown(), { top: false, live: true, fit: false, two: false }, 'DOUBLE-PREVIEW FIX: Skeleton after the camera was on shows the skeleton only, no puppet pane beside it');
  pick('photo-puppet'); assert.equal(cam().overlay.puppet, true); assert.equal(feedHidden(), false, 'Photo + puppet: my live picture with the puppet over it');
  pick('photo-skeleton'); assert.equal(cam().overlay.puppet, false, 'Photo + skeleton: my live picture with the skeleton over it'); assert.equal(feedHidden(), false);
  assert.deepEqual(shown(), { top: false, live: true, fit: false, two: false });
  assert.equal($('stickyTop').classList.contains('stuck'), true, 'the top block is pinned while customising');
  assert.equal($('custDone').hidden, false, 'the small Done sits in the preview corner'); assert.equal($('custBtn').hidden, true);
  pick('puppet'); assert.equal(feedHidden(), true);
  $('custDone').onclick();                                           // Done
  assert.ok(events.includes('stop'), 'tracks stopped'); assert.equal(cam().cameraOn, false);
  assert.equal($('stickyTop').classList.contains('stuck'), false, 'not pinned when not customising'); assert.equal($('custDone').hidden, true);
  assert.equal($('custArea').hidden, true); assert.deepEqual(shown(), { top: true, live: false, fit: false, two: false }, 'camera off: just the one static preview'); assert.equal($('camBox').hidden, true);
  // on again, then leave the screen: the camera goes off and the mode ends
  reset();
  $('tryBtn').onclick();
  await until(() => events.includes('run'), 'camera on again');
  $('profileBack').onclick();
  assert.equal(cam().cameraOn, false, 'leaving the Profile switches it off');
  assert.equal($('custArea').hidden, true);
  $('profileBtn').onclick();
  assert.equal($('custArea').hidden, true, 'a fresh visit starts closed'); assert.equal(events.filter(e => e === 'start').length, 1, 'and without a camera');
  $('profileBack').onclick();
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

test('TWO BUTTONS: "Customise" opens the customise area with NO camera; the camera starts only through "Try on (camera)" (or the corner Try on while customising); Done / leaving turns it off', async () => {
  reset();
  $('profileBtn').onclick();
  const html = (await import('node:fs')).readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="custBtn"[^>]*aria-label="Customise"/); assert.match(html, /id="tryBtn"[^>]*aria-label="Try on with camera"/);
  assert.equal($('custBtn').hidden, false); assert.equal($('tryBtn').hidden, false);
  $('custBtn').onclick();
  await new Promise(r => setTimeout(r, 60));
  assert.equal($('custArea').hidden, false, 'the customise controls are open'); assert.deepEqual(events, [], 'Customise alone never touches the camera');
  assert.equal($('camBox').hidden, true);
  assert.equal($('custDone').hidden, false); assert.equal($('tryNow').hidden, false, 'the camera can still be started from the preview corner');
  assert.equal($('custBtn').hidden, true); assert.equal($('tryBtn').hidden, true, 'the two entry buttons give way to Done / Try on');
  assert.equal($('looksRow').hidden, false); assert.equal($('profileLayers').hidden, false);
  $('tryNow').onclick();
  await until(() => events.includes('run'), 'camera on from the corner');
  assert.deepEqual(events, ['start', 'run']); assert.equal($('camBox').parentElement, $('liveBox')); assert.equal($('tryNow').getAttribute('aria-label'),'Stop camera','camera action stays under preview');
  $('custDone').onclick();
  assert.ok(events.includes('stop')); assert.equal(cam().cameraOn, false); assert.equal($('custArea').hidden, true);
  assert.equal($('custBtn').hidden, false); assert.equal($('tryBtn').hidden, false, 'both entry buttons are back');
  // Back also turns it off
  reset(); $('tryBtn').onclick(); await until(() => events.includes('run'), 'camera'); $('profileBack').onclick();
  assert.equal(cam().cameraOn, false); assert.equal($('custArea').hidden, true);
});
