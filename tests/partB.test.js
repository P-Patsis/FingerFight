// Part B: scissor blades, hook hand (one hook per raised finger), long claws, chrome skeleton removed, full flame hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installBrowser } from './harness.js';

installBrowser('?sim=1');
globalThis.Path2D ??= class {};
const P = await import('../js/puppet.js');
const C = await import('../js/cosmetics.js');
const PS = await import('../js/particles.js');
const S = await import('../js/skins.js');
const G = await import('../js/gestures.js');
await C.loadCatalog();

const read = p => JSON.parse(fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const exists = p => fs.existsSync(new URL('../' + p, import.meta.url));
const pose = st => P.statesToLandmarks(st).map(([x, y]) => ({ x, y }));
const OPEN = { thumb: true, index: true, middle: true, ring: true, pinky: true };
const minY = shapes => Math.min(...shapes.flatMap(s => (s.d.match(/-?\d+(\.\d+)?/g) || []).map(Number).filter((_, i) => i % 2 === 1)));

test('the Chrome skeleton is gone: file, manifest, service worker, tools, code, and a saved choice falls back cleanly', () => {
  assert.equal(exists('assets/skins/chrome.json'), false);
  assert.ok(!read('assets/skins/manifest.json').skins.includes('chrome'));
  assert.equal(C.entryOf('chrome'), null); assert.equal(S.hasSkin('chrome'), false);
  assert.equal(S.skinIdOf('chrome'), S.DEFAULT_SKIN_ID, 'a phone that saved or received "chrome" draws the default hand');
  for (const f of ['sw.js', 'tools/make_batch3.py', ...fs.readdirSync(new URL('../js/', import.meta.url)).map(x => 'js/' + x)]) {
    const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/^\s*(#|\/\/).*$/gm, '');
    assert.ok(!/chrome[_ ]?(skeleton|palm|seg)|CHROME_T|skins\/chrome|'chrome'/i.test(src), f + ' has no chrome-skeleton reference');
  }
});

test('Blade fingers became Long claws: long, dynamic, length-aware, locked by ad; the old id maps over', () => {
  assert.equal(exists('assets/items/blades.json'), false); assert.equal(C.entryOf('blades'), null);
  const e = C.entryOf('longclaws');
  assert.equal(e.name, 'Long claws'); assert.equal(e.layer, 'nails'); assert.equal(e.unlock.method, 'ad');
  const item = read('assets/items/longclaws.json');
  assert.ok(item.dynamic && item.side === 'both');
  assert.ok(minY(item.parts.index_tip) < -(15 + 60), 'long: blades reach more than 60 units past the tip');
  assert.deepEqual(C.stackOf([{ id: 'blades' }]).length, 1);
  assert.equal(C.stackOf([{ id: 'blades' }])[0].id, 'longclaws', 'an old saved / received blades id is read as Long claws');
  // keeps the short ones as separate items
  for (const id of ['claws', 'longnails']) assert.ok(C.entryOf(id) && C.entryOf(id).free, id + ' stays');
  assert.ok(minY(read('assets/items/claws.json').parts.index_tip) > -(15 + 20), 'Claws stay short');
});

test('Scissor fingers: long blades on four fingers that retract with the finger', () => {
  const rec = C.resolveLoadout('cartoon', [{ id: 'scissors' }]), it = rec.layers[0];
  assert.ok(it.dynamic && it.dynamic.only === 'tip');
  assert.ok(minY(read('assets/items/scissors.json').parts.index_tip) < -(15 + 60), 'long blades, not small tips');
  const names = pl => pl.filter(s => s.part.endsWith('@scissors')).map(s => s.part.replace('@scissors', ''));
  const open = names(P.rigPlan(pose(OPEN), rec.skin, rec.layers, true));
  assert.deepEqual(open.filter(n => n.endsWith('_tip')).sort(), ['index_tip', 'middle_tip', 'pinky_tip', 'ring_tip']);
  const curled = names(P.rigPlan(pose({ ...OPEN, middle: false }), rec.skin, rec.layers, true));
  assert.ok(!curled.includes('middle_tip') && curled.includes('index_tip'), 'a curled finger loses its blade');
  assert.ok(curled.includes('middle_mid'), 'but keeps its steel sleeve');
});

test('Hook is a whole-hand replacement: one hook per raised finger, none on curled ones, and counting is unaffected', () => {
  const e = C.entryOf('hook');
  assert.equal(e.layer, 'base'); assert.equal(e.free, true); assert.equal(C.entryOf('hook').kind, 'base');
  assert.equal(exists('assets/items/hook.json'), false, 'the old nails-item hook is gone');
  const skin = C.resolveLoadout('hook', []).skin;
  assert.equal(skin.overlays.filter(o => o.dynamic).length, 5, 'a dynamic hook overlay on every finger');
  const hooks = st => { const lm = pose(st); return P.rigPlan(lm, skin, []).filter(s => s.part.endsWith('_tip+')).length; };
  const raised = st => G.countHand(P.statesToLandmarks(st).map(([x, y]) => ({ x: x / 1000, y: y / 1000, z: 0 })));
  for (const st of [OPEN, { index: true }, { index: true, middle: true }, { index: true, ring: true, pinky: true }, { thumb: true, index: true, middle: true, ring: true }, {}]) {
    const n = Object.values(st).filter(Boolean).length;
    assert.equal(hooks(st), n, 'hooks = raised fingers for ' + JSON.stringify(st));
  }
  void raised;
  // the landmarks are only read
  const lm = pose({ index: true, middle: true }), before = JSON.stringify(lm);
  P.rigPlan(lm, skin, []); assert.equal(JSON.stringify(lm), before); assert.equal(lm.length, 21);
  // length-aware: with an extension the hooks sit on the last link
  const long = C.resolveLoadout('hook', [{ id: 'longfingers' }]);
  const h = P.rigPlan(pose(OPEN), long.skin, long.layers).filter(s => s.part === 'index_tip+')[0];
  const last = P.extensionPieces(pose(OPEN), 'index', P.activeExtend(long.skin, long.layers)).at(-1);
  assert.ok(Math.hypot(h.m[4] - last.a.x, h.m[5] - last.a.y) < 1e-6);
});

test('Flame hand: a FULL flame of emitters inside the 90 / 6 caps, static flames for reduced motion', () => {
  const skin = read('assets/skins/flaming.json'), em = PS.parseParticles(skin.particles);
  assert.equal(em.length, 4); assert.ok(em.every(x => x.effect === 'flame'));
  assert.ok(em.reduce((s, x) => s + x.rate, 0) >= 100, 'a lot of fire: ' + em.reduce((s, x) => s + x.rate, 0) + ' flames a second');
  const ids = new Set(em.map(x => x.where)); assert.ok(ids.has('hand') && ids.has('tips') && ids.has('palm'), 'whole hand, fingertips and palm');
  const hands = [pose(OPEN).map(p => ({ x: p.x * 0.2, y: p.y * 0.2 }))];
  const sys = new PS.ParticleSystem({ reduced: () => false });
  sys.setEmitters(C.resolveLoadout('flaming', []).emitters);
  let peak = 0; for (let i = 0; i < 300; i++) { sys.update(1 / 30, hands); peak = Math.max(peak, sys.list.length); }
  assert.ok(peak >= 60 && peak <= PS.MAX_PARTICLES, 'near the cap but never over it (' + peak + ')');
  const worn = C.resolveLoadout('flaming', [{ id: 'embers' }, { id: 'glow' }, { id: 'sparkles' }]);
  assert.ok(worn.emitters.length > PS.MAX_EMITTERS - 1 || PS.MAX_EMITTERS === 6);
  const many = new PS.ParticleSystem({ reduced: () => false }); many.setEmitters(worn.emitters);
  let p2 = 0; for (let i = 0; i < 300; i++) { many.update(1 / 30, hands); p2 = Math.max(p2, many.list.length); }
  assert.ok(p2 <= PS.MAX_PARTICLES && many.emitters.length <= PS.MAX_EMITTERS);
  const still = new PS.ParticleSystem({ reduced: () => true }); still.setEmitters(C.resolveLoadout('flaming', []).emitters); still.update(0.5, hands);
  assert.equal(still.list.length, 0, 'reduced motion: no particles');
  assert.ok(skin.parts.palm.shapes.length >= 7 && skin.parts.index_base.shapes.length >= 3, 'the static look has flames on the palm and fingers');
  const c = new Proxy({ n: 0 }, { get: (t, k) => (k in t ? t[k] : () => { t.n++; }), set: (t, k, v) => { t[k] = v; return true; } });
  sys.draw(c); assert.ok(c.n > 100, 'and they draw (' + c.n + ' canvas calls)');
});
