// The Profile restructure: skeleton colour, per-category colours, two-stop gradients (validated like any network value), effect intensity inside
// the particle caps, user-made hands next to the built-in ones, the idle sway, and migration of per-item colours to per-category ones.
import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { openPicker, panelOf } from './pickerhelp.js';
import { installBrowser, until } from './harness.js';

const b = installBrowser('?sim=1');
const $ = id => b.byId.get(id);
await import('../js/main.js');
const C = await import('../js/cosmetics.js');
const { loadCatalog, resolveLoadout, stackToWire, cleanStack, scaleEmitters } = C;
const { Inventory } = await import('../js/inventory.js');
const { validLay, validBc, validBk, validPicture } = await import('../js/logic.js');
const L = await import('../js/layers.js');
const P = await import('../js/particles.js');
const A = await import('../js/avatars.js');
const S = await import('../js/skins.js');
const { statesToLandmarks } = await import('../js/puppet.js');
await loadCatalog();
const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };
const recCtx = () => { const strokes = [], o = { strokes }; return new Proxy(o, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { if (k === 'strokeStyle') strokes.push(v); t[k] = v; return true; } }); };
const sample = { view: 'skeleton', skin: 'cartoon', hands: [], lm: [statesToLandmarks({ thumb: true, index: true, middle: true, ring: true, pinky: true })], ar: 1 };

// ---- skeleton colour -------------------------------------------------------------------------------------------------------------
test('skeleton colour: drawn in the picked colour, default otherwise, junk never reaches the canvas, and only #rrggbb travels (sk)', () => {
  let c = recCtx(); A.drawFromMessage(c, 240, 180, { ...sample, sk: '#ff00aa' });
  assert.ok(c.strokes.includes('#ff00aa'));
  c = recCtx(); A.drawFromMessage(c, 240, 180, sample);
  assert.ok(c.strokes.includes(A.SKELETON_COLOR) && !c.strokes.includes('#ff00aa'));
  c = recCtx(); A.drawFromMessage(c, 240, 180, { ...sample, sk: 'url(#x)' });
  assert.ok(!c.strokes.includes('url(#x)') && c.strokes.includes(A.SKELETON_COLOR), 'junk falls back to the default');
  const pic = { photo: '', view: 'skeleton', skin: 'cartoon', hands: [], lm: null, ar: 1 };
  assert.equal(validPicture({ ...pic, sk: '#12ab34' }, false), true);
  for (const bad of ['red', '#fff', 'url(x)', 'rgb(1,2,3)', '#12ab34;', 12, {}]) assert.equal(validPicture({ ...pic, sk: bad }, false), false, String(bad));
  assert.equal(validPicture({ ...pic, bd: 'blue' }, false), false);
});

test('Profile: the Skeleton category\'s colour picker saves a clean colour and ignores junk (there is no standalone skeleton colour row)', async () => {
  $('profileBtn').onclick();
  $('custBtn').onclick();
  await until(() => !$('custArea').hidden, 'customise open');
  const modes = $('modePicker').children;
  modes.find(x => x.dataset.mode === 'skeleton').onclick();
  const row = () => $('catColor').children.find(c => c.classList.contains('cprow'));
  assert.equal(row().dataset.layer, 'skeleton', 'the skeleton view opens the Skeleton category');
  row().children.find(x => x.dataset.color === '#25e46a').onclick();
  assert.equal(globalThis.localStorage.getItem('ff-skel'), '#25e46a');
  const pk = openPicker($('catColor'));
  pk.setHue(120); pk.drag(240, 0);
  assert.equal(globalThis.localStorage.getItem('ff-skel'), '#00ff00', 'the custom picker colours the skeleton');
  pk.drag(9999, 9999);
  assert.equal(globalThis.localStorage.getItem('ff-skel'), '#000000', 'clamped to the square, still a plain #rrggbb');
  pk.done();
  $('profileBack').onclick();
});

