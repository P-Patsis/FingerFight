// The in-app colour picker's maths, and that it applies a valid #rrggbb to EVERY category that has a colour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openPicker, panelOf } from './pickerhelp.js';
import { installBrowser, until } from './harness.js';
import { hsvToHex, hexToHsv, svAt } from '../js/colorpick.js';

const b = installBrowser('?sim=1');
const $ = id => b.byId.get(id);
await import('../js/main.js');
const { validLay, validBc, validPicture } = await import('../js/logic.js');
const { cleanColor } = await import('../js/layers.js');

test('hsv <-> #rrggbb: known colours, round trips, clamping, and nothing but a valid lower-case #rrggbb ever comes out', () => {
  assert.equal(hsvToHex(0, 1, 1), '#ff0000'); assert.equal(hsvToHex(120, 1, 1), '#00ff00'); assert.equal(hsvToHex(240, 1, 1), '#0000ff');
  assert.equal(hsvToHex(0, 0, 1), '#ffffff'); assert.equal(hsvToHex(0, 0, 0), '#000000'); assert.equal(hsvToHex(60, 1, 0.5), '#808000');
  for (const hex of ['#e42525', '#25d3e4', '#7a25e4', '#8a8a8a', '#123456', '#fedcba']) assert.equal(hsvToHex(...Object.values(hexToHsv(hex))), hex, hex);
  for (const [h, s, v] of [[NaN, NaN, NaN], [-90, 2, -1], [1e9, 1e9, 1e9], [undefined, null, 'x'], [Infinity, 0.5, 0.5]]) assert.match(hsvToHex(h, s, v), /^#[0-9a-f]{6}$/, String([h, s, v]));
  assert.deepEqual(hexToHsv('nope'), { h: 0, s: 0, v: 1 }); assert.deepEqual(svAt(-5, 999, 100, 100), { s: 0, v: 0 }); assert.deepEqual(svAt(100, 0, 100, 100), { s: 1, v: 1 });
});

test('the custom picker opens in one tap, drags live, and colours EVERY category with a plain #rrggbb that the network accepts', async () => {
  $('profileBtn').onclick(); $('custBtn').onclick();
  await until(() => !$('custArea').hidden, 'customise open');
  const chip = v => $('profileLayers').children.find(x => x.dataset.value === v);
  const ls = k => globalThis.localStorage.getItem(k);
  const stackC = id => JSON.parse(ls('ff-stack')).find(x => x.id === id)?.c;
  const wear = (layer, id) => { chip(layer).onclick(); $('profileGrid').children.find(c => c.dataset.id === id).onclick(); };
  const read = {
    base: () => JSON.parse(ls('ff-hcolors')).cartoon, skeleton: () => ls('ff-skel'), nails: () => stackC('nailpolish'), tattoo: () => stackC('tribal'),
    effect: () => stackC('bubbles'), ring: () => stackC('goldring'), glove: () => stackC('whiteglove'),
  };
  chip('base').onclick(); $('profileGrid').children.find(c => c.dataset.id === 'cartoon').onclick();
  wear('nails', 'nailpolish'); wear('tattoo', 'tribal'); wear('effect', 'bubbles'); wear('ring', 'goldring'); wear('glove', 'whiteglove');
  let hue = 0;
  for (const layer of ['base', 'skeleton', 'nails', 'tattoo', 'effect', 'ring', 'glove']) {
    chip(layer).onclick();
    assert.equal(panelOf($('catColor')), undefined, layer + ': closed until asked');
    const pk = openPicker($('catColor'));                           // one tap
    hue += 50; pk.setHue(hue); pk.drag(200, 30);
    const got = read[layer]();
    assert.match(got, /^#[0-9a-f]{6}$/, layer + ' got a plain #rrggbb'); assert.equal(got, pk.hex(), layer + ': the colour shown is the colour applied');
    assert.equal(cleanColor(got), got);
    pk.done(); assert.equal(read[layer](), got, layer + ': Done keeps it');
    assert.equal(panelOf($('catColor')), undefined);
  }
  // presets and Original sit beside the picker and still work, also while the panel is open
  chip('nails').onclick(); openPicker($('catColor'));
  $('catColor').children.find(c => c.classList.contains('cprow')).children.find(x => x.dataset.color === '#e42525').onclick();
  assert.equal(stackC('nailpolish'), '#e42525'); assert.ok(panelOf($('catColor')), 'a preset does not close the panel');
  $('catColor').children.find(c => c.classList.contains('cprow')).children.find(x => x.dataset.act === 'default').onclick();
  assert.equal(stackC('nailpolish'), undefined, 'Original');
  // Done without touching the picker changes nothing
  const before = ls('ff-stack'); panelOf($('catColor')).children[2].children[2].onclick(); assert.equal(ls('ff-stack'), before);
  // what goes over the network is still validated exactly as before
  assert.equal(validBc(read.base()), true); assert.equal(validLay([{ id: 'goldring', c: read.ring() }]), true);
  assert.equal(validPicture({ photo: '', view: 'skeleton', skin: 'cartoon', hands: [], lm: null, ar: 1, sk: read.skeleton() }, false), true);
  $('custDone').onclick(); $('profileBack').onclick();
});
