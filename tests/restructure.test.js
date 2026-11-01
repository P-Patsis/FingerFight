// The Profile restructure: skeleton colour, per-category colours, two-stop gradients (validated like any network value), effect intensity inside
// the particle caps, user-made hands next to the built-in ones, the idle sway, and migration of per-item colours to per-category ones.
import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
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

test('Profile: the skeleton colour picker shows for skeleton views, saves a clean colour, and ignores junk', async () => {
  $('profileBtn').onclick();
  const modes = $('modePicker').children;
  modes.find(x => x.dataset.mode === 'puppet').onclick();
  assert.equal($('skelRow').hidden, true, 'not for the puppet view');
  modes.find(x => x.dataset.mode === 'skeleton').onclick();
  assert.equal($('skelRow').hidden, false);
  $('skelPicker').children.find(x => x.dataset.color === '#22c55e').onclick();
  assert.equal(globalThis.localStorage.getItem('ff-skel'), '#22c55e');
  const any = $('skelPicker').children.find(x => x.type === 'color');
  any.value = 'javascript:1'; any.oninput();
  assert.equal(globalThis.localStorage.getItem('ff-skel'), '', 'junk clears to the default, never stored as is');
  any.value = '#00ff88'; any.oninput();
  assert.equal(globalThis.localStorage.getItem('ff-skel'), '#00ff88');
  $('profileBack').onclick();
});

// ---- per-category colours --------------------------------------------------------------------------------------------------------
test('colour per CATEGORY: one colour for everything worn of that type (and for what is worn later); rings and gloves have none', () => {
  const inv = new Inventory(memStorage());
  inv.toggle('tribal'); inv.toggle('scar'); inv.toggle('nailpolish'); inv.toggle('goldring');
  assert.equal(inv.setCategoryColor('tattoo', '#22d3ee'), true);
  assert.deepEqual(inv.stack.filter(s => ['tribal', 'scar'].includes(s.id)).map(s => s.color), ['#22d3ee', '#22d3ee'], 'all tattoos');
  assert.equal(inv.stack.find(s => s.id === 'nailpolish').color, null, 'other categories untouched');
  inv.grant('runes'); inv.toggle('runes');
  assert.equal(inv.stack.find(s => s.id === 'runes').color, '#22d3ee', 'a tattoo worn later takes the category colour');
  assert.equal(inv.setCategoryColor('ring', '#ff0000'), false); assert.equal(inv.setCategoryColor('glove', '#ff0000'), false);
  assert.equal(inv.setCategoryColor('tattoo', 'red'), false); assert.equal(inv.setCategoryColor('tattoo', 'url(#a)'), false); assert.equal(inv.categoryStyle('tattoo').c, '#22d3ee');
  assert.equal(inv.setCategoryColor('tone', '#e3ad7c'), true); inv.toggle('skintone');
  assert.equal(inv.stack.find(s => s.id === 'skintone').color, '#e3ad7c', 'skin tone has its own category colour');
  inv.setCategoryColor('base', '#ff8800'); inv.toggle('neon');
  assert.equal(inv.baseColor, '#ff8800', 'the hand colour is a category colour too');
  inv.setCategoryColor('tattoo', null);
  assert.ok(inv.stack.filter(s => ['tribal', 'scar', 'runes'].includes(s.id)).every(s => s.color === null), 'Original colours');
});

test('colours per category are saved on the phone and come back after a reload', () => {
  const st = memStorage(), inv = new Inventory(st);
  inv.toggle('nailpolish'); inv.setCategoryColor('nails', '#12ab34', '#a855f7');
  const back = new Inventory(st);
  assert.deepEqual(back.categoryStyle('nails'), { c: '#12ab34', d: '#a855f7', k: null });
  assert.deepEqual(JSON.parse(st.m.get('ff-stack')), [{ id: 'nailpolish', c: '#12ab34', d: '#a855f7' }]);
  st.m.set('ff-catstyle', JSON.stringify({ nails: { c: 'blue', d: '#fff' }, ring: { c: '#ff0000' }, tattoo: { c: '#112233', d: 'x', k: 99 }, junk: 1 }));
  const clean = new Inventory(st);
  assert.deepEqual(clean.categoryStyle('nails'), { c: null, d: null, k: null }, 'bad colours dropped');
  assert.deepEqual(clean.categoryStyle('tattoo'), { c: '#112233', d: null, k: null });
  assert.equal(clean.categoryStyle('ring').c, null, 'no picker for rings');
});

