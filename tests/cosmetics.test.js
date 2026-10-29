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

const { loadCatalog, catalog, filterCatalog, entryOf, parseItem, resolveLoadout, cleanCos, loadItems, resetItems } = await import('../js/cosmetics.js');
const { LAYERS, LAYER_Z, CATEGORIES } = await import('../js/layers.js');
const { rigPlan, PART_NAMES } = await import('../js/puppet.js');
const { hasSkin, getSkin } = await import('../js/skins.js');
const { Inventory } = await import('../js/inventory.js');
const unlock = await import('../js/unlock.js');
const particles = await import('../js/particles.js');
const { validCos, validReveal } = await import('../js/logic.js');
const { drawFromMessage, drawViewPreview } = await import('../js/avatars.js');
const { statesToLandmarks } = await import('../js/puppet.js');
await loadCatalog();

const pts = statesToLandmarks({ thumb: true, index: true, middle: true, ring: true, pinky: true }).map(([x, y]) => ({ x: x / 4, y: y / 4 }));
const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };

// ---- the vocabulary and the shipped items -----------------------------------------------------------------------------------
test('layers, default z-order and categories', () => {
  assert.deepEqual(LAYERS, ['base', 'tone', 'tattoo', 'nails', 'ring', 'glove']);
  assert.ok(LAYER_Z.base < LAYER_Z.tone && LAYER_Z.tone < LAYER_Z.tattoo && LAYER_Z.tattoo < LAYER_Z.nails && LAYER_Z.nails < LAYER_Z.ring && LAYER_Z.ring < LAYER_Z.glove, 'gloves draw over rings, rings over nails');
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
test('layers are drawn on top of the base in z-order; a glove covers a ring, a ring covers nails', () => {
  const rec = resolveLoadout('cartoon', { glove: 'whiteglove', ring: 'goldring', nails: 'rednails', tattoo: 'tribal' });
  assert.deepEqual(rec.layers.map(l => l.layer), ['tattoo', 'nails', 'ring', 'glove']);
  const plan = rigPlan(pts, rec.skin, rec.layers);
  const base = rigPlan(pts, getSkin('cartoon')).length;
  assert.ok(plan.length > base, 'the layers add draw steps');
  const at = tag => plan.findIndex(s => s.part.endsWith('@' + tag));
  const last = tag => plan.map(s => s.part).map((p, i) => (p.endsWith('@' + tag) ? i : -1)).filter(i => i >= 0).pop();
  assert.ok(at('tribal') >= base, 'everything cosmetic comes after the whole base hand');
  assert.ok(last('tribal') < at('rednails') && last('rednails') < at('goldring') && last('goldring') < at('whiteglove'), 'whole passes in z-order');
  assert.ok(plan.slice(0, base).every(s => !s.part.includes('@')));
});

test('free stacking: odd combinations are not blocked, only ordered by z (a ring can sit OVER a glove)', () => {
  const ring = { ...entryOf('goldring') };
  const over = parseItem({ ...JSON.parse(read('assets/items/goldring.json')), id: 'ringontop', z: 90 });
  const under = parseItem({ ...JSON.parse(read('assets/items/goldring.json')), id: 'ringunder', z: 5 });
  const mk = it => ({ id: it.id, layer: it.layer, z: it.z, parts: it.parts });
  const sort = ls => [...ls].sort((a, z) => a.z - z.z);
  assert.deepEqual(sort([mk(over), { id: 'glove', z: 50 }, mk(under)]).map(x => x.id), ['ringunder', 'glove', 'ringontop']);
  assert.equal(ring.layer, 'ring');
  // and the default stack accepts every free combination without error
  for (const t of ['pale', 'tan', 'brown', 'deep']) for (const g of ['whiteglove', 'fingerless']) {
    const rec = resolveLoadout('paw', { tone: t, glove: g, ring: 'silverring', nails: 'rednails', tattoo: 'scar' });
    assert.ok(rigPlan(pts, rec.skin, rec.layers).length > 16);
  }
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

test('a skin tone recolours the base where it uses those colours, and leaves other hands and premade hands alone', () => {
  const fill = rec => rec.skin.parts.palm.shapes[0].fill;
  assert.equal(fill(resolveLoadout('cartoon', {})), '#f6c9a0');
  assert.notEqual(fill(resolveLoadout('cartoon', { tone: 'deep' })), '#f6c9a0');
  assert.equal(fill(resolveLoadout('robot', { tone: 'deep' })), fill(resolveLoadout('robot', {})), 'robot has no skin colours to change');
  assert.equal(fill(resolveLoadout('gauntlet', { tone: 'orc' })), fill(resolveLoadout('gauntlet', {})), 'a premade whole hand is finished: no tone');
});

test('unknown or wrongly-typed ids in a loadout are ignored, never thrown on', () => {
  assert.deepEqual(cleanCos({ ring: 'goldring', glove: 'ok', evil: 'x', tone: 5, nails: 'A B' }), { ring: 'goldring', glove: 'ok' });
  const rec = resolveLoadout('nonsense', { ring: 'nothere', glove: 'goldring' });   // goldring is not a glove
  assert.equal(rec.layers.length, 0);
  assert.ok(rec.skin);
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
  assert.deepEqual(filterCatalog(all, { category: 'animal', layer: 'glove' }), []);
  assert.equal(filterCatalog(all, { category: 'premade', layer: 'base' }).length, 2);
});

// ---- inventory ---------------------------------------------------------------------------------------------------------------------
test('inventory: free items are owned, locked ones are not, equipping needs ownership and fills one slot per layer', () => {
  const st = memStorage(), inv = new Inventory(st);
  assert.equal(inv.owns('goldring'), true); assert.equal(inv.owns('ruby'), false); assert.equal(inv.owns('nothere'), false);
  assert.equal(inv.equip('ruby'), false, 'locked: not equipped'); assert.deepEqual(inv.cos, {});
  assert.equal(inv.equip('goldring'), true); assert.equal(inv.cos.ring, 'goldring');
  assert.equal(inv.equip('silverring'), true); assert.equal(inv.cos.ring, 'silverring', 'one item per layer: the new one replaces the old');
  assert.equal(inv.equip('whiteglove'), true);
  assert.deepEqual(inv.loadout().cos, { ring: 'silverring', glove: 'whiteglove' });   // a ring AND a glove together: stacking is free
  assert.equal(inv.isEquipped('whiteglove'), true); assert.equal(inv.isEquipped('goldring'), false);
  assert.equal(inv.equip('paw'), true); assert.equal(inv.baseId, 'paw'); assert.equal(st.m.get('ff-puppet'), 'paw');
  assert.equal(inv.equip('dragon'), false, 'a locked hand cannot be worn');
  assert.equal(inv.unequip('ring'), true); assert.equal(inv.cos.ring, undefined); assert.equal(inv.unequip('ring'), false);
  assert.equal(inv.unequip('base'), true); assert.equal(inv.baseId, 'cartoon', 'the hand cannot be removed: back to the default');
  const lw = new Inventory(memStorage()).loadoutWith('goldring');
  assert.equal(lw.cos.ring, 'goldring', 'loadoutWith previews an item without equipping it');
});

test('inventory: grants and equipment persist, tolerate junk, and survive a storage that throws', () => {
  const st = memStorage();
  const a = new Inventory(st);
  assert.equal(a.grant('ruby'), true); a.equip('ruby');
  const again = new Inventory(st);
  assert.equal(again.owns('ruby'), true); assert.equal(again.cos.ring, 'ruby', 'owned and equipped after a reload');
  st.m.set('ff-owned', '{not json'); st.m.set('ff-cos', '[1,2]');
  const junk = new Inventory(st);
  assert.equal(junk.owns('ruby'), false); assert.deepEqual(junk.cos, {});
  st.m.set('ff-cos', JSON.stringify({ ring: 'ruby', glove: 'leather', tone: 'ghost' }));    // equipped but not owned / unknown: dropped
  const dropped = new Inventory(st);
  assert.deepEqual(dropped.cos, {});
  const broken = new Inventory({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  assert.equal(broken.equip('goldring'), true, 'still works in memory'); assert.equal(broken.cos.ring, 'goldring');
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
  assert.equal(inv.equip('dragon'), true);

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
test('cosmetics travel as item ids only, are validated, and are drawn from this phone\'s own copies', () => {
  assert.equal(validCos(undefined), true); assert.equal(validCos({}), true); assert.equal(validCos({ ring: 'goldring', glove: 'leather' }), true);
  for (const bad of [{ base: 'x' }, { ring: 'Gold' }, { ring: 'a'.repeat(13) }, { ring: 5 }, { ring: { d: 1 } }, ['ring'], 'ring', { ring: 'x', glove: 'x', tone: 'x', nails: 'x', tattoo: 'x', extra: 'x' }]) assert.equal(validCos(bad), false, JSON.stringify(bad));
  const m = { count: 3, noHand: false, view: 'puppet', skin: 'cartoon', hands: [{ thumb: true, index: true, middle: true, ring: false, pinky: false }], lm: null, ar: 1.3, photo: '' };
  assert.equal(validReveal({ ...m, cos: { ring: 'goldring' } }, false), true, 'drawn cosmetics are fine in a random match');
  assert.equal(validReveal({ ...m, cos: { ring: '<script>' } }, false), false);
  assert.equal(validReveal(m, false), true, 'an older phone sends no cos');
  const { ctx, calls } = fakeCtx();
  assert.doesNotThrow(() => drawFromMessage(ctx, 120, 120, { ...m, cos: { ring: 'goldring', glove: 'unknownitem' } }));
  assert.ok(calls.length > 10);
});

test('the profile preview draws the cosmetics too', () => {
  const rec = resolveLoadout('gauntlet', { ring: 'goldring' });
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
test('Store: menu entry, categorised grid with owned/locked state, filters, unlock (stub) and equip', async () => {
  await loadCatalog(); resetItems(); await loadCatalog();
  assert.ok($('storeBtn') && $('storeBack') && $('storeGrid') && $('storePreview'));
  $('storeBtn').onclick();
  assert.deepEqual(b.visible(), ['store']);
  const cards = () => $('storeGrid').children.filter(c => c.matches('.item-card'));
  await until(() => cards().length === catalog().length, 'one card per item');
  const card = id => cards().find(c => c.dataset.id === id);
  const act = id => card(id).children.find(c => c.dataset?.act);
  assert.equal(act('goldring').dataset.act, 'equip'); assert.equal(act('ruby').dataset.act, 'unlock');
  assert.match(act('ruby').textContent, /Buy.*demo/);
  // filters
  const chip = (box, v) => $(box).children.find(x => x.dataset.value === v);
  chip('storeCats', 'animal').onclick();
  assert.deepEqual(cards().map(c => c.dataset.id), filterCatalog(catalog(), { category: 'animal' }).map(e => e.id));
  chip('storeCats', 'all').onclick(); chip('storeLayers', 'ring').onclick();
  assert.deepEqual(cards().map(c => c.dataset.id), ['goldring', 'silverring', 'ruby']);
  // unlock (stub) then equip, and the loadout reaches the player's style and storage
  act('ruby').onclick();
  await until(() => act('ruby').dataset.act === 'equip', 'ruby unlocked by the stub');
  assert.match($('storeMsg').textContent, /Ruby ring unlocked/);
  act('ruby').onclick();
  assert.equal(globalThis.localStorage.getItem('ff-cos'), JSON.stringify({ ring: 'ruby' }));
  assert.equal(act('ruby').dataset.act, 'off'); assert.ok(card('ruby').classList.contains('eq'));
  assert.match($('storeLoadout').textContent, /Ruby ring/);
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('ff-owned')), ['ruby']);
  act('ruby').onclick();
  assert.equal(JSON.parse(globalThis.localStorage.getItem('ff-cos')).ring, undefined);
  chip('storeLayers', 'base').onclick();
  assert.equal(act('cartoon').disabled, true, 'the hand in use cannot be taken off');
  act('paw').onclick();
  assert.equal(globalThis.localStorage.getItem('ff-puppet'), 'paw');
  $('storeClear').onclick();
  $('storeBack').onclick();
  assert.deepEqual(b.visible(), ['menu']);
});

test('the service worker precaches every new module and every item and skin file, so the Store works offline', async () => {
  const { shellFiles } = await import('../tools/stamp.mjs');
  const listed = new Set(shellFiles());
  for (const f of ['js/layers.js', 'js/particles.js', 'js/cosmetics.js', 'js/inventory.js', 'js/unlock.js', 'assets/items/manifest.json', 'assets/skins/manifest.json']) assert.ok(listed.has(f), f);
  for (const d of ['assets/items', 'assets/skins']) for (const f of fs.readdirSync(path.join(root, d))) assert.ok(listed.has(d + '/' + f), d + '/' + f + ' is in SHELL');
});
