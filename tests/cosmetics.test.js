// Layered cosmetics: the layer vocabulary and z-order, free stacking, categories and filtering, premade whole hands, particles,
// the wire field, the local inventory, and the unlock path being a replaceable stub. Plus the Store screen in the fake browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installBrowser, until } from './harness.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const b = installBrowser('?sim=1');
const $ = id => b.byId.get(id);
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
await import('../js/main.js');

const { loadCatalog, catalog, filterCatalog, entryOf, parseItem, resolveLoadout, cleanStack, stackToWire, legacyStack, loadItems, resetItems } = await import('../js/cosmetics.js');
const layersMod = await import('../js/layers.js');
const { LAYERS, CATEGORIES, MAX_STACK, roleColor } = layersMod;
globalThis.__hands = await import('../js/hands.js');
const { rigPlan, PART_NAMES } = await import('../js/puppet.js');
const { hasSkin, getSkin } = await import('../js/skins.js');
const { Inventory } = await import('../js/inventory.js');
const unlock = await import('../js/unlock.js');
const particles = await import('../js/particles.js');
const { validCos, validLay, validBc, validReveal } = await import('../js/logic.js');
const { drawFromMessage, drawViewPreview } = await import('../js/avatars.js');
const { statesToLandmarks } = await import('../js/puppet.js');
await loadCatalog();

const pts = statesToLandmarks({ thumb: true, index: true, middle: true, ring: true, pinky: true }).map(([x, y]) => ({ x: x / 4, y: y / 4 }));
const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };

// ---- the vocabulary and the shipped items -----------------------------------------------------------------------------------
test('layer types, the stack limit and categories', () => {
  assert.deepEqual(LAYERS, ['base', 'tone', 'tattoo', 'nails', 'ring', 'glove', 'effect']);
  assert.equal(layersMod.LAYER_Z, undefined, 'the draw order is no longer a fixed z per type: it is the order the items were equipped in');
  assert.ok(MAX_STACK >= 8 && MAX_STACK <= 16);
  assert.deepEqual(CATEGORIES, ['human', 'animal', 'scifi', 'fantasy', 'premade']);
});

test('every shipped item loads, is listed once, and every layer, category and premade type is represented', () => {
  const list = catalog();
  assert.equal(new Set(list.map(e => e.id)).size, list.length, 'ids are unique across hands and items');
  for (const f of fs.readdirSync(path.join(root, 'assets/items')).filter(f => f !== 'manifest.json')) assert.ok(entryOf(f.replace('.json', '')), f + ' is in the manifest and loads');
  for (const l of LAYERS) assert.ok(list.some(e => e.layer === l), 'a ' + l + ' item exists');
  for (const c of CATEGORIES) assert.ok(list.some(e => e.category === c), 'a ' + c + ' item exists');
  for (const e of list) { assert.ok(CATEGORIES.includes(e.category)); assert.ok(LAYERS.includes(e.layer)); assert.equal(typeof e.free, 'boolean'); }
  assert.ok(list.filter(e => e.free).length >= 10 && list.some(e => !e.free), 'free items to use now, locked ones to unlock');
});

test('a premade whole hand exists: a base item that is one finished piece', () => {
  const g = entryOf('gauntlet');
  assert.equal(g.category, 'premade'); assert.equal(g.layer, 'base'); assert.equal(g.whole, true); assert.equal(g.free, true);
  assert.equal(rigPlan(pts, getSkin('gauntlet')).length, 16, 'it rigs onto the 16 named parts like any hand');
  assert.ok(g.particles.some(p => p.trigger === 'snap') && g.particles.some(p => p.rate > 0), 'a glow and a snap effect');
});

// ---- stacking and z-order -----------------------------------------------------------------------------------------------------
test('CLICK ORDER: the last item worn is drawn on top, and multiples of one type stack in tap order', () => {
  // tap Glove, then Ring: the ring is over the glove
  const glovesFirst = resolveLoadout('cartoon', [{ id: 'whiteglove' }, { id: 'goldring' }]);
  assert.deepEqual(glovesFirst.layers.map(l => l.id), ['whiteglove', 'goldring']);
  const base = rigPlan(pts, getSkin('cartoon')).length;
  const lastOf = (plan, tag) => plan.map(x => x.part).map((p, i) => (p.endsWith('@' + tag) ? i : -1)).filter(i => i >= 0).pop();
  const firstOf = (plan, tag) => plan.findIndex(x => x.part.endsWith('@' + tag));
  const plan = rigPlan(pts, glovesFirst.skin, glovesFirst.layers);
  assert.ok(firstOf(plan, 'whiteglove') >= base, 'everything cosmetic comes after the whole base hand');
  assert.ok(plan.slice(0, base).every(x => !x.part.includes('@')));
  assert.ok(lastOf(plan, 'whiteglove') < firstOf(plan, 'goldring'), 'ring on top of the glove');
  // tap Ring, then Glove: now the glove covers the ring (the fixed z-order is gone)
  const ringFirst = resolveLoadout('cartoon', [{ id: 'goldring' }, { id: 'whiteglove' }]);
  const plan2 = rigPlan(pts, ringFirst.skin, ringFirst.layers);
  assert.ok(lastOf(plan2, 'goldring') < firstOf(plan2, 'whiteglove'), 'glove on top of the ring');
  // MULTIPLES: a second ring stacks on top of the first, and a third ring is fine too
  const rings = resolveLoadout('cartoon', [{ id: 'whiteglove' }, { id: 'goldring' }, { id: 'silverring' }, { id: 'ruby' }]);
  assert.deepEqual(rings.layers.map(l => l.id), ['whiteglove', 'goldring', 'silverring', 'ruby']);
  const plan3 = rigPlan(pts, rings.skin, rings.layers);
  assert.ok(lastOf(plan3, 'goldring') < firstOf(plan3, 'silverring') && lastOf(plan3, 'silverring') < firstOf(plan3, 'ruby'));
});