test('MIGRATION: colours picked per item (older versions) become the category colour, unified across the category; hand colour too', () => {
  const st = memStorage();
  st.m.set('ff-stack', JSON.stringify([{ id: 'tribal', c: '#aa0000' }, { id: 'scar' }, { id: 'nailpolish', c: '#00aa00' }, { id: 'goldring' }]));
  st.m.set('ff-puppet', 'neon'); st.m.set('ff-bcolor', '#0000aa');
  const inv = new Inventory(st);
  assert.equal(inv.categoryStyle('tattoo').c, '#aa0000'); assert.equal(inv.categoryStyle('nails').c, '#00aa00'); assert.equal(inv.categoryStyle('base').c, '#0000aa');
  assert.equal(inv.stack.find(s => s.id === 'scar').color, '#aa0000', 'the other tattoo follows the category');
  assert.ok(st.m.get('ff-catstyle'), 'written once');
  // the oldest format: separate colour variants of one item
  const old = memStorage();
  old.m.set('ff-cos', JSON.stringify({ tone: 'orc', nails: 'rednails' }));
  const o = new Inventory(old);
  assert.deepEqual(o.stack.map(s => [s.id, s.color]), [['skintone', '#86b35a'], ['nailpolish', '#dc2626']]);
  assert.equal(o.categoryStyle('tone').c, '#86b35a'); assert.equal(o.categoryStyle('nails').c, '#dc2626');
});

