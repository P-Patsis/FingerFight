import test from 'node:test';
import assert from 'node:assert/strict';
import { geometricJson, paintingJson, rng, cleanGc, cleanSd, newSeed, GENERATED } from '../js/generated.js';
import { parseSkin } from '../js/puppet.js';
import { validPicture, validGc, validSd } from '../js/logic.js';
import { resolveLoadout, genWire, setGen, gen } from '../js/cosmetics.js';
import { loadSkins, resetSkins } from '../js/skins.js';
import { readFileSync } from 'node:fs';

const shapes = s => Object.values(s.parts).reduce((n, p) => n + p.shapes.length, 0);

test('Geometric: every detail level is a valid skin, and more detail means more (smaller) facets', () => {
  const counts = [1, 2, 3, 4, 5].map(l => shapes(parseSkin(geometricJson(l))));
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] > counts[i - 1], 'level ' + (i + 1) + ' has more shapes: ' + counts);
  for (const l of [1, 2, 3, 4, 5]) for (const p of Object.values(parseSkin(geometricJson(l)).parts)) assert.ok(p.shapes.length <= 12);
  assert.deepEqual(geometricJson(3), geometricJson(3));
});

test('gc and sd are whole numbers in range only', () => {
  assert.equal(cleanGc(3), 3); for (const bad of [0, 6, 2.5, '3', null, NaN]) assert.equal(cleanGc(bad), null);
  assert.equal(cleanSd(0), 0); for (const bad of [-1, 1e7, 1.5, '4', NaN]) assert.equal(cleanSd(bad), null);
  assert.ok(validGc(undefined) && validGc(5) && !validGc(9) && !validGc('2') && validSd(123) && !validSd(-5) && !validSd(1.2));
  const n = newSeed(() => 0.5); assert.ok(Number.isInteger(n) && n >= 1 && n <= 999999);
});

test('Painting: the same seed is the same painting, another seed another one, and it parses', () => {
  assert.deepEqual(paintingJson(42), paintingJson(42));
  assert.notDeepEqual(paintingJson(42), paintingJson(43));
  parseSkin(paintingJson(999999));
  const a = rng(5), b = rng(5); assert.equal(a(), b());
});

test('a picture with a bad gc or sd is refused; a good one passes', () => {
  const base = { view: 'puppet', skin: 'lowpoly', hands: [], lm: null, ar: 1.3, photo: '' };
  assert.ok(validPicture({ ...base, gc: 4 }, true));
  assert.ok(validPicture({ ...base, skin: 'painting', sd: 777 }, true));
  assert.ok(!validPicture({ ...base, gc: 99 }, true));
  assert.ok(!validPicture({ ...base, sd: '<x>' }, true));
});

test('resolveLoadout draws the Geometric hand with the level it is given', async () => {
  resetSkins();
  const fetchFn = async u => ({ ok: true, json: async () => JSON.parse(readFileSync(new URL('../' + String(u).replace(/^\.?\//, ''), import.meta.url))) });
  await loadSkins(fetchFn, 'assets/skins/');
  const lo = resolveLoadout('lowpoly', [], null, { gc: 1 }), hi = resolveLoadout('lowpoly', [], null, { gc: 5 });
  assert.ok(shapes(hi.skin) > shapes(lo.skin));
  setGen({ gc: 2 }); assert.equal(gen.gc, 2); assert.deepEqual(genWire('lowpoly'), { gc: 2 }); assert.deepEqual(genWire('robot'), {});
  setGen({ gc: 3 });
  assert.ok(Object.keys(GENERATED).includes('painting'));
});