// ---- per-category colours --------------------------------------------------------------------------------------------------------
test('colour per CATEGORY: one colour for everything worn of that type (and for what is worn later); rings and gloves have one too', () => {
  const inv = new Inventory(memStorage());
  inv.toggle('tribal'); inv.toggle('scar'); inv.toggle('nailpolish'); inv.toggle('goldring');
  assert.equal(inv.setCategoryColor('tattoo', '#22d3ee'), true);
  assert.deepEqual(inv.stack.filter(s => ['tribal', 'scar'].includes(s.id)).map(s => s.color), ['#22d3ee', '#22d3ee'], 'all tattoos');
  assert.equal(inv.stack.find(s => s.id === 'nailpolish').color, null, 'other categories untouched');
  inv.grant('runes'); inv.toggle('runes');
  assert.equal(inv.stack.find(s => s.id === 'runes').color, '#22d3ee', 'a tattoo worn later takes the category colour');
  assert.equal(inv.setCategoryColor('ring', '#ff0000'), true, 'rings have a picker'); assert.equal(inv.stack.find(s => s.id === 'goldring').color, '#ff0000');
  assert.equal(inv.setCategoryColor('tattoo', 'red'), false); assert.equal(inv.setCategoryColor('tattoo', 'url(#a)'), false); assert.equal(inv.categoryStyle('tattoo').c, '#22d3ee');
  assert.equal(inv.setCategoryColor('tone', '#e3ad7c'), false, 'there is no skin tone category');
  inv.toggle('neon'); assert.equal(inv.setCategoryColor('base', '#ff8800'), true);
  assert.equal(inv.baseColor, '#ff8800', 'the Hand category colour recolours the worn hand');
  inv.toggle('robot'); assert.equal(inv.baseColor, null, 'the robot starts in its own colours, not the neon one'); assert.equal(inv.setCategoryColor('base', '#00ff88'), true, 'every hand takes a colour now (hue-shift)');
  inv.toggle('neon'); assert.equal(inv.baseColor, '#ff8800', 'each hand remembers its own colour'); inv.toggle('robot'); assert.equal(inv.baseColor, '#00ff88');
  inv.setCategoryColor('tattoo', null);
  assert.ok(inv.stack.filter(s => ['tribal', 'scar', 'runes'].includes(s.id)).every(s => s.color === null), 'Original colours');
});

test('colours per category are saved on the phone and come back after a reload', () => {
  const st = memStorage(), inv = new Inventory(st);
  inv.toggle('nailpolish'); inv.setCategoryColor('nails', '#12ab34');
  const back = new Inventory(st);
  assert.deepEqual(back.categoryStyle('nails'), { c: '#12ab34', k: null });
  assert.deepEqual(JSON.parse(st.m.get('ff-stack')), [{ id: 'nailpolish', c: '#12ab34' }]);
  st.m.set('ff-catstyle', JSON.stringify({ nails: { c: 'blue', d: '#fff' }, ring: { c: '#ff0000' }, tattoo: { c: '#112233', d: 'x', k: 99 }, junk: 1 }));
  const clean = new Inventory(st);
  assert.deepEqual(clean.categoryStyle('nails'), { c: null, k: null }, 'bad colours dropped');
  assert.deepEqual(clean.categoryStyle('tattoo'), { c: '#112233', k: null }, 'a gradient stop is dropped');
  assert.equal(clean.categoryStyle('ring').c, '#ff0000');
});

