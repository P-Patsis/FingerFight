import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSkin } from '../js/puppet.js';

const skin = id => parseSkin(JSON.parse(readFileSync(new URL('../assets/skins/' + id + '.json', import.meta.url))));

test('frog and duck have web fins on the finger segments (they ride the fingers), none on the thumb or the outer sides', () => {
  for (const id of ['frog', 'duck']) {
    const s = skin(id);
    assert.ok(s.parts.middle_base.shapes.length >= 4, id + ' middle finger: two fins + finger + detail');
    assert.ok(s.parts.index_base.shapes.length < s.parts.middle_base.shapes.length, id + ' index has only its inner fin');
    assert.ok(s.parts.thumb_base.shapes.length < s.parts.index_base.shapes.length, id + ' thumb has no fin');
    assert.ok(s.parts.palm.shapes.length <= 4, id + ' the palm no longer carries tiny fixed triangles');
  }
});

test('the floppy hand is hotdog fingers: far wider than a normal finger, and the tip reaches past the landmark', () => {
  const s = skin('floppy');
  const d = s.parts.index_tip.shapes[0].d;
  assert.match(d, /C/);
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  assert.ok(Math.min(...nums) <= -6.2 * 2.2, 'much wider than the tip of a normal finger');
  assert.ok(nums.some(n => n < -15 * 1.5), 'reaches beyond the end of the segment');
});
