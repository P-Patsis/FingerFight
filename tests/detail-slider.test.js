import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, until } from './harness.js';
const b = installBrowser('?'), $ = id => b.byId.get(id);
const { HandCam } = await import('../js/hands.js');
let cam;
HandCam.prototype.load = async function () { cam = this; };
HandCam.prototype.startCamera = async function () { return null; };
HandCam.prototype.run = function () { this.running = true; };
await import('../js/main.js');
const { gen } = await import('../js/cosmetics.js');

test('Geometric slider updates recoloured live try-on facets immediately and persists on change', async () => {
  await until(() => $('profileGrid').children.length || $('storeBtn').onclick, 'ready');
  $('profileBtn').onclick();$('custBtn').onclick();
  await until(() => $('profileGrid').children.some(c => c.dataset.id === 'lowpoly'), 'Geometric card');
  $('profileGrid').children.find(c => c.dataset.id === 'lowpoly').onclick();
  $('profileLayers').children.find(c => c.dataset.value === 'base').onclick();
  await $('tryNow').onclick();
  assert.equal(cam.overlay.rec.skin.id, 'lowpoly');
  // Exercise the actual slider callbacks after applying a non-default hand colour.
  const colorRow = $('catColor').children.find(c => c.classList.contains('cprow'));
  colorRow.children.find(c => c.dataset.color === '#25d3e4').onclick();
  const find = n => n.dataset?.act === 'polylevel' ? n : n.children?.map(find).find(Boolean);
  const sl = find($('catColor')); assert.ok(sl);
  const counts = [];
  for (const value of [1, 2, 3, 4, 5]) {
    sl.value = String(value); sl.oninput();
    counts.push(Object.values(cam.overlay.rec.skin.parts).reduce((n, p) => n + p.shapes.length, 0));
    assert.equal(gen.gc, value);
  }
  assert.ok(counts.every((n, i) => !i || n > counts[i - 1]), counts.join(','));
  sl.onchange(); assert.equal(localStorage.getItem('ff-polylevel'), '5');
  $('tryNow').onclick(); $('profileBack').onclick();
});