test('MIGRATION: per-item colours, gradients and the skin tone from older versions become single category / hand colours', () => {
  const st = memStorage();
  st.m.set('ff-stack', JSON.stringify([{ id: 'tribal', c: '#aa0000' }, { id: 'scar' }, { id: 'nailpolish', c: '#00aa00', d: '#0000ff' }, { id: 'goldring' }]));
  st.m.set('ff-puppet', 'neon'); st.m.set('ff-bcolor', '#0000aa');
  const inv = new Inventory(st);
  assert.equal(inv.categoryStyle('tattoo').c, '#aa0000'); assert.equal(inv.categoryStyle('nails').c, '#00aa00', 'a gradient keeps only stop A');
  assert.equal(inv.baseColor, '#0000aa', 'the old hand colour is the worn hand\'s colour');
  assert.equal(inv.stack.find(s => s.id === 'scar').color, '#aa0000', 'the other tattoo follows the category');
  assert.ok(inv.stack.every(s => !('color2' in s)), 'no second stop survives');
  const old = memStorage();
  old.m.set('ff-cos', JSON.stringify({ tone: 'orc', nails: 'rednails' }));
  const o = new Inventory(old);
  assert.deepEqual(o.stack.map(s => [s.id, s.color]), [['nailpolish', '#dc2626']], 'the tone is no worn item');
  assert.equal(o.handColors.cartoon, '#86b35a', 'the old skin tone is the cartoon hand colour'); assert.equal(o.categoryStyle('nails').c, '#dc2626');
  const tone = memStorage();
  tone.m.set('ff-stack', JSON.stringify([{ id: 'skintone', c: '#7a4a2b' }, { id: 'nailpolish', c: '#111827' }]));
  const t = new Inventory(tone);
  assert.ok(!t.stack.some(s => s.id === 'skintone')); assert.equal(t.handColors.cartoon, '#7a4a2b');
});

// ---- no gradients ------------------------------------------------------------------------------------------------------------
test('there are no gradients: a phone on the previous version may still send a second stop (d / bd), it is accepted as plain #rrggbb and never drawn or stored', () => {
  assert.equal(validLay([{ id: 'nailpolish', c: '#ff0000', d: '#0000ff' }]), true, 'old phones still validate');
  for (const bad of [[{ id: 'nailpolish', d: '#0000ff' }], [{ id: 'nailpolish', c: '#ff0000', d: 'blue' }], [{ id: 'nailpolish', c: '#ff0000', d: 'linear-gradient(red,blue)' }],
    [{ id: 'nailpolish', c: '#ff0000', d: '#0000ff', x: 1 }]]) assert.equal(validLay(bad), false, JSON.stringify(bad));
  assert.equal(validBc('#123456'), true); assert.equal(validBc('url(#x)'), false);
  assert.deepEqual(stackToWire([{ id: 'nailpolish', color: '#ff0000', color2: '#0000ff' }, { id: 'scar', color: null }]), [{ id: 'nailpolish', c: '#ff0000' }, { id: 'scar' }], 'only one colour ever leaves');
  assert.deepEqual(cleanStack([{ id: 'nailpolish', c: '#ff0000', d: '#0000ff' }]), [{ id: 'nailpolish', color: '#ff0000' }], 'a stored second stop is dropped');
  const rec = resolveLoadout('cartoon', [{ id: 'nailpolish', color: '#ff0000', color2: '#0000ff' }]);
  const fills = ['thumb', 'index', 'middle', 'ring', 'pinky'].map(f => rec.layers.find(l => l.id === 'nailpolish').parts[f + '_tip'][0].fill);
  assert.equal(new Set(fills).size, 1, 'every nail is the one colour'); assert.equal(fills[0], '#ff0000');
  const neon = resolveLoadout('neon', [], '#ff0000');
  assert.deepEqual(neon.skin.parts.thumb_base.shapes, resolveLoadout('neon', [], '#ff0000').skin.parts.thumb_base.shapes);
  assert.ok(L.mixHex === undefined && L.partPos === undefined, 'the gradient helpers are gone');
  const inv = new Inventory(memStorage()); inv.toggle('nailpolish');
  assert.equal(inv.setCategoryColor('nails', '#ff0000', '#0000ff'), true); assert.deepEqual(inv.categoryStyle('nails'), { c: '#ff0000', k: null }, 'the extra argument is ignored');
});

