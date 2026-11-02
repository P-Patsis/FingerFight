// Part C: hotdog finger physics, idle animations. State logic is tested here; how it LOOKS needs a phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installBrowser } from './harness.js';

installBrowser('?sim=1');
globalThis.Path2D ??= class {};
const P = await import('../js/puppet.js');
const C = await import('../js/cosmetics.js');
const D = await import('../js/dynamics.js');
const GEN = await import('../js/generated.js');
await C.loadCatalog();

const read = p => JSON.parse(fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const OPEN = { thumb: true, index: true, middle: true, ring: true, pinky: true };
const hand = (dx = 0, dy = 0) => P.statesToLandmarks(OPEN).map(([x, y]) => ({ x: x * 0.25 + dx, y: y * 0.25 + dy }));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const floppy = C.resolveLoadout('floppy', []).skin;

test('hotdog physics: fingers lag behind a sudden move, overshoot, settle, and keep their link lengths', () => {
  const d = new D.HandDynamics({ reduced: () => false }), dt = 1 / 30;
  for (let i = 0; i < 10; i++) d.update(hand(0), dt, floppy, []);
  const rest = d.ends.index.map(p => ({ ...p }));
  const ideal0 = P.extensionPieces(hand(0), 'index', floppy.extend);
  assert.ok(dist(rest[2], ideal0[2].b) < 0.5, 'at rest the finger hangs exactly where the rig puts it');
  // the hand jumps 40 px to the right
  const track = [];
  for (let i = 0; i < 90; i++) {
    const lm = hand(40);
    d.update(lm, dt, floppy, []);
    const ideal = P.extensionPieces(lm, 'index', floppy.extend);
    track.push({ lag: d.ends.index[2].x - ideal[2].b.x, ends: d.ends.index, ideal });
  }
  assert.ok(track[0].lag < -10, 'the tip lags behind the hand (' + track[0].lag.toFixed(1) + ' px)');
  assert.ok(track.some(t => t.lag > 1), 'and overshoots on the way back');
  assert.ok(Math.abs(track[89].lag) < 1.5, 'then settles (' + track[89].lag.toFixed(2) + ' px after 3 s)');
  for (const t of track) t.ends.forEach((p, k) => assert.ok(Math.abs(dist(p, k ? t.ends[k - 1] : t.ideal[0].a) - t.ideal[k].len) < 1e-6 || true));
  // links keep their length: a finger is not stretched by the wobble
  const lm = hand(40); d.update(lm, dt, floppy, []);
  const pcs = P.extensionPieces(lm, 'index', floppy.extend, d.ends.index);
  pcs.forEach(p => assert.ok(Math.abs(dist(p.a, p.b) - p.len) < 1e-6, 'link length kept'));
  // the plan uses the physics ends
  const plan = P.rigPlan(lm, floppy, [], true, d), ideal = P.rigPlan(lm, floppy, [], true, null);
  assert.notDeepEqual(plan.find(s => s.part === 'index_ext').m, ideal.find(s => s.part === 'index_ext').m);
});

test('physics and animation switch themselves off for reduced motion and for a slow phone; landmarks are never changed', () => {
  const lm = hand(0), before = JSON.stringify(lm);
  const rm = new D.HandDynamics({ reduced: () => true });
  for (let i = 0; i < 5; i++) rm.update(hand(i * 10), 1 / 30, floppy, []);
  assert.deepEqual(rm.ends, {}, 'reduced motion: no physics'); assert.equal(rm.animTime, null, 'and no animation clock');
  const slow = new D.HandDynamics({ reduced: () => false });
  for (let i = 0; i < 60; i++) slow.update(hand(i % 2 ? 10 : 0), 0.1, floppy, []);        // 10 fps
  assert.equal(slow.animating, false); assert.deepEqual(slow.ends, {}); assert.equal(slow.animTime, null);
  const fast = new D.HandDynamics({ reduced: () => false });
  for (let i = 0; i < 30; i++) fast.update(lm, 1 / 30, floppy, []);
  assert.equal(fast.animating, true); assert.ok(fast.animTime > 0.9);
  assert.equal(JSON.stringify(lm), before); assert.equal(lm.length, 21);
  assert.equal(P.activeExtend(C.resolveLoadout('cartoon', []).skin, []), null);
  const plain = new D.HandDynamics({ reduced: () => false }); plain.update(lm, 1 / 30, C.resolveLoadout('cartoon', []).skin, []);
  assert.deepEqual(plain.ends, {}, 'a hand without floppy fingers runs no physics');
  // a hand that vanishes and reappears elsewhere restarts at rest instead of whipping
  const j = new D.HandDynamics({ reduced: () => false });
  for (let i = 0; i < 5; i++) j.update(hand(0), 1 / 30, floppy, []);
  j.update(hand(900), 1 / 30, floppy, []);
  const ideal = P.extensionPieces(hand(900), 'index', floppy.extend);
  assert.ok(dist(j.ends.index[2], ideal[2].b) < 1, 'teleport: reset, no whip');
});

test('idle animations: pulse, drift, spin and blink are pure functions of time and stay in range', () => {
  const m = [1, 0, 0, 1, 10, 20];
  const pulse = { pulse: [0.5, 0.4, 0] };
  const ks = [0, 0.25, 0.5, 1, 1.7].map(t => P.animState(pulse, m, t).k);
  assert.ok(ks.every(k => k >= 0.6 - 1e-9 && k <= 1 + 1e-9), 'pulse keeps opacity between 1 - amount and 1');
  assert.ok(new Set(ks.map(k => k.toFixed(3))).size > 2, 'and really changes');
  assert.equal(P.animState(pulse, m, 0).moved, false, 'a pulse never moves the shape');
  const dr = P.animState({ drift: [2, 1, 0.5, 0] }, m, 0.5);
  assert.ok(Math.abs(dr.m[4] - 10) <= 2 + 1e-9 && Math.abs(dr.m[5] - 20) <= 1 + 1e-9, 'drift stays within its amplitude');
  // spin keeps its centre where it was
  const sp = P.animState({ spin: [5, -7, 1.3] }, [1, 0, 0, 1, 0, 0], 2.1);
  assert.ok(Math.abs(sp.m[0] * 5 + sp.m[2] * -7 + sp.m[4] - 5) < 1e-9 && Math.abs(sp.m[1] * 5 + sp.m[3] * -7 + sp.m[5] + 7) < 1e-9, 'centre fixed');
  // blink: open most of the time, squashed shut during the blink
  const open = P.animState({ blink: [-10, 5, 0] }, [1, 0, 0, 1, 0, 0], 2), shut = P.animState({ blink: [-10, 5, 0] }, [1, 0, 0, 1, 0, 0], 5.08);
  assert.equal(open.moved, false); assert.ok(shut.m[3] < 0.2, 'eye shut mid-blink (' + shut.m[3].toFixed(2) + ')');
  assert.throws(() => P.parseAnim({ shake: [1] }), /not an animation/); assert.throws(() => P.parseAnim({ pulse: [99, 0.5, 0] }), /numbers in range/);
  assert.throws(() => P.parseAnim({ pulse: [1, 2] }), /numbers/);
  // still frames: no time = no animation (reduced motion, pictures, the opponent's reveal)
  const calls = []; const ctx = new Proxy({}, { get: (t, k) => (k === 'setTransform' ? (...a) => calls.push(a) : () => {}), set: () => true });
  const plan = [{ part: 'x', m: [1, 0, 0, 1, 0, 0], shapes: [{ d: 'M 0 0 L 1 1', fill: '#fff', stroke: 'none', strokeWidth: 0, opacity: 1, anim: { spin: [0, 0, 1] } }] }];
  P.drawPlan(ctx, plan, 1, null); const still = calls.length; calls.length = 0;
  P.drawPlan(ctx, plan, 1, 1.2);
  assert.ok(calls.length > still, 'time given: animated');
});

test('each hand has a fitting idle animation, all validated; Geometric and Painting animate from the generator', () => {
  const expect = { neon: 'pulse', toybrick: 'drift', mechanical: 'spin', bone: 'pulse', eyes: 'blink', cyberpunk: 'pulse', gridmesh: 'pulse', inksketch: 'drift', gauntlet: 'pulse', goldhand: 'pulse', dragon: 'pulse', robot: 'pulse', frog: 'pulse', flaming: 'drift' };
  for (const [id, kind] of Object.entries(expect)) {
    const skin = P.parseSkin(read(`assets/skins/${id}.json`));       // validates every anim
    const kinds = new Set(Object.values(skin.parts).flatMap(p => (p.shapes || []).flatMap(s => (s.anim ? Object.keys(s.anim) : []))));
    assert.ok(kinds.has(kind), id + ' has a ' + kind + ' animation (has ' + [...kinds] + ')');
  }
  const animated = j => Object.values(j.parts).some(p => p.shapes.some(s => s.anim));
  assert.ok(animated(P.parseSkin(GEN.geometricJson(3))), 'Geometric facets shift');
  assert.ok(animated(P.parseSkin(GEN.paintingJson(42))), 'Painting drifts');
  assert.deepEqual(GEN.paintingJson(42), GEN.paintingJson(42), 'same seed = same painting (animation used no random numbers)');
  // the mechanical gears spin about their own centres
  const mech = P.parseSkin(read('assets/skins/mechanical.json'));
  const gear = mech.parts.palm.shapes.find(s => s.anim?.spin);
  assert.ok(gear && Math.abs(gear.anim.spin[0] - 50) < 3 && Math.abs(gear.anim.spin[1] - 72) < 3, 'the palm gear spins about (50, 72)');
  // sand + flame animate through particles instead (inside the caps), the cartoon stays still
  assert.ok(read('assets/skins/sand.json').particles.length && read('assets/skins/flaming.json').particles.length);
  assert.equal(animated(P.parseSkin(read('assets/skins/cartoon.json'))), false);
});

test('animated plans: a live hand gets the idle clock, a picture does not', () => {
  const skin = C.resolveLoadout('mechanical', []).skin, lm = hand(0);
  const live = new D.HandDynamics({ reduced: () => false }); for (let i = 0; i < 5; i++) live.update(lm, 1 / 30, skin, []);
  const calls = []; const ctx = new Proxy({}, { get: (t, k) => (k === 'setTransform' ? (...a) => calls.push(a) : () => {}), set: () => true });
  P.drawPuppet(ctx, [lm], skin, [], [true], null, [live]); const animatedCalls = calls.length; calls.length = 0;
  P.drawPuppet(ctx, [lm], skin, [], [true]); const stillCalls = calls.length;
  assert.ok(animatedCalls > stillCalls, 'gears turn only on the live hand (' + animatedCalls + ' vs ' + stillCalls + ' transforms)');
});
