// Skin content batch 1: eight base hands (lowpoly frog duck toybrick mechanical cyberpunk flaming floppy) and three nail items (longnails claws blades).
// Each one must load, validate (the same checks as network input), rig on the 16 parts, draw without error, stay inside sane bounds, and keep its particles inside the caps.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installBrowser } from './harness.js';

installBrowser('?sim=1');
globalThis.Path2D ??= class {};
const { parseSkin, rigPlan, drawPuppet, statesToLandmarks } = await import('../js/puppet.js');
const C = await import('../js/cosmetics.js');
const P = await import('../js/particles.js');
const S = await import('../js/skins.js');
const { Inventory } = await import('../js/inventory.js');
const { roleColor } = await import('../js/layers.js');
await C.loadCatalog();

const HANDS = { lowpoly: true, frog: true, duck: true, toybrick: true, mechanical: false, cyberpunk: false, flaming: false, floppy: true };   // id -> free
const NAILS = { longnails: true, claws: true, blades: false };
const read = p => JSON.parse(fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const lm = statesToLandmarks({ thumb: true, index: true, middle: true, ring: true, pinky: true }).map(([x, y]) => ({ x: x / 1000, y: y / 1000 }));
const ctx = () => new Proxy({ calls: 0 }, { get: (t, k) => (k in t ? t[k] : () => { t.calls++; }), set: (t, k, v) => { t[k] = v; return true; } });
const nums = d => (d.match(/-?\d+(\.\d+)?(e-?\d+)?/gi) || []).map(Number);
const shapesOf = x => Object.values(x.parts).flatMap(p => (Array.isArray(p) ? p : p.shapes || []));

test('every new base hand loads from the manifest, validates, rigs on all 16 parts and draws', () => {
  const manifest = read('assets/skins/manifest.json').skins;
  for (const [id, free] of Object.entries(HANDS)) {
    assert.ok(manifest.includes(id), id + ' is in the manifest');
    const skin = parseSkin(read(`assets/skins/${id}.json`));
    assert.equal(skin.id, id);
    assert.equal(rigPlan(lm, skin).filter(s => !/^(web|\w+_ext)/.test(s.part)).length, 16, id + ' rigs 16 parts (plus its web / extension steps, if it has them)');
    const c = ctx(); drawPuppet(c, [lm.map(p => ({ x: p.x * 200, y: p.y * 200 }))], skin); assert.ok(c.calls >= 16, id + ' draws (' + c.calls + ' calls)');
    const e = C.entryOf(id);
    assert.equal(e.layer, 'base'); assert.equal(e.free, free, id + (free ? ' is owned' : ' is locked'));
    if (!free) assert.equal(e.unlock.method, 'ad');
    assert.ok(S.skinIds().includes(id));
  }
});

test('every new hand and nail item is plain data: finite numbers in bounds, plain colours, no url() / CSS / code, at most 12 shapes per part', () => {
  const all = [...Object.keys(HANDS).map(id => read(`assets/skins/${id}.json`)), ...Object.keys(NAILS).map(id => read(`assets/items/${id}.json`))];
  for (const x of all) {
    const text = JSON.stringify(x);
    assert.ok(!/url\(|<|script|javascript|http|\bstyle\b|\bon[a-z]+=|expression/i.test(text.replace(/"license":"[^"]*"/, '')), x.id + ': nothing but plain data');
    const parts = Object.values(x.parts).map(p => (Array.isArray(p) ? p : p.shapes));
    for (const sh of parts) assert.ok(sh.length >= 1 && sh.length <= 12, x.id + ': 1-12 shapes');
    for (const sh of shapesOf(x)) {
      assert.match(sh.d, /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s-]+$/, x.id + ' path chars'); assert.ok(sh.d.length <= 4000);
      const n = nums(sh.d); assert.ok(n.length > 0 && n.every(Number.isFinite), x.id + ': finite numbers');
      assert.ok(n.every(v => Math.abs(v) <= 140), x.id + ': inside a sane box (' + Math.max(...n.map(Math.abs)) + ')');
      for (const k of ['fill', 'stroke']) if (sh[k] !== undefined) assert.match(sh[k], /^(none|#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8})$/, x.id + ' ' + k);
    }
    assert.ok(/^[a-z]{1,12}$/.test(x.id) && x.name.length <= 24);
  }
});

test('the flaming hand is animated by the existing emitters (embers + glow), inside the particle caps', () => {
  const skin = read('assets/skins/flaming.json');
  const em = P.parseParticles(skin.particles);
  assert.ok(em.length >= 2 && em.length <= 4 && em.length < P.MAX_EMITTERS);
  assert.ok(em.some(e => e.effect === 'embers') && em.some(e => e.effect === 'glow'), 'flame = rising embers + a glow');
  const sys = new P.ParticleSystem({ reduced: () => false });
  sys.setEmitters(C.resolveLoadout('flaming', []).emitters);
  const hands = [lm.map(p => ({ x: p.x * 200, y: p.y * 200 }))];
  let peak = 0; for (let i = 0; i < 600; i++) { sys.update(0.05, hands); peak = Math.max(peak, sys.list.length); }
  assert.ok(peak > 5, 'the flames really animate (' + peak + ' live particles)'); assert.ok(peak <= P.MAX_PARTICLES, 'and never exceed the cap (' + peak + ')');
  const worn = C.resolveLoadout('flaming', [{ id: 'embers' }, { id: 'glow' }, { id: 'electric' }, { id: 'bubbles' }]);
  const two = new P.ParticleSystem({ reduced: () => false }); two.setEmitters(worn.emitters);
  let peak2 = 0; for (let i = 0; i < 600; i++) { two.update(0.05, hands); peak2 = Math.max(peak2, two.list.length); }
  assert.ok(peak2 <= P.MAX_PARTICLES, 'with other effects on top the caps still hold (' + peak2 + ')');
  const off = new P.ParticleSystem({ reduced: () => true }); off.setEmitters(C.resolveLoadout('flaming', []).emitters); off.update(0.5, hands); assert.equal(off.list.length, 0, 'reduced motion: none');
});

test('the nail items sit in the Nail polish layer, reach past the fingertip, take the nail colour and stack with polish', () => {
  const manifest = read('assets/items/manifest.json').items;
  for (const [id, free] of Object.entries(NAILS)) {
    assert.ok(manifest.includes(id)); const e = C.entryOf(id);
    assert.equal(e.layer, 'nails'); assert.equal(e.free, free, id + (free ? ' is owned' : ' is locked')); assert.ok(e.tint, id + ' has a colour picker');
    const item = read(`assets/items/${id}.json`);
    assert.deepEqual(Object.keys(item.parts).sort(), ['index_tip', 'middle_tip', 'pinky_tip', 'ring_tip', 'thumb_tip']);
    const reach = Math.min(...nums(item.parts.index_tip.map(s => s.d).join(' ')).filter((v, i) => i % 2 === 1)) ;
    assert.ok(reach < -22, id + ' extends past the 15-unit index tip (reaches ' + reach + ')');
    const rec = C.resolveLoadout('cartoon', [{ id: 'nailpolish' }, { id }]);
    assert.deepEqual(rec.layers.map(l => l.id), ['nailpolish', id], 'stacks over polish');
    const picked = C.resolveLoadout('cartoon', [{ id, color: '#12ab34' }]).layers[0].parts.index_tip[0];
    assert.ok(picked.fill === '#12ab34' || picked.stroke === roleColor('#12ab34', 'dark') || JSON.stringify(picked).includes('#12ab34') || JSON.stringify(C.resolveLoadout('cartoon', [{ id, color: '#12ab34' }]).layers[0].parts.index_tip).includes('#12ab34'), id + ': the picked colour reaches the drawing');
    // drawn on the nail side only (nails are always back-side items)
    const skin = C.resolveLoadout('cartoon', [{ id }]);
    assert.ok(rigPlan(lm, skin.skin, skin.layers, true).length > 16, 'drawn with the back of the hand to the camera');
    if (id !== 'claws') assert.equal(rigPlan(lm, skin.skin, skin.layers, false).length, 16, 'not drawn on the palm side');      // claws show from either side
  }
  const inv = new Inventory({ getItem: () => null, setItem() {} });
  assert.equal(inv.toggle('longnails').ok, true); assert.equal(inv.toggle('claws').ok, true); assert.equal(inv.toggle('blades').ok, false, 'locked until unlocked');
});

test('hands with a tint recolour; the ones without are hue-shifted (design intact)', () => {
  const fillOf = (id, c) => JSON.stringify(C.resolveLoadout(id, [], c).skin.parts.palm.shapes);
  for (const id of ['lowpoly', 'frog', 'toybrick', 'cyberpunk', 'floppy']) { assert.ok(C.entryOf(id).tint, id); assert.ok(fillOf(id, '#12ab34') !== fillOf(id, null), id + ' recolours'); }
  for (const id of ['duck', 'mechanical', 'flaming']) { assert.equal(C.entryOf(id).tint, null, id); assert.notEqual(fillOf(id, '#12ab34'), fillOf(id, null), id + ' hue-shifts'); }
});