// ---- effect intensity --------------------------------------------------------------------------------------------------------
test('effect intensity: 1-10 scales rate / burst / size, never past the per-emitter limits or the 90-particle / 6-emitter caps', () => {
  const inv = new Inventory(memStorage());
  for (const id of ['sparkles', 'bubbles', 'glow', 'embers']) inv.toggle(id);
  assert.equal(inv.setIntensity(0), false); assert.equal(inv.setIntensity(11), false); assert.equal(inv.setIntensity(2.5), false); assert.equal(inv.setIntensity('9'), false);
  assert.equal(inv.setIntensity(10), true);
  assert.ok(inv.stack.every(s => s.k === 10)); inv.toggle('electric'); assert.equal(inv.owns('electric'), false);
  assert.deepEqual(stackToWire(inv.stack).map(e => e.k), [10, 10, 10, 10]);
  assert.equal(validLay([{ id: 'bubbles', k: 10 }]), true);
  for (const bad of [0, 11, 5.5, '5', null, -1]) assert.equal(validLay([{ id: 'bubbles', k: bad }]), false, String(bad));
  const at = k => resolveLoadout('cartoon', [{ id: 'bubbles', color: null, k }]).emitters.find(e => e.effect === 'bubbles');
  assert.ok(at(10).rate > at(5).rate && at(5).rate > at(1).rate, 'more intensity = more particles');
  assert.ok(at(10).size >= at(1).size, 'and bigger');
  for (const k of [1, 5, 10]) assert.ok(at(k).rate <= 40);
  const burst = scaleEmitters([{ effect: 'sparks', color: '#ffffff', where: 'tips', rate: 40, trigger: 'snap', burst: 30 }], 10)[0];
  assert.equal(burst.rate, 40); assert.equal(burst.burst, 30, 'clamped to the authoring limits');
  // the real system with the strongest settings and every effect: the caps hold
  const rec = resolveLoadout('cartoon', ['sparkles', 'bubbles', 'glow', 'embers', 'electric'].map(id => ({ id, color: null, k: 10 })));
  const ps = new P.ParticleSystem({ reduced: () => false });
  ps.setEmitters(rec.emitters);
  assert.ok(ps.emitters.length <= P.MAX_EMITTERS);
  const hands = A.previewHandPx(240, 180);
  let peak = 0;
  for (let i = 0; i < 400; i++) { ps.update(0.05, hands); peak = Math.max(peak, ps.list.length); if (i % 50 === 0) ps.trigger('snap', hands); }
  assert.ok(peak <= P.MAX_PARTICLES, 'never more than ' + P.MAX_PARTICLES + ' live particles (peak ' + peak + ')');
  const low = new P.ParticleSystem({ reduced: () => false }); low.setEmitters(resolveLoadout('cartoon', [{ id: 'bubbles', color: null, k: 1 }]).emitters);
  let lowPeak = 0; for (let i = 0; i < 400; i++) { low.update(0.05, hands); lowPeak = Math.max(lowPeak, low.list.length); }
  const hi = new P.ParticleSystem({ reduced: () => false }); hi.setEmitters(resolveLoadout('cartoon', [{ id: 'bubbles', color: null, k: 10 }]).emitters);
  let hiPeak = 0; for (let i = 0; i < 400; i++) { hi.update(0.05, hands); hiPeak = Math.max(hiPeak, hi.list.length); }
  assert.ok(hiPeak > lowPeak, 'intensity 10 shows more bubbles than 1 (' + hiPeak + ' vs ' + lowPeak + ')');
});

