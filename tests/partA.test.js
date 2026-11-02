// Part A: stable + dynamic nails/claws, independent glove cards, length-aware items and webbing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installBrowser } from './harness.js';

installBrowser('?sim=1');
globalThis.Path2D ??= class {};
const P = await import('../js/puppet.js');
const C = await import('../js/cosmetics.js');
const D = await import('../js/dynamics.js');
const { Inventory } = await import('../js/inventory.js');
await C.loadCatalog();

const read = p => JSON.parse(fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const pose = st => P.statesToLandmarks(st).map(([x, y]) => ({ x, y }));
const OPEN = { thumb: true, index: true, middle: true, ring: true, pinky: true };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const memStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
const stepsOf = (plan, tag) => plan.filter(s => s.part.endsWith('@' + tag));
const scaleY = m => Math.hypot(m[2], m[3]);

test('finger stretch is read per finger from the landmarks, each finger independent', () => {
  const open = pose(OPEN), fist = pose({});
  for (const f of P.FINGER_NAMES) { assert.ok(P.fingerExtension(open, f) > 0.9, f + ' open'); assert.ok(P.fingerExtension(fist, f) < 0.1, f + ' curled'); }
  const mixed = pose({ ...OPEN, middle: false, pinky: false });
  const e = Object.fromEntries(P.FINGER_NAMES.map(f => [f, P.fingerExtension(mixed, f)]));
  assert.ok(e.index > 0.9 && e.ring > 0.9 && e.thumb > 0.9); assert.ok(e.middle < 0.1 && e.pinky < 0.1);
});

test('long nails and claws extend with a straight finger and retract / hide when it curls, per finger', () => {
  for (const id of ['longnails', 'claws']) {
    const rec = C.resolveLoadout('cartoon', [{ id }]), item = rec.layers[0];
    assert.ok(item.dynamic, id + ' is dynamic');
    const open = stepsOf(P.rigPlan(pose(OPEN), rec.skin, rec.layers, true), id);
    assert.equal(open.length, 5, id + ': a nail / claw on every straight finger');
    const part = n => rec.skin.parts[n];
    const base = P.rigPlan(pose(OPEN), rec.skin, rec.layers, true).find(s => s.part === 'index_tip').m;
    assert.deepEqual(open.find(s => s.part === 'index_tip@' + id).m, base, 'fully extended = the authored size');
    const mixed = stepsOf(P.rigPlan(pose({ ...OPEN, middle: false, ring: false }), rec.skin, rec.layers, true), id).map(s => s.part.split('_')[0]);
    assert.deepEqual(mixed.sort(), ['index', 'pinky', 'thumb'], id + ': curled middle and ring show nothing, the others stay');
    assert.equal(stepsOf(P.rigPlan(pose({}), rec.skin, rec.layers, true), id).length, 0, id + ': a fist hides them all');
    // half way: shorter than extended but still drawn (a dyn state with stretch 0.5)
    const half = stepsOf(P.rigPlan(pose(OPEN), rec.skin, rec.layers, true, { ext: { index: 0.5 } }), id).find(s => s.part.startsWith('index'));
    assert.ok(half && scaleY(half.m) < scaleY(base) && scaleY(half.m) > 0, id + ': partly curled = partly retracted');
    void part;
  }
});

test('flicker fix: the side that faces the camera and the "shown" flag change only after a steady run, not on one noisy frame', () => {
  const d = new D.HandDynamics({ reduced: () => false });
  assert.equal(d.stableBack(true), true);
  const seen = [];
  for (let i = 0; i < 40; i++) seen.push(d.stableBack(i % 2 ? false : true));               // label flickering every frame
  assert.ok(seen.every(x => x === true), 'alternating readings never flip it');
  d.stableBack(true);
  for (let i = 0; i < D.DYN.BACK_FRAMES - 1; i++) assert.equal(d.stableBack(false), true);
  assert.equal(d.stableBack(false), false, 'a sustained turn does flip it');
  // dynamic shown-flag: stretch jittering around the hide threshold does not toggle
  const lm = pose(OPEN), skin = C.resolveLoadout('cartoon', []).skin;
  d.update(lm, 0.033, skin, []);
  assert.equal(d.shown.index, true);
  let flips = 0, last = d.shown.index;
  for (let i = 0; i < 60; i++) { d.ext.index = 0.15 + (i % 2 ? 0.05 : -0.05); const was = d.shown.index; d.shown.index = was ? d.ext.index > D.DYN.SHOW_OFF : d.ext.index > D.DYN.SHOW_ON; if (d.shown.index !== last) flips++; last = d.shown.index; }
  assert.ok(flips <= 1, 'hysteresis: ' + flips + ' toggles');
  // the plan uses the shown flag, not the raw stretch: shown=true keeps a nail drawn at stretch 0.12
  const rec = C.resolveLoadout('cartoon', [{ id: 'claws' }]);
  assert.equal(stepsOf(P.rigPlan(lm, rec.skin, rec.layers, true, { ext: { index: 0.12 }, shown: { index: true } }), 'claws').some(s => s.part.startsWith('index')), true);
  assert.equal(stepsOf(P.rigPlan(lm, rec.skin, rec.layers, true, { ext: { index: 0.12 }, shown: { index: false } }), 'claws').some(s => s.part.startsWith('index')), false);
});

test('glove cards are independent: selecting one never changes another card\'s preview', () => {
  const inv = new Inventory(memStorage());
  const before = JSON.stringify(inv.loadoutWith('whiteglove'));
  inv.toggle('rubber'); inv.toggle('goldring');
  const after = inv.loadoutWith('whiteglove');
  assert.deepEqual(after.stack.map(s => s.id), ['whiteglove'], 'the White glove card shows the White glove alone');
  assert.equal(JSON.stringify(after), before.replace(/"base":"[a-z]+"/, '"base":"' + after.base + '"'), 'same as before leather / ring were worn');
  assert.deepEqual(inv.loadoutWith('rubber').stack.map(s => s.id), ['rubber'], 'and the worn one shows only itself too');
  assert.deepEqual(inv.stack.map(s => s.id), ['rubber', 'goldring'], 'and previewing wore nothing');
});

test('length-aware: with an extension, tip items ride the LAST link (nothing floats mid-finger), mid items fill the long finger', () => {
  const lm = pose(OPEN);
  const rec = C.resolveLoadout('floppy', [{ id: 'claws' }, { id: 'boxing' }]);
  const ext = P.activeExtend(rec.skin, rec.layers), pieces = P.extensionPieces(lm, 'index', ext);
  const plan = P.rigPlan(lm, rec.skin, rec.layers, true);
  const tipSteps = plan.filter(s => s.part === 'index_tip@claws');
  assert.equal(tipSteps.length, 1);
  const last = pieces[pieces.length - 1];
  assert.ok(Math.hypot(tipSteps[0].m[4] - last.a.x, tipSteps[0].m[5] - last.a.y) < 1e-6, 'the claw is mounted on the last link, not on the real fingertip');
  assert.ok(dist({ x: tipSteps[0].m[4], y: tipSteps[0].m[5] }, lm[8]) > dist(lm[7], lm[8]), 'well past the real tip');
  // a glove: its mid shapes appear on the real tip and on each inner link, its tip shapes only on the last link
  const gloveMid = plan.filter(s => s.part === 'index_mid@boxing').length, gloveTip = plan.filter(s => s.part === 'index_tip@boxing').length;
  assert.equal(gloveTip, 1); assert.equal(gloveMid, 1 + 1 + (pieces.length - 1), 'real mid + real tip + inner links');
  // without an extension everything is where it always was
  const plain = C.resolveLoadout('cartoon', [{ id: 'claws' }]);
  const m = P.rigPlan(lm, plain.skin, plain.layers, true).find(s => s.part === 'index_tip@claws').m;
  assert.ok(Math.hypot(m[4] - lm[7].x, m[5] - lm[7].y) < 1e-6, 'unextended: on the real tip segment');
  // skin overlays are length-aware too, and the longer-fingers item moves tip items the same way
  const lf = C.resolveLoadout('cartoon', [{ id: 'longfingers' }, { id: 'longnails' }]);
  const lfExt = P.extensionPieces(lm, 'middle', P.activeExtend(lf.skin, lf.layers)).at(-1);
  const nail = P.rigPlan(lm, lf.skin, lf.layers, true).find(s => s.part === 'middle_tip@longnails');
  assert.ok(Math.hypot(nail.m[4] - lfExt.a.x, nail.m[5] - lfExt.a.y) < 1e-6, 'long nails sit at the end of the longer finger');
});

test('webbing is bigger and follows extended fingers', () => {
  for (const id of ['frog', 'duck']) assert.ok(read(`assets/skins/${id}.json`).web.reach >= 0.9, id + ' reaches near the fingertips');
  const lm = pose(OPEN), skin = C.resolveLoadout('frog', []).skin;
  const far = g => { const n = g.edge.match(/-?\d+(\.\d+)?/g).map(Number); return Math.min(n[1], n[n.length - 1]); };   // smallest y = the free edge nearest the fingertips
  const plain = P.webGeometry(lm, skin.web)[1];
  const withExt = P.webGeometry(lm, skin.web, { len: 1, pieces: 2, droop: 0, fingers: P.FINGER_NAMES.slice() })[1];
  assert.ok(far(withExt) < far(plain) - 20, 'on a long finger the membrane reaches further out');
  // in a plan: the frog wearing longer fingers has a web whose edge is farther out than the frog alone
  const lf = C.resolveLoadout('frog', [{ id: 'longfingers' }]);
  const web = pl => pl.filter(s => s.part === 'web' && s.shapes[0].stroke !== 'none').map(s => s.shapes[0].d);
  assert.notDeepEqual(web(P.rigPlan(lm, lf.skin, lf.layers)), web(P.rigPlan(lm, skin, [])));
});