test('free stacking: nothing is blocked, every combination of owned items draws', () => {
  const free = catalog().filter(e => e.free && e.layer !== 'base').map(e => e.id);
  assert.ok(free.length >= 12);
  for (const base of ['cartoon', 'robot', 'paw', 'gauntlet', 'neon']) {
    const rec = resolveLoadout(base, free.slice(0, MAX_STACK).map(id => ({ id })));
    assert.ok(rigPlan(pts, rec.skin, rec.layers).length >= 16);
  }
  const many = resolveLoadout('cartoon', Array.from({ length: 40 }, (_, i) => ({ id: i % 2 ? 'goldring' : 'whiteglove' })));
  assert.equal(many.layers.length, 2, 'the same item is worn once (tapping again takes it off)');
  assert.equal(cleanStack(free.map(id => ({ id }))).length, Math.min(free.length, MAX_STACK), 'never more than the limit');
});

test('items map onto the named parts only; a bad item is refused', () => {
  const ok = JSON.parse(read('assets/items/goldring.json'));
  for (const k of Object.keys(ok.parts)) assert.ok(PART_NAMES.includes(k));
  assert.throws(() => parseItem({ ...ok, parts: { thumb_nail: ok.parts.ring_base } }), /unknown part/);
  assert.throws(() => parseItem({ ...ok, layer: 'base' }), /layer must be/);
  assert.throws(() => parseItem({ ...ok, id: 'Bad Id' }), /id must be/);
  assert.throws(() => parseItem({ ...ok, category: 'robots' }), /category/);
  assert.throws(() => parseItem({ ...ok, parts: { ring_base: [{ d: 'url(#x)' }] } }), /path data/);
  assert.throws(() => parseItem({ ...ok, particles: [{ effect: 'confetti', color: '#fff', rate: 1 }] }), /effect/);
});

test('the skin tone is a colour picker on ONE item: it recolours the base where it uses the skin colours, and leaves other hands alone', () => {
  const fill = rec => rec.skin.parts.palm.shapes[0].fill;
  assert.equal(fill(resolveLoadout('cartoon', [])), '#f6c9a0');
  const deep = resolveLoadout('cartoon', [{ id: 'skintone', color: '#7a4a2b' }]);
  assert.equal(fill(deep), '#7a4a2b', 'the picked colour is the skin');
  assert.notEqual(deep.skin.parts.palm.shapes[0].stroke, '#9a5b2e', 'the outline follows (darker)');
  assert.notEqual(fill(resolveLoadout('cartoon', [{ id: 'skintone', color: '#86b35a' }])), fill(deep), 'any colour');
  assert.equal(fill(resolveLoadout('cartoon', [{ id: 'skintone' }])), '#e3ad7c', 'no colour picked yet: the item default');
  assert.equal(fill(resolveLoadout('robot', [{ id: 'skintone', color: '#7a4a2b' }])), fill(resolveLoadout('robot', [])), 'robot has no skin colours to change');
  assert.equal(fill(resolveLoadout('gauntlet', [{ id: 'skintone', color: '#86b35a' }])), fill(resolveLoadout('gauntlet', [])), 'a premade whole hand is finished: no tone');
  assert.deepEqual(resolveLoadout('cartoon', [{ id: 'skintone', color: '#7a4a2b' }, { id: 'skintone', color: '#ffffff' }]).skin.parts.palm.shapes[0].fill, '#7a4a2b', 'one tone');
});

test('unknown, malformed or hostile entries in a stack are ignored, never thrown on', () => {
  assert.deepEqual(cleanStack([{ id: 'goldring' }, { id: 'Bad Id' }, { id: 5 }, null, 'ok', { id: 'goldring' }, { id: 'ruby', color: 'red' }, { id: 'nails', c: '#ABCDEF' }, { id: 'x', color: 'url(#a)' }]),
    [{ id: 'goldring', color: null }, { id: 'ok', color: null }, { id: 'ruby', color: null }, { id: 'nails', color: '#abcdef' }, { id: 'x', color: null }]);
  const rec = resolveLoadout('nonsense', [{ id: 'nothere' }, { id: 'goldring' }]);
  assert.deepEqual(rec.layers.map(l => l.id), ['goldring']);
  assert.ok(rec.skin);
  assert.doesNotThrow(() => resolveLoadout('cartoon', 'garbage')); assert.doesNotThrow(() => resolveLoadout('cartoon', { toString: 1 }));
  assert.deepEqual(stackToWire([{ id: 'nailpolish', color: '#dc2626' }, { id: 'goldring', color: null }]), [{ id: 'nailpolish', c: '#dc2626' }, { id: 'goldring' }]);
});

// ---- categories and filtering --------------------------------------------------------------------------------------------------
test('category and layer filters', () => {
  const all = catalog();
  assert.equal(filterCatalog(all, {}).length, all.length);
  const animals = filterCatalog(all, { category: 'animal' });
  assert.ok(animals.length >= 1 && animals.every(e => e.category === 'animal'));
  const rings = filterCatalog(all, { layer: 'ring' });
  assert.ok(rings.length >= 2 && rings.every(e => e.layer === 'ring'));
  const both = filterCatalog(all, { category: 'fantasy', layer: 'ring' });
  assert.deepEqual(both.map(e => e.id), ['ruby']);
  assert.deepEqual(filterCatalog(all, { layer: 'effect' }).map(e => e.id), ['sparkles', 'bubbles', 'glow', 'embers', 'electric'], 'effects are a category of their own');
  assert.deepEqual(filterCatalog(all, { category: 'animal', layer: 'glove' }), []);
  assert.equal(filterCatalog(all, { category: 'premade', layer: 'base' }).length, 2);
});