test('Profile customise: the Effect panel has the intensity slider, and moving it changes what is worn', async () => {
  $('profileBtn').onclick();
  $('custBtn').onclick();
  await until(() => !$('custArea').hidden, 'customise open');
  const chip = v => $('profileLayers').children.find(x => x.dataset.value === v);
  chip('effect').onclick();
  $('profileGrid').children.find(c => c.dataset.id === 'bubbles').onclick();
  const slider = $('catColor').children.flatMap(c => [c, ...c.children]).find(x => x.dataset?.act === 'intensity');
  assert.ok(slider, 'intensity slider'); assert.equal(slider.max, '10');
  assert.equal(slider.min, '1'); assert.equal(slider.step, '1');
  slider.value = '10'; slider.oninput();
  assert.equal(JSON.parse(globalThis.localStorage.getItem('ff-stack')).find(x => x.id === 'bubbles').k, 10, 'the right end of the track is the maximum');
  slider.value = '9'; slider.oninput();
  assert.equal(JSON.parse(globalThis.localStorage.getItem('ff-stack')).find(x => x.id === 'bubbles').k, 9);
  chip('nails').onclick();
  const panelKids = $('catColor').children.flatMap(c => [c, ...c.children]);
  assert.ok(!panelKids.find(x => x.dataset?.act === 'gradient'), 'no gradient anywhere'); assert.ok(!panelKids.find(x => x.dataset?.act === 'intensity'));
  chip('ring').onclick();
  assert.ok($('catColor').children.some(c => c.classList.contains('cprow')), 'rings have a colour row');
  assert.deepEqual($('profileLayers').children.map(x => x.dataset.value), L.PROFILE_LAYERS, 'Hand, Skeleton, Tattoo, Nails, Ring, Glove, Effect: no Skin tone');
  assert.equal(b.byId.get('profile').children.some(c => /Your items/.test(c.textContent || '')), false, 'no standalone Your items section');
  $('custBtn').onclick();
  $('profileBack').onclick();
});

// ---- hands: built-in + user-created in one list ----------------------------------------------------------------------------------
test('Choose your Hand: built-in hands and the player\'s own hands share one list; a bad or clashing hand file is refused', () => {
  const builtIn = S.skinIds().slice();
  assert.ok(builtIn.length >= 7 && !S.isUserSkin('cartoon'));
  const mine = JSON.parse(fs.readFileSync(new URL('../assets/skins/cartoon.json', import.meta.url), 'utf8'));
  assert.throws(() => S.registerUserSkin({ ...mine, id: 'cartoon' }), /built-in/);
  assert.throws(() => S.registerUserSkin({ format: 1, id: 'bad' }), /./, 'fails the same checks as any skin');
  assert.throws(() => S.registerUserSkin({ ...mine, id: 'goldring' }, id => !!C.entryOf(id)), /item/);
  const st = memStorage();
  const json = { ...mine, id: 'myhand', name: 'My hand' };
  st.setItem('ff-userhands', JSON.stringify([json, { id: 'broken' }, 'junk']));
  const ids = S.loadUserSkins(st, id => !!C.entryOf(id));
  assert.deepEqual(ids, ['myhand']);
  assert.deepEqual(S.skinIds(), [...builtIn, 'myhand'], 'built-in first, then yours, one list');
  assert.equal(S.isUserSkin('myhand'), true);
  assert.equal(S.skinIdOf('myhand'), 'myhand');
  assert.ok(C.catalog().some(e => e.id === 'myhand' && e.layer === 'base'), 'it is a hand in the catalogue');
  const inv = new Inventory(memStorage());
  assert.equal(inv.toggle('myhand').ok, true); assert.equal(inv.baseId, 'myhand');
  $('profileBtn').onclick();
  $('modePicker').children.find(x => x.dataset.mode === 'puppet').onclick();
  assert.deepEqual($('profileGrid').children.filter(c => c.matches('.item-card')).map(x => x.dataset.id), [...builtIn, 'myhand'].filter(id => C.entryOf(id).free), 'the Hand category lists built-in (the ones you own) and your own hands together');
  $('profileBack').onclick();
  S.resetSkins();
});

test('static preview has no rotation sway code', () => {
  assert.equal(A.swayOf, undefined);
  const src = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('swayOf') && !src.includes('sw.scale'));
});

