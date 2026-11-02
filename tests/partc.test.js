import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSkin } from '../js/puppet.js';

const skin = id => parseSkin(JSON.parse(readFileSync(new URL('../assets/skins/' + id + '.json', import.meta.url))));

test('frog and duck no longer use per-finger fins: the finger shapes are plain and the web is a skin-level membrane', () => {
  for (const id of ['frog', 'duck']) {
    const s = skin(id);
    assert.ok(s.web, id + ' has a web');
    assert.ok(s.parts.middle_base.shapes.length <= 3, id + ' finger parts carry no fins');
    assert.ok(s.parts.palm.shapes.length <= 4, id + ' the palm carries no fixed triangles');
  }
});

test('the floppy hand is hotdog fingers: far wider than a normal finger, extended past the tip with a droop', () => {
  const s = skin('floppy');
  const nums = s.parts.index_tip.shapes[0].d.match(/-?\d+(\.\d+)?/g).map(Number);
  assert.ok(Math.min(...nums) <= -6.2 * 1.8, 'much wider than the tip of a normal finger');
  assert.ok(s.extend && s.extend.len >= 0.8 && s.extend.droop >= 1 && s.extend.pieces >= 3, 'its fingers extend well past the landmarks and sag');
});