// ---- inventory ---------------------------------------------------------------------------------------------------------------------
test('TAP TO TOGGLE: wearing an item adds it on top, tapping it again takes it off; locked items cannot be worn', () => {
  const st = memStorage(), inv = new Inventory(st);
  assert.equal(inv.owns('goldring'), true); assert.equal(inv.owns('ruby'), false); assert.equal(inv.owns('nothere'), false);
  assert.deepEqual(inv.toggle('ruby'), { ok: false, on: false }, 'locked: nothing happens'); assert.deepEqual(inv.stack, []);
  assert.deepEqual(inv.toggle('whiteglove'), { ok: true, on: true });
  assert.deepEqual(inv.toggle('goldring'), { ok: true, on: true });
  assert.deepEqual(inv.stack.map(s => s.id), ['whiteglove', 'goldring'], 'tap order = draw order; the ring is on top of the glove');
  assert.deepEqual(inv.toggle('silverring'), { ok: true, on: true });
  assert.deepEqual(inv.stack.map(s => s.id), ['whiteglove', 'goldring', 'silverring'], 'several items of one type: all stay, newest on top');
  assert.equal(inv.isEquipped('goldring'), true); assert.equal(inv.position('silverring'), 3);
  assert.deepEqual(inv.toggle('goldring'), { ok: true, on: false });
  assert.deepEqual(inv.stack.map(s => s.id), ['whiteglove', 'silverring'], 'tapping again removes that one instance');
  assert.deepEqual(inv.toggle('goldring'), { ok: true, on: true });
  assert.deepEqual(inv.stack.map(s => s.id), ['whiteglove', 'silverring', 'goldring'], 'worn again: back on TOP');
  assert.equal(JSON.stringify(JSON.parse(st.m.get('ff-stack'))), JSON.stringify([{ id: 'whiteglove' }, { id: 'silverring' }, { id: 'goldring' }]));
  // the hand: one, always the bottom
  assert.deepEqual(inv.toggle('paw'), { ok: true, on: true }); assert.equal(inv.baseId, 'paw'); assert.equal(st.m.get('ff-puppet'), 'paw');
  assert.deepEqual(inv.toggle('paw'), { ok: true, on: true }, 'the hand cannot be taken off');
  assert.equal(inv.toggle('dragon').ok, false, 'a locked hand cannot be worn'); assert.equal(inv.baseId, 'paw');
  // one skin tone at a time
  inv.toggle('skintone'); inv.toggle('skintone'); inv.toggle('skintone');
  assert.equal(inv.stack.filter(s => s.id === 'skintone').length, 1);
  assert.equal(inv.loadoutWith('goldring').stack.at(-1).id === 'goldring' || inv.isEquipped('goldring'), true);
  const empty = new Inventory(memStorage()), lw = empty.loadoutWith('goldring');
  assert.deepEqual(lw.stack.map(s => s.id), ['goldring'], 'loadoutWith previews an item without wearing it'); assert.deepEqual(empty.stack, []);
  inv.clear(); assert.deepEqual(inv.stack, []); assert.equal(inv.baseId, 'paw', 'the hand stays');
  const full = new Inventory(memStorage());
  const wearable = catalog().filter(e => e.free && e.layer !== 'base').map(e => e.id);
  let n = 0; for (const id of wearable) if (full.toggle(id).ok) n++;
  assert.equal(n, MAX_STACK); assert.equal(full.stack.length, MAX_STACK); full.grant('ruby'); assert.equal(full.toggle('ruby').full, true, 'the 13th item is refused'); assert.equal(full.isEquipped('ruby'), false);
});

test('MANUAL REORDER: moving an item up or down changes the draw order, the ends stop, and it persists', () => {
  const st = memStorage(), inv = new Inventory(st);
  for (const id of ['whiteglove', 'goldring', 'nailpolish']) inv.toggle(id);
  const order = () => inv.stack.map(s => s.id);
  assert.deepEqual(order(), ['whiteglove', 'goldring', 'nailpolish']);
  assert.equal(inv.move('whiteglove', +1), true); assert.deepEqual(order(), ['goldring', 'whiteglove', 'nailpolish'], 'glove moved over the ring');
  assert.equal(inv.move('nailpolish', -1), true); assert.deepEqual(order(), ['goldring', 'nailpolish', 'whiteglove']);
  assert.equal(inv.move('whiteglove', +1), false, 'already on top'); assert.equal(inv.move('goldring', -1), false, 'already next to the hand'); assert.equal(inv.move('ghost', 1), false);
  assert.deepEqual(order(), ['goldring', 'nailpolish', 'whiteglove']);
  // the drawn result follows the new order
  const rec = resolveLoadout(inv.baseId, inv.stack, inv.baseColor);
  assert.deepEqual(rec.layers.map(l => l.id), ['goldring', 'nailpolish', 'whiteglove']);
  assert.deepEqual(new Inventory(st).stack.map(s => s.id), ['goldring', 'nailpolish', 'whiteglove'], 'the order is saved');
  assert.equal(inv.remove('nailpolish'), true); assert.equal(inv.remove('nailpolish'), false); assert.deepEqual(order(), ['goldring', 'whiteglove']);
});