// ---- nails only on the nail side ------------------------------------------------------------------------------------------------
const PU = await import('../js/puppet.js');
const handPx = () => PU.statesToLandmarks({ thumb: true, index: true, middle: true, ring: true, pinky: true }).map(([x, y]) => ({ x: x / 4, y: y / 4 }));
const ids = (back, stack) => { const r = resolveLoadout('cartoon', stack); return PU.rigPlan(handPx(), r.skin, r.layers, back).map(p => p.part); };
test('nail polish is drawn on the nail side only: back of the hand shows it, palm side hides it, unknown keeps the old behaviour', () => {
  const nails = [{ id: 'nailpolish', color: null }];
  const has = (back, id = 'index_tip@nailpolish') => ids(back, nails).includes(id);
  assert.equal(has(true), true, 'back toward the camera: polish shows');
  assert.equal(has(false), false, 'palm toward the camera: nails are hidden, as in real life');
  assert.equal(has(undefined), true, 'unknown facing (simulator, older pictures): drawn as before');
  for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) assert.equal(has(false, f + '_tip@nailpolish'), false);
  assert.equal(resolveLoadout('cartoon', [{ id: 'nailpolish', color: null }]).layers[0].side, 'back');
  // the base hand and other cosmetics are untouched by the side
  assert.deepEqual(ids(true, []), ids(false, []), 'the bare hand looks the same from both sides');
  const ring = [{ id: 'goldring', color: null }];
  assert.deepEqual(ids(true, ring), ids(false, ring), 'a ring is on both sides');
  // tattoos can say which side they are on
  const tat = id => [{ id, color: null }];
  assert.equal(ids(true, tat('tribal')).some(p => p.endsWith('@tribal')), true); assert.equal(ids(false, tat('tribal')).some(p => p.endsWith('@tribal')), false, 'tribal is a back tattoo');
  assert.equal(ids(false, tat('runes')).some(p => p.endsWith('@runes')), true); assert.equal(ids(true, tat('runes')).some(p => p.endsWith('@runes')), false, 'runes are a palm tattoo');
  assert.equal(ids(true, tat('scar')).some(p => p.endsWith('@scar')) && ids(false, tat('scar')).some(p => p.endsWith('@scar')), true, 'a scar is on both');
  assert.throws(() => C.parseItem({ format: 1, id: 'bad', layer: 'tattoo', side: 'left', parts: { palm: [{ d: 'M 0 0 L 1 1', fill: '#000000' }] } }), /side/);
});
test('which way a hand faces comes from the landmarks and the hand label; mirrored or unlabelled hands are handled', () => {
  const lm = handPx();
  const mirrored = lm.map(p => ({ x: 1000 - p.x, y: p.y }));
  assert.equal(typeof PU.handBack(lm, 'Left'), 'boolean');
  assert.equal(PU.handBack(lm, 'Left'), !PU.handBack(lm, 'Right'), 'the label decides left vs right hand');
  assert.equal(PU.handBack(lm, 'Left'), !PU.handBack(mirrored, 'Left'), 'turning the hand over (mirror image) flips it');
  assert.equal(PU.handBack(lm, '?'), undefined); assert.equal(PU.handBack(lm, undefined), undefined); assert.equal(PU.handBack([], 'Left'), undefined);
  const flat = lm.map(p => ({ x: 5, y: 5 })); assert.equal(PU.handBack(flat, 'Left'), undefined, 'a degenerate hand gives no answer');
  // a real right hand, palm to the camera (unmirrored frame): thumb side on the image right; the model labels it 'Left' (its label assumes a mirrored image)
  const rightPalm = lm.map(p => ({ x: 1000 - p.x, y: p.y }));
  const sample = PU.handBack(rightPalm, 'Left');
  assert.equal(PU.handBack(lm, 'Right'), sample, 'consistent between the two ways of describing the same physical hand');
});

