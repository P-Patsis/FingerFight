import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installBrowser, until } from './harness.js';
const b = installBrowser('?'), $ = id => b.byId.get(id);
localStorage.setItem('ff-owned', JSON.stringify(['painting', 'flaming', 'burnbone']));
const { HandCam } = await import('../js/hands.js');
let cam;
HandCam.prototype.load = async function () { cam = this; };
HandCam.prototype.startCamera = async function () { return null; };
HandCam.prototype.run = function () { this.running = true; };
await import('../js/main.js');
const C = await import('../js/cosmetics.js');
const { PaintingFist } = await import('../js/generated.js');
const { validPicture } = await import('../js/logic.js');
const { ParticleSystem } = await import('../js/particles.js');
const { makeHand, ALL, FAN } = await import('./helpers.js');
const find = (n, act) => n.dataset?.act === act ? n : n.children?.map(c => find(c, act)).find(Boolean);
const card = id => $('storeGrid').children.find(c => c.dataset.id === id);

test('Painting tile and preview clicks reroll even when already worn; fire slider updates and persists', async () => {
  $('storeBtn').onclick(); await until(() => card('painting'), 'catalog');
  $('storeLayers').children.find(c => c.dataset.value === 'base').onclick();
  card('painting').onclick(); const a = C.gen.sd;
  card('painting').onclick(); assert.notEqual(C.gen.sd, a); const second = C.gen.sd;
  $('storePreview').onclick(); assert.notEqual(C.gen.sd, second);
  for (const id of ['flaming', 'burnbone']) {
    card(id).onclick(); await $('storeSnap').onclick();
    const slider = find($('catColor'), 'fire'); assert.ok(slider);
    slider.value = '1'; slider.oninput(); const low = cam.overlay.rec.emitters.map(e => ({...e}));
    slider.value = '10'; slider.oninput(); const high = cam.overlay.rec.emitters;
    assert.ok(high.every((e, i) => e.size > low[i].size && e.rate >= low[i].rate));
    assert.ok(high.every(e => e.rate <= 40));
    slider.onchange(); assert.equal(localStorage.getItem('ff-fire'), '10');
    assert.deepEqual(C.genWire(id), { fi: 10 });
    $('wearCamOff').onclick();
  }
  $('storeBack').onclick();
});

test('fist debounce rerolls once per closure, rejects brief glitches and requires reopening', () => {
  const f = new PaintingFist(), feed = (has, count, n) => Array.from({length:n}, () => f.update(has, count, 0.05)).filter(Boolean).length;
  assert.equal(feed(true, 0, 1), 0); assert.equal(feed(true, 5, 4), 0);
  assert.equal(feed(true, 0, 20), 1); assert.equal(feed(true, 0, 20), 0);
  assert.equal(feed(false, 0, 10), 0); assert.equal(feed(true, 0, 10), 0);
  assert.equal(feed(true, 5, 4), 0); assert.equal(feed(true, 0, 5), 1);
  const seed = C.rerollPainting(() => 0.5); assert.notEqual(C.rerollPainting(() => 0.5), seed);
});

test('fire intensity is bounded in storage/state and wire data; snapshots reproduce sender intensity', () => {
  const picture = { view: 'puppet', skin: 'flaming', hands: [], lm: null, ar: 1.333, photo: '' };
  for (const fi of [1, 7, 10, undefined]) assert.ok(validPicture({...picture, fi}, false));
  for (const fi of [0, 11, 1.5, '7', {}, NaN]) assert.equal(validPicture({...picture, fi}, false), false);
  C.setGen({fi: 7}); for (const fi of [0, 11, '7', NaN]) { C.setGen({fi}); assert.equal(C.gen.fi, 7); }
  const low = C.resolveLoadout('flaming', [], null, {fi:1}), high = C.resolveLoadout('flaming', [], null, {fi:10});
  C.setGen({fi:1}); assert.deepEqual(C.resolveLoadout('flaming', [], null, {fi:10}).emitters, high.emitters);
  const hand = makeHand(ALL,FAN).map(p=>({x:p.x*640,y:p.y*480}));
  const ps = new ParticleSystem({ reduced:()=>false }); ps.setEmitters(high.emitters);
  for (let i=0;i<300;i++) ps.update(1/30,[hand]);
  assert.ok(ps.list.length<=90 && ps.emitters.length<=6);
  assert.ok(high.emitters[0].size>low.emitters[0].size);
});

test('Profile and settings occupies Store\'s former position above Store', () => {
  const html = fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(html.indexOf('id="profileBtn"') < html.indexOf('id="storeBtn"'));
});

test('compact manual fit controls update live, save immediately on change and reset all fit settings',async()=>{
 $('storeBtn').onclick();await until(()=>card('cartoon'),'catalog');$('storeLayers').children.find(c=>c.dataset.value==='base').onclick();card('cartoon').onclick();await $('storeSnap').onclick();
 for(const [key,value]of [['f',145],['p',120],['c',3]]){
  const sl=find($('catColor'),'fit-'+key);assert.ok(sl);sl.value=String(value);sl.oninput();assert.equal(cam.overlay.rec.skin.fit[key],value);sl.onchange();assert.equal(JSON.parse(localStorage.getItem('ff-fit'))[key],value);
 }
 assert.deepEqual(C.gen.fit,{f:145,p:120,c:3});assert.deepEqual(C.genWire('cartoon').fit,C.gen.fit);
 find($('catColor'),'fit-reset').onclick();assert.deepEqual(C.gen.fit,{f:100,p:100,c:0});assert.equal(cam.overlay.rec.skin.fit,undefined);assert.deepEqual(JSON.parse(localStorage.getItem('ff-fit')),C.gen.fit);
 $('wearCamOff').onclick();$('storeBack').onclick();
});