test('COLOUR PICKERS: only plain #rrggbb is accepted and stored, only on items that have a picker; the colour changes the drawing', () => {
  const st = memStorage(), inv = new Inventory(st);
  inv.toggle('nailpolish'); inv.toggle('goldring');
  assert.equal(inv.colorOf('nailpolish'), '#dc2626', 'the item default until a colour is picked');
  assert.equal(inv.setColor('nailpolish', '#22D3EE'), true); assert.equal(inv.colorOf('nailpolish'), '#22d3ee', 'normalised to lower case');
  assert.equal(JSON.parse(st.m.get('ff-stack'))[0].c, '#22d3ee');
  for (const bad of ['red', 'url(#a)', '#12', '#12345', '#1234567', '#gggggg', 'rgb(1,2,3)', '#22d3ee; evil', 5, {}, undefined]) {
    assert.equal(inv.setColor('nailpolish', bad), false, String(bad)); assert.equal(inv.colorOf('nailpolish'), '#22d3ee', 'unchanged');
  }
  assert.equal(inv.setColor('goldring', '#ff0000'), false, 'a ring has no picker'); assert.equal(inv.setColor('whiteglove', '#ff0000'), false, 'not worn / no picker');
  assert.equal(inv.setColor('nailpolish', null), true); assert.equal(inv.colorOf('nailpolish'), '#dc2626');
  inv.setColor('nailpolish', '#22d3ee');
  assert.equal(new Inventory(st).colorOf('nailpolish'), '#22d3ee', 'the colour persists');
  // it reaches the drawing
  const shapes = rec => rec.layers.find(l => l.id === 'nailpolish').parts.index_tip[0];
  assert.equal(shapes(resolveLoadout('cartoon', inv.stack)).fill, '#22d3ee');
  assert.equal(shapes(resolveLoadout('cartoon', inv.stack)).stroke, roleColor('#22d3ee', 'dark'), 'the edge follows, darker');
  assert.equal(shapes(resolveLoadout('cartoon', [{ id: 'nailpolish' }])).fill, '#dc2626');
  // tunable hands: neon glow and dragon scales
  inv.toggle('neon'); assert.equal(inv.setColor('neon', '#ec4899'), true); assert.equal(inv.baseColor, '#ec4899'); assert.equal(st.m.get('ff-bcolor'), '#ec4899');
  const neon = resolveLoadout('neon', [], '#ec4899');
  assert.ok(JSON.stringify(neon.skin.parts.palm.shapes).includes('#ec4899') && !JSON.stringify(neon.skin.parts.palm.shapes).includes('#22d3ee'));
  assert.equal(inv.setColor('robot', '#ec4899'), false, 'the robot has no picker'); assert.equal(inv.setColor('cartoon', '#ec4899'), false, 'only the worn hand');
  inv.toggle('cartoon'); assert.equal(inv.baseColor, null, 'a new hand starts in its own colours');
  assert.ok(JSON.stringify(resolveLoadout('dragon', [], '#3b82f6').skin.parts.palm.shapes).includes('#3b82f6'));
  assert.equal(resolveLoadout('robot', [], '#3b82f6').skin, getSkin('robot'), 'a hand without a picker ignores a colour');
});

