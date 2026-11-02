// Part E: bone chrome burnbone sand eyes inksketch (hands), scissors hook (fingers), boxing rubber formal (gloves), ornate (ring).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSkin } from '../js/puppet.js';
import { parseItem } from '../js/cosmetics.js';
import { rigPlan } from '../js/puppet.js';

const J = p => JSON.parse(readFileSync(new URL('../assets/' + p, import.meta.url)));
const HANDS = { bone: true, chrome: false, burnbone: false, sand: true, eyes: false, inksketch: true };
const ITEMS = { scissors: ['nails', false], hook: ['nails', true], boxing: ['glove', true], rubber: ['glove', true], formal: ['glove', false], ornate: ['ring', false] };

test('the six new hands load, stay within the shape caps and keep the tint or lock they should', () => {
  for (const [id, free] of Object.entries(HANDS)) {
    const j = J('skins/' + id + '.json'), s = parseSkin(j);
    assert.equal(s.id, id);
    for (const p of Object.values(s.parts)) assert.ok(p.shapes.length <= 12, id);
    assert.equal(j.free !== false, free, id + ' owned/locked');
  }
  assert.ok(J('skins/burnbone.json').particles.length <= 4 && J('skins/burnbone.json').particles.every(p => p.rate <= 40));
  assert.ok(J('skins/chrome.json').tint && J('skins/bone.json').tint);
});

test('the six new items load with the right layer, lock and the parts they draw on', () => {
  for (const [id, [layer, free]] of Object.entries(ITEMS)) {
    const it = parseItem(J('items/' + id + '.json'));
    assert.equal(it.layer, layer, id); assert.equal(it.free, free, id);
  }
  assert.equal(Object.keys(J('items/hook.json').parts).join(), 'index_tip', 'one hook on one finger');
  assert.equal(Object.keys(J('items/scissors.json').parts).length, 2, 'two scissor fingers, apart from the blade fingers');
  assert.ok(Object.keys(J('items/boxing.json').parts).length === 16, 'a glove covers every part');
  assert.ok(J('items/ornate.json').particles.length <= 4);
  assert.ok(J('items/rubber.json').tint && J('items/boxing.json').tint, 'rubber and boxing gloves can be recoloured');
});
