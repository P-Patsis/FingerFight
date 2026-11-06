import { pickColor, originalColor } from './pickerhelp.js';
// The Skeleton category: six distinct styles, the chosen style id travels as `ss` (validated like any cosmetic id), the Hand cards live in the Hand
// category, and picking an opponent view opens the matching category.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, until } from './harness.js';

const b = installBrowser('?sim=1');
const $ = id => b.byId.get(id);
await import('../js/main.js');
const L = await import('../js/layers.js');
const A = await import('../js/avatars.js');
const { validPicture, validSs } = await import('../js/logic.js');
const { SimCam } = await import('../js/hands.js');
const { statesToLandmarks } = await import('../js/puppet.js');
const { loadCatalog } = await import('../js/cosmetics.js');
await loadCatalog();

// a canvas that records HOW things are drawn (not just the colours)
const rec = () => { const log = []; const o = { log, lineWidth: 1, globalAlpha: 1 };
  return new Proxy(o, { get: (t, k) => (k in t ? t[k] : (...a) => { log.push(k + (k === 'setLineDash' ? JSON.stringify(a[0]) : k === 'arc' ? ':' + Math.round(a[2]) : '')); }),
    set: (t, k, v) => { if (k === 'lineWidth' || k === 'globalAlpha' || k === 'strokeStyle' || k === 'fillStyle') log.push(k + '=' + v); t[k] = v; return true; } }); };
const hand = [statesToLandmarks({ thumb: true, index: true, middle: true, ring: true, pinky: true })];
const sig = (style, color = '#22d3ee') => { const c = rec(); A.drawSkeletonPicture(c, 240, 180, hand, [], 1, false, color, style); return c.log.join('|'); };