// ---- gradients ---------------------------------------------------------------------------------------------------------------
test('gradient: two plain #rrggbb stops only, over the wire and in storage; drawn as solid mixes, never as CSS', () => {
  const ok = [{ id: 'nailpolish', c: '#ff0000', d: '#0000ff' }];
  assert.equal(validLay(ok), true);
  for (const bad of [[{ id: 'nailpolish', d: '#0000ff' }], [{ id: 'nailpolish', c: '#ff0000', d: 'blue' }], [{ id: 'nailpolish', c: '#ff0000', d: 'linear-gradient(red,blue)' }],
    [{ id: 'nailpolish', c: '#ff0000', d: '#00f' }], [{ id: 'nailpolish', c: '#ff0000', d: '#0000ff', x: 1 }], [{ id: 'nailpolish', c: '#ff0000', d: ['#000000', '#ffffff'] }]]) assert.equal(validLay(bad), false, JSON.stringify(bad));
  assert.equal(validBc('#123456'), true); assert.equal(validBc('url(#x)'), false);
  assert.deepEqual(stackToWire([{ id: 'nailpolish', color: '#ff0000', color2: '#0000ff' }, { id: 'goldring', color: null, color2: '#0000ff' }, { id: 'scar', color: null, color2: 'x' }]),
    [{ id: 'nailpolish', c: '#ff0000', d: '#0000ff' }, { id: 'goldring' }, { id: 'scar' }], 'a second stop never travels without a first, and junk is dropped');
  assert.deepEqual(cleanStack([{ id: 'nailpolish', c: '#ff0000', d: 'nope' }]), [{ id: 'nailpolish', color: '#ff0000' }]);
  const rec = resolveLoadout('cartoon', [{ id: 'nailpolish', color: '#ff0000', color2: '#0000ff' }]);
  const nails = rec.layers.find(l => l.id === 'nailpolish');
  const fills = ['thumb', 'index', 'middle', 'ring', 'pinky'].map(f => nails.parts[f + '_tip'][0].fill);
  assert.equal(new Set(fills).size, 5, 'each nail gets its own mix across the hand');
  assert.ok(fills.every(f => /^#[0-9a-f]{6}$/.test(f)), 'only plain colours are ever drawn');
  assert.equal(fills[0], '#ff0000', 'thumb side = stop 1'); assert.equal(fills[4], '#0000ff', 'pinky side = stop 2');
  // gradients only where they make sense: a tone ignores the second stop, a ring has no colour at all
  const tone = resolveLoadout('cartoon', [{ id: 'skintone', color: '#e3ad7c', color2: '#0000ff' }]);
  const plain = resolveLoadout('cartoon', [{ id: 'skintone', color: '#e3ad7c' }]);
  assert.deepEqual(tone.skin.parts.index_base.shapes, plain.skin.parts.index_base.shapes);
  // a gradient hand (neon) and gradient effects
  const neon = resolveLoadout('neon', [], '#ff0000', '#0000ff');
  assert.notDeepEqual(neon.skin.parts.thumb_base.shapes, neon.skin.parts.pinky_base.shapes);
  const fx = resolveLoadout('cartoon', [{ id: 'bubbles', color: '#ff0000', color2: '#0000ff' }]);
  assert.ok(fx.emitters[0].palette.length >= 3 && fx.emitters[0].palette.every(c => /^#[0-9a-f]{6}$/.test(c)));
  // storage: categories that allow it
  const inv = new Inventory(memStorage()); inv.toggle('nailpolish'); inv.toggle('goldring');
  assert.equal(inv.setCategoryColor('nails', '#ff0000', '#0000ff'), true); assert.deepEqual(inv.categoryStyle('nails'), { c: '#ff0000', d: '#0000ff', k: null });
  assert.equal(inv.setCategoryColor('nails', '#ff0000', 'blue'), false, 'a bad second stop refuses the whole change');
  assert.equal(inv.setCategoryColor('tone', '#e3ad7c', '#0000ff'), true); assert.equal(inv.categoryStyle('tone').d, null, 'no gradient for skin tone');
  inv.setCategoryColor('nails', '#ff0000', null); assert.equal(inv.categoryStyle('nails').d, null, 'gradient off');
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
  slider.value = '9'; slider.oninput();
  assert.equal(JSON.parse(globalThis.localStorage.getItem('ff-stack')).find(x => x.id === 'bubbles').k, 9);
  chip('nails').onclick();
  const panelKids = $('catColor').children.flatMap(c => [c, ...c.children]);
  assert.ok(panelKids.find(x => x.dataset?.act === 'gradient'), 'nails offer a gradient'); assert.ok(!panelKids.find(x => x.dataset?.act === 'intensity'));
  chip('ring').onclick();
  assert.ok(!$('catColor').children.flatMap(c => [c, ...c.children]).find(x => x.dataset?.act === 'gradient'));
  chip('tone').onclick();
  assert.ok(!$('catColor').children.flatMap(c => [c, ...c.children]).find(x => x.dataset?.act === 'gradient'), 'no gradient for skin tone');
  assert.deepEqual($('profileLayers').children.map(x => x.dataset.value), L.LAYERS, 'Hand, Skin tone, Tattoo, Nails, Ring, Glove, Effect');
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
  assert.deepEqual($('skinPicker').children.map(x => x.dataset.skin), [...builtIn, 'myhand'].filter(id => C.entryOf(id).free), 'the picker lists built-in (the ones you own) and your own hands together');
  $('profileBack').onclick();
  S.resetSkins();
});

// ---- idle sway -----------------------------------------------------------------------------------------------------------------
test('static preview sway: gentle, starts on the back of the hand (nails), and turns far enough to show the palm side too', () => {
  let back = 0, palm = 0, maxStep = 0, prev = null;
  for (let t = 0; t <= 16000; t += 40) {
    const s = A.swayOf(t);
    if (s.back) back++; else palm++;
    assert.ok(Math.abs(s.scale) <= 1 && Math.abs(s.scale) >= 0.05, 'never a degenerate scale');
    assert.equal(s.back, s.scale > 0, 'past edge-on the hand is seen from the palm side (mirrored, as a real turn)');
    if (prev !== null) maxStep = Math.max(maxStep, Math.abs(s.angle - prev));
    prev = s.angle;
  }
  assert.ok(back > 0 && palm > 0, 'both sides appear');
  assert.ok(back / (back + palm) > 0.5 && palm / (back + palm) > 0.15, 'the nail side is the main view, the palm is seen for a good part');
  assert.ok(maxStep < 0.12, 'a gentle turn, not a spin (max ' + maxStep.toFixed(3) + ' rad per 40 ms)');
  assert.equal(A.swayOf(0).back, true, 'starts on the back of the hand (also the still picture under reduced motion)');
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