test('the sender\'s facing travels as bk (booleans / null only) and the receiver draws nails only on a back-facing hand', () => {
  for (const ok of [undefined, null, [], [true], [false, null], [true, false]]) assert.equal(validBk(ok), true, JSON.stringify(ok));
  for (const bad of ['yes', [1], [true, true, true], [{}], ['true'], 1]) assert.equal(validBk(bad), false, JSON.stringify(bad));
  const pic = { photo: '', view: 'puppet', skin: 'cartoon', hands: [], lm: null, ar: 1 };
  assert.equal(validPicture({ ...pic, bk: [true] }, false), true); assert.equal(validPicture({ ...pic, bk: 'x' }, false), false);
  globalThis.Path2D ??= class { constructor(d) { this.d = d; } };
  const fills = bk => { const c = recCtx(); c.fills = []; const rec = new Proxy(c, { set: (t, k, v) => { if (k === 'fillStyle') t.fills.push(v); t[k] = v; return true; }, get: (t, k) => (k in t ? t[k] : () => ({})) });
    A.drawFromMessage(rec, 240, 180, { view: 'puppet', skin: 'cartoon', hands: [{ thumb: true, index: true, middle: true, ring: true, pinky: true }], lm: [statesToLandmarks({ thumb: true, index: true, middle: true, ring: true, pinky: true })], ar: 1, lay: [{ id: 'nailpolish', c: '#12ab34' }], bk }); return c.fills; };
  assert.ok(fills([true]).includes('#12ab34'), 'back of the hand: polish');
  assert.ok(!fills([false]).includes('#12ab34'), 'palm side: no polish');
  assert.ok(fills(undefined).includes('#12ab34'), 'no facing sent: as before');
});

// ---- the top preview follows the selected view -----------------------------------------------------------------------------------
test('opponent-view preview shows what the opponent would see: skeleton for Skeleton / Photo + skeleton (in the chosen colour), puppet for the puppet views', () => {
  globalThis.Path2D ??= class { constructor(d) { this.d = d; } };
  const skin = S.getSkin('cartoon'), draw = mode => { const c = recCtx(); const r = A.drawViewPreview(c, 240, 150, mode, skin, resolveLoadout('cartoon', []), '#ff00aa'); return { c, r }; };
  for (const [mode, hand, camera, colour] of [['skeleton', 'skeleton', false, true], ['photo-skeleton', 'skeleton', true, true], ['puppet', 'puppet', false, false], ['photo-puppet', 'puppet', true, false]]) {
    const { c, r } = draw(mode);
    assert.deepEqual([r.hand, r.camera], [hand, camera], mode);
    assert.equal(c.strokes.includes('#ff00aa'), colour, mode + (colour ? ': the skeleton in my colour' : ': no skeleton lines'));
  }
});

test('the Profile preview picture changes with the selected view (skeleton vs puppet)', () => {
  $('profileBtn').onclick();
  const seen = [];
  const cv = $('viewPreview'), ctx = cv.getContext('2d');
  const orig = ctx.stroke; let strokes = 0;
  ctx.stroke = (...a) => { strokes++; return orig?.apply(ctx, a); };
  const label = () => $('viewPreviewLabel').textContent;
  for (const m of ['skeleton', 'puppet', 'photo-skeleton', 'photo-puppet']) { $('modePicker').children.find(x => x.dataset.mode === m).onclick(); seen.push(label()); }
  assert.deepEqual(seen, ['Preview: skeleton of your hand', 'Preview: your puppet', 'Preview: camera picture + skeleton', 'Preview: camera picture + puppet']);
  $('modePicker').children.find(x => x.dataset.mode === 'puppet').onclick();
  $('profileBack').onclick();
});