test('there are 6 skeleton styles, each drawn visibly differently; an unknown id is the classic skeleton', () => {
  assert.equal(L.SKELETON_STYLES.length, 6);
  const sigs = L.SKELETON_STYLE_IDS.map(id => sig(id));
  assert.equal(new Set(sigs).size, 6, 'six distinct drawings');
  assert.equal(sig('nonsense'), sig('classic'), 'unknown -> classic'); assert.equal(sig(undefined), sig('classic'));
  assert.match(sig('dashed'), /setLineDash\[/); assert.match(sig('glow'), /globalAlpha=0\.28/);
  for (const id of L.SKELETON_STYLE_IDS) assert.ok(sig(id, '#ff00aa').includes('strokeStyle=#ff00aa'), id + ' uses the picked colour');
  assert.equal(L.cleanSkelStyle('glow'), 'glow'); assert.equal(L.cleanSkelStyle('x'), null); assert.equal(L.cleanSkelStyle(5), null);
});

test('the style id is validated like a cosmetic id (ss) and drawn on the receiving side', () => {
  const pic = { photo: '', view: 'skeleton', skin: 'cartoon', hands: [], lm: null, ar: 1 };
  for (const ok of [undefined, null, 'glow', 'classic', 'futurestyle']) assert.equal(validPicture({ ...pic, ss: ok }, false), true, String(ok));
  for (const bad of [5, 'Glow', 'a'.repeat(13), '', 'x y', '<b>', {}, ['glow'], 'url(#x)']) assert.equal(validPicture({ ...pic, ss: bad }, false), false, JSON.stringify(bad));
  assert.equal(validSs('bold'), true);
  const draw = ss => { const c = rec(); A.drawFromMessage(c, 240, 180, { ...pic, hands: [{ thumb: true, index: true, middle: true, ring: true, pinky: true }], ss }); return c.log.join('|'); };
  assert.notEqual(draw('bold'), draw(undefined), 'the opponent sees my style');
  assert.equal(draw('futurestyle'), draw(undefined), 'a style this version does not know is the classic one');
});

test('the style travels with the reveal picture (and only a known one)', () => {
  const cam = new SimCam(); cam.set({ count: 3 });
  assert.equal(cam.snap({ mode: 'skeleton', skin: 'cartoon', stack: [], skelStyle: 'glow' }).ss, 'glow');
  assert.equal(cam.snap({ mode: 'skeleton', skin: 'cartoon', stack: [], skelStyle: 'evil<' }).ss, undefined);
  assert.equal(cam.snap({ mode: 'skeleton', skin: 'cartoon', stack: [] }).ss, undefined);
});

test('Skeleton category: six style cards, tapping one saves it and marks it, the colour picker belongs to the category', async () => {
  $('profileBtn').onclick(); $('custBtn').onclick();
  await until(() => !$('custArea').hidden, 'customise open');
  const chip = v => $('profileLayers').children.find(x => x.dataset.value === v);
  chip('skeleton').onclick();
  const cards = () => $('profileGrid').children.filter(c => c.matches('.item-card'));
  assert.deepEqual(cards().map(c => c.dataset.id), L.SKELETON_STYLE_IDS);
  assert.deepEqual(cards().filter(c => c.classList.contains('eq')).map(c => c.dataset.id), ['classic'], 'classic until a style is picked');
  cards().find(c => c.dataset.id === 'bold').onclick();
  assert.equal(globalThis.localStorage.getItem('ff-skelstyle'), 'bold');
  assert.deepEqual(cards().filter(c => c.classList.contains('eq')).map(c => c.dataset.id), ['bold']);
  const row = $('catColor').children.find(c => c.classList.contains('cprow'));
  assert.equal(row.dataset.layer, 'skeleton'); pickColor($('catColor'), '#e42525');
  assert.equal(globalThis.localStorage.getItem('ff-skel'), '#e42525');
  assert.equal(b.byId.get('skelRow'), undefined, 'no duplicate skeleton colour row');
  $('custDone').onclick(); $('profileBack').onclick();
});

test('picking an opponent view opens the matching category: skeleton views -> Skeleton, puppet views -> Hand; chips can still be tapped after', async () => {
  $('profileBtn').onclick(); $('custBtn').onclick();
  await until(() => !$('custArea').hidden, 'customise open');
  const mode = m => $('modePicker').children.find(x => x.dataset.mode === m).onclick();
  const open = () => $('profileLayers').children.filter(x => x.classList.contains('sel')).map(x => x.dataset.value)[0];
  for (const [m, layer] of [['skeleton', 'skeleton'], ['puppet', 'base'], ['photo-skeleton', 'skeleton'], ['photo-puppet', 'base']]) { mode(m); assert.equal(open(), layer, m); }
  mode('skeleton'); $('profileLayers').children.find(x => x.dataset.value === 'nails').onclick();
  assert.equal(open(), 'nails', 'manual choice after the automatic one');
  assert.deepEqual($('profileLayers').children.map(x => x.dataset.value), L.PROFILE_LAYERS);
  $('custDone').onclick(); $('profileBack').onclick();
});

test('view <-> category sync works BOTH ways: the Hand chip switches the view to puppet, the Skeleton chip to skeleton (a photo choice stays a photo choice); other chips leave the view alone', async () => {
  $('profileBtn').onclick(); $('custBtn').onclick();
  await until(() => !$('custArea').hidden, 'customise open');
  const chip = v => $('profileLayers').children.find(x => x.dataset.value === v);
  const sel = () => $('modePicker').children.filter(x => x.classList.contains('sel')).map(x => x.dataset.mode)[0];
  const mode = m => $('modePicker').children.find(x => x.dataset.mode === m).onclick();
  mode('puppet');
  chip('skeleton').onclick();
  assert.equal(sel(), 'skeleton'); assert.equal(globalThis.localStorage.getItem('ff-mode'), 'skeleton');
  assert.equal($('viewPreviewLabel').textContent, 'Preview: skeleton of your hand', 'the preview follows');
  chip('base').onclick();
  assert.equal(sel(), 'puppet'); assert.match($('viewPreviewLabel').textContent, /your puppet/);
  chip('tattoo').onclick(); assert.equal(sel(), 'puppet', 'Tattoo does not change the view');
  mode('photo-puppet'); chip('skeleton').onclick(); assert.equal(sel(), 'photo-skeleton', 'photo + puppet -> photo + skeleton');
  chip('base').onclick(); assert.equal(sel(), 'photo-puppet');
  chip('ring').onclick(); assert.equal(sel(), 'photo-puppet');
  mode('skeleton'); assert.equal($('profileLayers').children.filter(x => x.classList.contains('sel')).map(x => x.dataset.value)[0], 'skeleton', 'and the view still picks the category');
  mode('puppet'); $('custDone').onclick(); $('profileBack').onclick();
});

test('Customise without the camera keeps the placeholder picture for photo views (person + puppet), and the puppet pane only for plain puppet views', async () => {
  $('profileBtn').onclick(); $('custBtn').onclick();
  await until(() => !$('custArea').hidden, 'customise open');
  const mode = m => $('modePicker').children.find(x => x.dataset.mode === m).onclick();
  const shown = () => ({ placeholder: !$('viewPreviewBox').hidden, sway: !$('cWearTop').hidden, live: !$('liveBox').hidden });
  mode('photo-puppet'); assert.deepEqual(shown(), { placeholder: true, sway: false, live: false }, 'photo + puppet: the static placeholder (silhouette + puppet)');
  assert.match($('viewPreviewLabel').textContent, /camera picture \+ puppet/);
  mode('photo-skeleton'); assert.deepEqual(shown(), { placeholder: true, sway: false, live: false });
  mode('puppet'); assert.deepEqual(shown(), { placeholder: false, sway: true, live: false }, 'plain puppet: the swaying puppet');
  mode('skeleton'); assert.deepEqual(shown(), { placeholder: true, sway: false, live: false });
  $('custDone').onclick(); $('profileBack').onclick();
});