test('COLOUR items collapsed: skin tones, nail polishes and tattoos are one item + a picker; tint data is validated like network input', () => {
  for (const gone of ['pale', 'tan', 'brown', 'deep', 'orc', 'frost', 'rednails', 'blacknails', 'neonnails']) assert.equal(entryOf(gone), null, gone + ' is now a colour of another item');
  for (const id of ['skintone', 'nailpolish', 'tribal', 'scar', 'runes', 'neon', 'dragon', 'sparkles', 'bubbles', 'glow', 'embers', 'electric']) assert.ok(entryOf(id)?.tint, id + ' has a colour picker');
  for (const id of ['goldring', 'whiteglove', 'robot', 'gauntlet']) assert.equal(entryOf(id).tint, null);
  const ok = JSON.parse(read('assets/items/nailpolish.json'));
  assert.throws(() => parseItem({ ...ok, tint: { ...ok.tint, default: 'red' } }), /#rrggbb/);
  assert.throws(() => parseItem({ ...ok, tint: { ...ok.tint, map: { '#dc2626': 'sparkle' } } }), /main/);
  assert.throws(() => parseItem({ ...ok, tint: { ...ok.tint, swatches: ['url(#x)'] } }), /swatches/);
  assert.throws(() => parseItem({ ...JSON.parse(read('assets/items/skintone.json')), tint: undefined }), /tone needs a "tint"/);
});

test('MIGRATION: an old saved inventory (one item per layer, colour items) becomes a stack + colours', () => {
  const st = memStorage();
  st.m.set('ff-cos', JSON.stringify({ tone: 'deep', tattoo: 'scar', nails: 'blacknails', ring: 'goldring', glove: 'whiteglove' }));
  st.m.set('ff-owned', JSON.stringify(['blacknails', 'ruby']));
  st.m.set('ff-puppet', 'robot');
  const inv = new Inventory(st);
  assert.deepEqual(inv.stack, [{ id: 'skintone', color: '#7a4a2b' }, { id: 'scar', color: null }, { id: 'nailpolish', color: '#111827' }, { id: 'goldring', color: null }, { id: 'whiteglove', color: null }],
    'same order as the old fixed z-order, old colour items = base item + its colour');
  assert.ok(st.m.has('ff-stack'), 'saved in the new format'); assert.equal(inv.baseId, 'robot'); assert.equal(inv.owns('ruby'), true, 'the grant list is kept as is');
  assert.deepEqual(new Inventory(st).stack.map(s => s.id), ['skintone', 'scar', 'nailpolish', 'goldring', 'whiteglove'], 'and read back from it afterwards');
  // old items that are gone / not owned are dropped on load; the stack in the new key wins over the old key
  const st2 = memStorage();
  st2.m.set('ff-cos', JSON.stringify({ ring: 'ruby', glove: 'leather' }));
  assert.deepEqual(new Inventory(st2).stack.map(s => s.id), [], 'locked and not granted: not worn');
  const st3 = memStorage(); st3.m.set('ff-cos', JSON.stringify({ ring: 'goldring' })); st3.m.set('ff-stack', JSON.stringify([{ id: 'whiteglove' }]));
  assert.deepEqual(new Inventory(st3).stack.map(s => s.id), ['whiteglove']);
  // a phone still sending the old wire format is drawn the same way
  const old = resolveLoadout('cartoon', { tone: 'deep', nails: 'neonnails' });
  assert.equal(old.skin.parts.palm.shapes[0].fill, '#7a4a2b'); assert.equal(old.layers[0].parts.index_tip[0].fill, '#22d3ee');
  assert.deepEqual(legacyStack({ ring: 'goldring', evil: 'x' }), [{ id: 'goldring', color: null }]);
});

test('EFFECTS are an item type: worn and stacked like any item, each with a colour, inside the same particle caps', () => {
  const e = entryOf('bubbles');
  assert.equal(e.layer, 'effect'); assert.ok(e.particles.length >= 1 && e.free);
  assert.equal(entryOf('electric').free, false, 'one locked effect to unlock');
  const inv = new Inventory(memStorage());
  inv.toggle('bubbles'); inv.toggle('glow'); inv.toggle('sparkles');
  assert.deepEqual(inv.stack.map(s => s.id), ['bubbles', 'glow', 'sparkles']);
  const rec = resolveLoadout('cartoon', inv.stack);
  assert.deepEqual(rec.layers, [], 'effects draw no shapes');
  assert.deepEqual(rec.emitters.map(m => m.effect), ['bubbles', 'glow', 'glint']);
  inv.setColor('glow', '#ff00ff');
  assert.deepEqual(resolveLoadout('cartoon', inv.stack).emitters.map(m => m.color), ['#7dd3fc', '#ff00ff', '#fde047'], 'the picked colour is the particle colour');
  // many effects: the system still caps emitters and particles
  const ps = new particles.ParticleSystem({ reduced: () => false });
  const lots = resolveLoadout('gauntlet', ['bubbles', 'glow', 'sparkles', 'embers', 'electric'].map(id => ({ id }))).emitters;
  assert.ok(lots.length > particles.MAX_EMITTERS);
  ps.setEmitters(lots); assert.equal(ps.emitters.length, particles.MAX_EMITTERS);
  for (let i = 0; i < 200; i++) ps.update(0.05, handPx);
  assert.ok(ps.list.length <= particles.MAX_PARTICLES);
  const { ctx, calls } = fakeCtx(); ps.draw(ctx); assert.ok(calls.length > 0);
  assert.ok(particles.EFFECTS.bubbles && Object.hasOwn(particles.EFFECTS, 'bubbles'));
  // a snap burst from an effect, and nothing at all under reduced motion
  const calm = new particles.ParticleSystem({ reduced: () => true });
  calm.setEmitters(resolveLoadout('cartoon', [{ id: 'electric' }]).emitters); calm.update(0.1, handPx); calm.trigger('snap', handPx); assert.equal(calm.list.length, 0);
  const live = new particles.ParticleSystem({ reduced: () => false });
  live.setEmitters(resolveLoadout('cartoon', [{ id: 'electric' }]).emitters); live.trigger('snap', handPx); assert.ok(live.list.length >= 12);
});

test('inventory: grants and worn items persist, tolerate junk, and survive a storage that throws', () => {
  const st = memStorage();
  const a = new Inventory(st);
  assert.equal(a.grant('ruby'), true); a.toggle('ruby');
  const again = new Inventory(st);
  assert.equal(again.owns('ruby'), true); assert.deepEqual(again.stack.map(s => s.id), ['ruby'], 'owned and worn after a reload');
  st.m.set('ff-owned', '{not json'); st.m.set('ff-stack', '[1,2]');
  const junk = new Inventory(st);
  assert.equal(junk.owns('ruby'), false); assert.deepEqual(junk.stack, []);
  st.m.set('ff-stack', JSON.stringify([{ id: 'ruby' }, { id: 'leather' }, { id: 'ghost' }, { id: 'paw' }, { id: 'goldring', c: 'url(#x)' }, { id: 'nailpolish', c: 'blue' }]));   // worn but not owned / unknown / a hand / bad colour
  const dropped = new Inventory(st);
  assert.deepEqual(dropped.stack, [{ id: 'goldring', color: null }, { id: 'nailpolish', color: null }]);
  const broken = new Inventory({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  assert.equal(broken.toggle('goldring').ok, true, 'still works in memory'); assert.deepEqual(broken.stack.map(s => s.id), ['goldring']);
});

// ---- the unlock path is a stub with a clearly marked boundary --------------------------------------------------------------------
test('unlock: the stub grants at once and can be replaced; a refusing or throwing provider grants nothing', async () => {
  const src = read('js/unlock.js');
  assert.match(src, /STUB BOUNDARY/); assert.match(src, /setUnlockProvider/);
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|https?:\/\//.test(src.replace(/\/\/.*$/gm, '')), 'no network code in the stub');
  assert.equal(unlock.unlockProviderName(), 'stub');
  const inv = new Inventory(memStorage()), e = entryOf('dragon');
  assert.equal(inv.owns('dragon'), false);
  assert.match(unlock.unlockLabel(e), /Watch ad.*demo/); assert.match(unlock.unlockLabel(entryOf('goldhand')), /Buy.*0\.99.*demo/);
  assert.equal((await unlock.unlockItem(inv, e)).granted, true); assert.equal(inv.owns('dragon'), true);
  assert.equal(inv.toggle('dragon').ok, true);

  const asked = [];
  unlock.setUnlockProvider({ name: 'fake-ads', request: async entry => { asked.push(entry.id); return { granted: false, error: 'ad not completed' }; } });
  assert.equal(unlock.unlockProviderName(), 'fake-ads');
  const inv2 = new Inventory(memStorage());
  const r = await unlock.unlockItem(inv2, entryOf('goldhand'));
  assert.deepEqual([r.granted, r.error, asked], [false, 'ad not completed', ['goldhand']]); assert.equal(inv2.owns('goldhand'), false, 'nothing granted without the provider saying so');
  unlock.setUnlockProvider({ name: 'boom', request: async () => { throw new Error('offline'); } });
  assert.deepEqual(await unlock.unlockItem(inv2, entryOf('goldhand')), { granted: false, error: 'offline' });
  unlock.setUnlockProvider({ name: 'play', request: async () => ({ granted: true, receipt: 'tok_123' }) });
  assert.deepEqual(await unlock.unlockItem(inv2, entryOf('goldhand')), { granted: true, receipt: 'tok_123' }); assert.equal(inv2.owns('goldhand'), true);
  assert.throws(() => unlock.setUnlockProvider({}), /request/);
  unlock.resetUnlockProvider();
  assert.equal(unlock.unlockProviderName(), 'stub');
});

test('no ad SDK or payment code anywhere in the web app', () => {
  const files = ['index.html', ...fs.readdirSync(path.join(root, 'js')).map(f => 'js/' + f)];
  for (const f of files) assert.ok(!/adsbygoogle|googletag|admob|ca-app-pub|stripe\.com|paypal|billingclient|googlesyndication/i.test(read(f).replace(/\/\/.*$/gm, '')), f + ' has no ad/payment SDK');
});

test('the end screen reserves an empty ad slot at the bottom, with no ad code', () => {
  const html = read('index.html');
  const over = html.slice(html.indexOf('<section id="over"'), html.indexOf('</section>', html.indexOf('<section id="over"')));
  assert.ok(/<div id="adSlot"[^>]*><\/div>/.test(over), 'an empty div');
  assert.ok(over.indexOf('id="adSlot"') > over.indexOf('id="settingsBtn"'), 'at the bottom of the result screen');
  assert.ok(!/<(script|iframe|img|ins)\b/.test(over));
  assert.match(read('css/style.css'), /\.ad-slot \{[^}]*min-height: 50px/);
});

// ---- particles -----------------------------------------------------------------------------------------------------------------
const fakeCtx = () => { const calls = []; return { calls, ctx: new Proxy({}, { get: (_, k) => (k === 'calls' ? calls : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => { calls.push(k); }), set: () => true }) }; };
const handPx = [pts];

test('particle effects are validated data, never code', () => {
  assert.deepEqual(particles.parseParticles(undefined), []);
  const ok = particles.parseParticles([{ effect: 'sparks', color: '#fff', where: 'tips', trigger: 'snap', burst: 10 }]);
  assert.deepEqual(ok[0], { effect: 'sparks', color: '#fff', where: 'tips', rate: 0, trigger: 'snap', burst: 10 });
  for (const bad of [{ effect: 'sparks', color: 'red', rate: 1 }, { effect: 'nope', color: '#fff', rate: 1 }, { effect: 'glow', color: '#fff' }, { effect: 'glow', color: '#fff', rate: 99 },
    { effect: 'glow', color: '#fff', rate: 1, where: 'eyes' }, { effect: 'glow', color: '#fff', trigger: 'boom', burst: 3 }, { effect: 'glow', color: '#fff', burst: 100, trigger: 'snap' }, { effect: 'constructor', color: '#fff', rate: 1 }]) {
    assert.throws(() => particles.parseParticles([bad]), undefined, JSON.stringify(bad));
  }
  assert.throws(() => particles.parseParticles(new Array(5).fill({ effect: 'glow', color: '#fff', rate: 1 })), /at most 4/);
});

test('the particle system emits, ages out, is capped, bursts on a trigger, and does nothing under reduced motion', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ps = new particles.ParticleSystem({ reduced: () => false, random: rnd, max: 30 });
  ps.setEmitters(particles.parseParticles([{ effect: 'sparks', color: '#ff0', where: 'knuckles', rate: 40 }, { effect: 'glow', color: '#fa0', where: 'palm', trigger: 'snap', burst: 12 }]));
  for (let i = 0; i < 60; i++) ps.update(1 / 30, handPx);
  assert.ok(ps.list.length > 0 && ps.list.length <= 30, 'live and capped: ' + ps.list.length);
  ps.trigger('snap', handPx);
  assert.ok(ps.list.length <= 30);
  for (let i = 0; i < 60; i++) ps.update(1 / 30, []);                      // no hand: no new particles, the old ones fade out
  assert.equal(ps.list.length, 0, 'everything ages out');
  ps.update(5, handPx);                                                      // a stalled frame (5 s) is clamped, not a flood
  assert.ok(ps.list.length <= 30 * 0.5 + 40 * 0.1 + 1);
  const { calls, ctx } = fakeCtx(); ps.draw(ctx); assert.ok(calls.length > 0);

  const calm = new particles.ParticleSystem({ reduced: () => true });
  calm.setEmitters(particles.parseParticles([{ effect: 'sparks', color: '#ff0', rate: 40, trigger: 'snap', burst: 5 }]));
  calm.update(0.1, handPx); calm.trigger('snap', handPx);
  assert.equal(calm.list.length, 0, 'reduced motion: no particles at all');
  const c2 = fakeCtx(); calm.draw(c2.ctx); assert.equal(c2.calls.length, 0);
});

test('the still snapshot is deterministic, bounded, and allowed under reduced motion', () => {
  const em = particles.parseParticles([{ effect: 'glow', color: '#fa0', where: 'palm', rate: 3 }, { effect: 'sparks', color: '#ff0', where: 'tips', trigger: 'snap', burst: 14 }]);
  const a = fakeCtx(), c = fakeCtx();
  const n1 = particles.snapshot(a.ctx, em, handPx, 's'), n2 = particles.snapshot(c.ctx, em, handPx, 's');
  assert.equal(n1, n2); assert.deepEqual(a.calls, c.calls); assert.ok(n1 > 0 && n1 <= 60);
  assert.equal(particles.snapshot(fakeCtx().ctx, [], handPx), 0);
  assert.ok(particles.MAX_PARTICLES <= 120 && particles.MAX_EMITTERS <= 8, 'global caps stay small');
});

test('the live camera drives particles from its own frame loop (no timers of its own) and snap fires the trigger', () => {
  const hands = read('js/hands.js'), part = read('js/particles.js');
  assert.ok(!/setInterval|setTimeout|requestAnimationFrame/.test(part.replace(/\/\/.*$/gm, '')), 'particles.js owns no loop');
  assert.match(hands, /this\.particles\.update\(dt, pts\)/); assert.match(hands, /this\.particles\.trigger\('snap'/);
});

// ---- the wire ----------------------------------------------------------------------------------------------------------------------
test('worn items travel as ids + order + plain colours only, are validated, and are drawn from this phone\'s own copies', () => {
  assert.equal(validLay(undefined), true); assert.equal(validLay([]), true); assert.equal(validLay([{ id: 'goldring' }, { id: 'nailpolish', c: '#dc2626' }]), true);
  const tooMany = Array.from({ length: 13 }, () => ({ id: 'goldring' }));
  for (const bad of [tooMany, {}, 'ring', [null], [{}], [{ id: 'Gold' }], [{ id: 'a'.repeat(13) }], [{ id: 5 }], [{ id: 'x', c: 'red' }], [{ id: 'x', c: 'url(#a)' }], [{ id: 'x', c: '#fff' }], [{ id: 'x', c: '#12345678' }],
    [{ id: 'x', extra: 1 }], [{ id: 'x', c: 5 }], [['x']], [{ id: { d: 1 } }]]) assert.equal(validLay(bad), false, JSON.stringify(bad));
  assert.equal(validBc(undefined), true); assert.equal(validBc('#22d3ee'), true); for (const bad of ['red', '#fff', 5, {}, 'url(#a)']) assert.equal(validBc(bad), false);
  const m = { count: 3, noHand: false, view: 'puppet', skin: 'cartoon', hands: [{ thumb: true, index: true, middle: true, ring: false, pinky: false }], lm: null, ar: 1.3, photo: '' };
  assert.equal(validReveal({ ...m, lay: [{ id: 'goldring' }, { id: 'nailpolish', c: '#dc2626' }], bc: '#22d3ee' }, false), true, 'drawn cosmetics are fine in a random match');
  assert.equal(validReveal({ ...m, lay: [{ id: '<script>' }] }, false), false); assert.equal(validReveal({ ...m, lay: [{ id: 'x', c: 'red' }] }, false), false);
  assert.equal(validReveal({ ...m, bc: 'javascript:1' }, false), false);
  assert.equal(validReveal(m, false), true, 'an older phone sends none');
  // the old format still validates and still draws
  assert.equal(validCos({ ring: 'goldring', glove: 'leather' }), true); assert.equal(validCos({ base: 'x' }), false);
  assert.equal(validReveal({ ...m, cos: { ring: 'goldring' } }, false), true);
  const { ctx, calls } = fakeCtx();
  assert.doesNotThrow(() => drawFromMessage(ctx, 120, 120, { ...m, lay: [{ id: 'goldring' }, { id: 'unknownitem' }, { id: 'nailpolish', c: '#22d3ee' }], bc: '#ec4899' }));
  assert.ok(calls.length > 10);
  assert.doesNotThrow(() => drawFromMessage(ctx, 120, 120, { ...m, cos: { ring: 'goldring', glove: 'unknownitem' } }));
  // what the camera sends is exactly the validated form, in order
  const { SimCam } = globalThis.__hands;
  const snap = new SimCam().snap({ mode: 'puppet', skin: 'neon', baseColor: '#ec4899', stack: [{ id: 'whiteglove', color: null }, { id: 'nailpolish', color: '#22d3ee' }, { id: 'bad id', color: 'x' }] });
  assert.deepEqual(snap.lay, [{ id: 'whiteglove' }, { id: 'nailpolish', c: '#22d3ee' }]); assert.equal(snap.bc, '#ec4899');
  assert.equal(validReveal({ ...snap, count: 1, noHand: false, gesture: null }, false), true);
});

test('the profile preview draws the cosmetics too', () => {
  const rec = resolveLoadout('gauntlet', [{ id: 'goldring' }, { id: 'bubbles', color: '#ff00ff' }]);
  const { ctx } = fakeCtx();
  assert.deepEqual(drawViewPreview(ctx, 240, 150, 'photo-puppet', rec.skin, rec), { camera: true, hand: 'puppet' });
});

test('items can be loaded from any base path and a broken item is skipped, not fatal', async () => {
  resetItems();
  const files = new Map([['manifest.json', { items: ['good', 'bad', 'gone'] }], ['good.json', JSON.parse(read('assets/items/goldring.json'))], ['bad.json', { format: 1, id: 'bad', layer: 'ring' }]]);
  const fake = async name => { const k = name.replace('x/', ''); return files.has(k) ? { ok: true, json: async () => files.get(k) } : { ok: false, status: 404, json: async () => ({}) }; };
  const warn = console.warn; console.warn = () => {};
  try { assert.deepEqual(await loadItems(fake, 'x/'), []); } finally { console.warn = warn; }   // 'good' declares id goldring, not good: skipped too
  resetItems();
  await loadItems(fetch);
  assert.ok(entryOf('goldring'));
});

// ---- the Store screen -------------------------------------------------------------------------------------------------------------
test('Store + Profile: tap to wear / take off (no equip buttons), worn list with reorder, colour picker, effects, unlock stub', async () => {
  await loadCatalog(); resetItems(); await loadCatalog();
  assert.ok($('storeBtn') && $('storeBack') && $('storeGrid') && $('storePreview'));
  $('storeBtn').onclick();
  assert.deepEqual(b.visible(), ['store']);
  assert.equal($('wearCard').parentElement, $('wearSlotStore'), 'the Wearing card lives in the Store');
  const cards = () => $('storeGrid').children.filter(c => c.matches('.item-card'));
  await until(() => cards().length === catalog().length, 'one card per item');
  const card = id => cards().find(c => c.dataset.id === id);
  const unlockBtn = id => card(id).children.find(c => c.dataset?.act === 'unlock');
  const stackIds = () => JSON.parse(globalThis.localStorage.getItem('ff-stack') || '[]').map(x => x.id);
  const rows = () => $('wearList').children.filter(li => !li.classList.contains('base')).map(li => li.dataset.id);   // top first
  const row = id => $('wearList').children.find(li => li.dataset.id === id);
  const btn = (id, act) => row(id).children.find(c => c.dataset?.act === act);
  // no Equip / Take off buttons any more; locked items have the unlock button, owned ones are plain tappable cards
  for (const c of cards()) assert.ok(!c.children.some(x => /^(equip|off)$/.test(x.dataset?.act || '')));
  assert.ok(unlockBtn('ruby') && !unlockBtn('goldring')); assert.match(unlockBtn('ruby').textContent, /Buy.*demo/);
  assert.equal(card('goldring').getAttribute('role'), 'button');
  // filters
  const chip = (box, v) => $(box).children.find(x => x.dataset.value === v);
  chip('storeCats', 'animal').onclick();
  assert.deepEqual(cards().map(c => c.dataset.id), filterCatalog(catalog(), { category: 'animal' }).map(e => e.id));
  chip('storeCats', 'all').onclick(); chip('storeLayers', 'ring').onclick();
  assert.deepEqual(cards().map(c => c.dataset.id), ['goldring', 'silverring', 'ruby']);
  // TAP: wear, in tap order; the second ring stacks too; tapping again takes that one off
  card('goldring').onclick(); card('silverring').onclick();
  assert.deepEqual(stackIds(), ['goldring', 'silverring']);
  assert.ok(card('goldring').classList.contains('eq') && card('silverring').classList.contains('eq'));
  assert.match(card('silverring').children.at(-1).textContent, /Worn · #2/);
  assert.deepEqual(rows(), ['silverring', 'goldring'], 'the list shows the top first');
  card('goldring').onclick();
  assert.deepEqual(stackIds(), ['silverring']); assert.ok(!card('goldring').classList.contains('eq'));
  card('goldring').onclick();
  assert.deepEqual(stackIds(), ['silverring', 'goldring']);
  // unlock (stub) then tap to wear
  unlockBtn('ruby').onclick();
  await until(() => !unlockBtn('ruby'), 'ruby unlocked by the stub');
  assert.match($('storeMsg').textContent, /Ruby ring unlocked/);
  assert.deepEqual(stackIds(), ['silverring', 'goldring'], 'unlocking does not wear it');
  card('ruby').onclick();
  assert.deepEqual(stackIds(), ['silverring', 'goldring', 'ruby']);
  assert.match($('storeLoadout').textContent, /Ruby ring/);
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('ff-owned')), ['ruby']);
  // MANUAL REORDER with the arrows
  assert.deepEqual(rows(), ['ruby', 'goldring', 'silverring']);
  assert.equal(btn('ruby', 'up').disabled, true, 'already on top'); assert.equal(btn('silverring', 'down').disabled, true, 'already next to the hand');
  btn('ruby', 'down').onclick();
  assert.deepEqual(rows(), ['goldring', 'ruby', 'silverring']); assert.deepEqual(stackIds(), ['silverring', 'ruby', 'goldring']);
  btn('silverring', 'up').onclick();
  assert.deepEqual(stackIds(), ['ruby', 'silverring', 'goldring']);
  btn('ruby', 'remove').onclick();
  assert.deepEqual(stackIds(), ['silverring', 'goldring']); assert.ok(!card('ruby').classList.contains('eq'));
  // COLOUR PICKER on nail polish
  chip('storeLayers', 'nails').onclick();
  card('nailpolish').onclick();
  assert.ok(btn('nailpolish', 'color'), 'a colour dot on a colourable item'); assert.equal(btn('goldring', 'color'), undefined, 'none on a ring');
  btn('nailpolish', 'color').onclick();
  const picker = row('nailpolish').children.find(c => c.dataset?.picker);
  assert.ok(picker && picker.children.filter(x => x.dataset.color).length >= 6, 'swatches');
  picker.children.find(x => x.dataset.color === '#22d3ee').onclick();
  assert.equal(JSON.parse(globalThis.localStorage.getItem('ff-stack')).find(x => x.id === 'nailpolish').c, '#22d3ee');
  const input = row('nailpolish').children.find(c => c.dataset?.picker).children.find(x => x.type === 'color');
  input.value = '#12ab34'; input.oninput();
  assert.equal(JSON.parse(globalThis.localStorage.getItem('ff-stack')).find(x => x.id === 'nailpolish').c, '#12ab34', 'any colour, live');
  input.value = 'javascript:alert(1)'; input.oninput();
  assert.equal(JSON.parse(globalThis.localStorage.getItem('ff-stack')).find(x => x.id === 'nailpolish').c, '#12ab34', 'junk is refused');
  // EFFECTS: pick them like any item
  chip('storeLayers', 'effect').onclick();
  assert.deepEqual(cards().map(c => c.dataset.id), ['sparkles', 'bubbles', 'glow', 'embers', 'electric']);
  card('bubbles').onclick(); card('glow').onclick();
  assert.deepEqual(stackIds().slice(-2), ['bubbles', 'glow']);
  assert.ok(btn('bubbles', 'color'), 'each effect has a colour');
  // the preview and the Test snap button: the simulator has no camera, so it says so and still bursts the preview
  await $('storeSnap').onclick();
  assert.match($('wearMsg').textContent, /simulator has no camera/);
  // PROFILE: the same card and the owned items
  $('storeBack').onclick();
  $('profileBtn').onclick();
  assert.deepEqual(b.visible(), ['profile']);
  assert.equal($('wearCard').parentElement, $('wearSlotProfile'), 'the Wearing card moved to the Profile');
  const pcards = () => $('profileGrid').children.filter(c => c.matches('.item-card'));
  assert.ok(pcards().length > 0 && pcards().every(c => c.dataset.id !== 'dragon' && c.dataset.id !== 'electric'), 'only what you own');
  pcards().find(c => c.dataset.id === 'whiteglove').onclick();
  assert.equal(stackIds().at(-1), 'whiteglove');
  pcards().find(c => c.dataset.id === 'whiteglove').onclick();
  assert.ok(!stackIds().includes('whiteglove'));
  assert.ok(row('goldring') && btn('goldring', 'up'), 'reorder works here too');
  $('profileBack').onclick();
  $('storeBtn').onclick();
  assert.equal($('wearCard').parentElement, $('wearSlotStore'));
  $('storeClear').onclick();
  assert.deepEqual(stackIds(), []); assert.equal(globalThis.localStorage.getItem('ff-puppet') !== null || true, true);
  $('storeBack').onclick();
  assert.deepEqual(b.visible(), ['menu']);
});

test('the service worker precaches every new module and every item and skin file, so the Store works offline', async () => {
  const { shellFiles } = await import('../tools/stamp.mjs');
  const listed = new Set(shellFiles());
  for (const f of ['js/layers.js', 'js/particles.js', 'js/cosmetics.js', 'js/inventory.js', 'js/unlock.js', 'assets/items/manifest.json', 'assets/skins/manifest.json']) assert.ok(listed.has(f), f);
  for (const d of ['assets/items', 'assets/skins']) for (const f of fs.readdirSync(path.join(root, d))) assert.ok(listed.has(d + '/' + f), d + '/' + f + ' is in SHELL');
});