// ---- colour picker overhaul ----------------------------------------------------------------------------------------------------
test('preset swatches: ONE short row, a few well-spread hues plus white / grey / black', () => {
  const hue = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return null;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return ((h * 60) + 360) % 360; };
  const hues = L.BASIC_PALETTE.map(hue).filter(h => h !== null).sort((a, b) => a - b);
  assert.ok(hues.length >= 7 && L.BASIC_PALETTE.length <= 12, 'a basic row, not a wall');
  let maxGap = 0, minGap = 360; for (let i = 0; i < hues.length; i++) { const gap = (hues[(i + 1) % hues.length] - hues[i] + 360) % 360; maxGap = Math.max(maxGap, gap); minGap = Math.min(minGap, gap); }
  assert.ok(maxGap <= 70, 'no hole in the spectrum (largest gap ' + maxGap.toFixed(0) + ' degrees)'); assert.ok(minGap >= 25, 'no near-duplicates (smallest gap ' + minGap.toFixed(0) + ' degrees)');
  assert.ok(['#ffffff', '#111111'].every(c => L.BASIC_PALETTE.includes(c)));
  assert.ok(L.BASIC_PALETTE.every(c => /^#[0-9a-f]{6}$/.test(c)) && new Set(L.BASIC_PALETTE).size === L.BASIC_PALETTE.length);
});

test('ONE colour picker above the grid that switches with the category chip: presets + full-spectrum + Original, hand recolour on the Hand chip, no gradient', async () => {
  await S.loadSkins(async u => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(new URL('../' + String(u).replace(/^.*?(assets\/)/, '$1'), import.meta.url), 'utf8')) }));   // an earlier test reset the skins
  $('profileBtn').onclick();
  $('custBtn').onclick();
  await until(() => !$('custArea').hidden, 'customise open');
  const chip = v => $('profileLayers').children.find(x => x.dataset.value === v);
  const all = () => $('catColor').children.flatMap(function f(c) { return [c, ...c.children.flatMap(f)]; });
  const stackOf = id => JSON.parse(globalThis.localStorage.getItem('ff-stack')).find(x => x.id === id);
  chip('nails').onclick();
  $('profileGrid').children.find(c => c.dataset.id === 'nailpolish').onclick();
  assert.equal($('catColor').children.filter(c => c.classList.contains('cprow')).length, 1, 'exactly one picker row');
  const row = $('catColor').children.find(c => c.classList.contains('cprow'));
  assert.equal(row.dataset.layer, 'nails', 'the picker belongs to the chip');
  assert.ok(row.children.some(x => x.dataset.act === 'any'), 'a full colour picker button'); assert.ok(row.children.some(x => x.dataset.act === 'default'), 'Original');
  assert.equal(row.children.filter(x => x.dataset.color).length, L.BASIC_PALETTE.length);
  assert.ok(!all().some(x => x.dataset?.act === 'gradient'), 'no gradient');
  const pk = openPicker($('catColor'));
  pk.setHue(0); pk.drag(240, 0);
  assert.equal(stackOf('nailpolish').c, '#ff0000');
  chip('tattoo').onclick();
  assert.equal(panelOf($('catColor')), undefined, 'the panel belongs to one category and closes with it');
  chip('nails').onclick();
  // SCROLL RESET: the row is put back at the start AFTER its cards were replaced (resetting before is what the browser undid on the phone)
  const g = $('profileGrid'), log = []; let sl = 240;
  const rc = g.replaceChildren.bind(g); g.replaceChildren = (...a) => { log.push('replace'); return rc(...a); };
  Object.defineProperty(g, 'scrollLeft', { get: () => sl, set: v => { log.push('scroll=' + v); sl = v; }, configurable: true });
  chip('tattoo').onclick();
  assert.equal(sl, 0, 'a new category starts at its first items');
  assert.ok(log.lastIndexOf('replace') >= 0 && log.lastIndexOf('replace') < log.lastIndexOf('scroll=0'), 'the reset comes after the new cards are in: ' + log.join(','));
  assert.equal($('catColor').children.find(c => c.classList.contains('cprow')).dataset.layer, 'tattoo', 'the picker switched with the chip');
  chip('nails').onclick();
  all().find(x => x.dataset?.act === 'default').onclick();
  assert.equal(stackOf('nailpolish').c, undefined, 'Original puts the item colours back');
  // the Hand chip: recolours the selected hand
  chip('base').onclick();
  $('profileGrid').children.find(c => c.dataset.id === 'cartoon').onclick();
  const hrow = $('catColor').children.find(c => c.classList.contains('cprow'));
  assert.ok(hrow, 'the Hand chip has the picker for the worn hand');
  hrow.children.find(x => x.dataset.color === '#e42525').onclick();
  assert.equal(JSON.parse(globalThis.localStorage.getItem('ff-hcolors')).cartoon, '#e42525', 'the cartoon hand is recoloured');
  $('custBtn').onclick();
  $('profileBack').onclick();
});
