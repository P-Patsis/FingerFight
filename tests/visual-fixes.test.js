import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser } from './harness.js';
import { makeHand, ALL, FAN } from './helpers.js';
installBrowser('?sim=1');
const P = await import('../js/puppet.js');
const C = await import('../js/cosmetics.js');
const S = await import('../js/sand.js');
const PS = await import('../js/particles.js');
await C.loadCatalog();
const px = h => h.map(p => ({ x: p.x * 640, y: p.y * 480 }));

test('frog and duck thumb webs stay outside the palm, mirror correctly and hide when tucked', () => {
  for (const id of ['frog', 'duck']) for (const mirror of [false, true]) {
    const lm = px(makeHand(ALL, FAN)).map(p => ({ ...p, x: mirror ? 640 - p.x : p.x }));
    const before = JSON.stringify(lm), web = C.resolveLoadout(id, []).skin.web;
    assert.equal(P.thumbWebOpen(lm), true);
    const thumb = P.webGeometry(lm, web).find(g => g.pair[0] === 'thumb');
    assert.ok(thumb, id + ': open thumb has a web');
    const w = lm[2], k = lm[5], cross = (x, y) => (k.x - w.x) * (y - w.y) - (k.y - w.y) * (x - w.x);
    const side = Math.sign(cross(lm[0].x, lm[0].y));
    const ns = thumb.fill.match(/-?\d+(?:\.\d+)?/g).map(Number);
    for (let i = 0; i < ns.length; i += 2) assert.ok(cross(ns[i], ns[i + 1]) * side < 2, 'all path points, including scallop control, outside palm');
    assert.equal(JSON.stringify(lm), before);
    const tucked = px(makeHand({ ...ALL, thumb: false }, FAN)).map(p => ({ ...p, x: mirror ? 640 - p.x : p.x }));
    assert.equal(P.thumbWebOpen(tucked), false);
    assert.equal(P.webGeometry(tucked, web).some(g => g.pair[0] === 'thumb'), false);
  }
});

test('burning bone retains clean bones and has whole-hand flame within emitter and particle caps', () => {
  const skin = C.resolveLoadout('burnbone', []).skin, bone = C.resolveLoadout('bone', []).skin;
  assert.deepEqual(skin.particles, C.resolveLoadout('flaming', []).skin.particles);
  for (const [part, def] of Object.entries(bone.parts)) {
    assert.deepEqual(skin.parts[part].shapes.slice(0, def.shapes.length), def.shapes);
    assert.ok(skin.parts[part].shapes.length > def.shapes.length, 'static flame on ' + part);
  }
  const ps = new PS.ParticleSystem({ reduced: () => false }); ps.setEmitters(skin.particles);
  let peak = 0; for (let i = 0; i < 300; i++) { ps.update(1 / 30, [px(makeHand(ALL, FAN))]); peak = Math.max(peak, ps.list.length); }
  assert.ok(peak >= 80 && peak <= 90); assert.ok(ps.emitters.length <= 6);
});

test('sand reserves room for 84 grains even when shed particles already fill the system; curved paths remain continuous', () => {
  const lm = px(makeHand(ALL, FAN)), skin = C.resolveLoadout('sand', []).skin;
  const ps = new PS.ParticleSystem({ reduced: () => false }); ps.setSand(skin.sand);
  ps.update(1 / 30, [lm]); ps.motions[0].c = 1;
  ps.list = Array.from({ length: 90 }, () => ({ age: 0, life: 10, x: 0, y: 0, vx: 0, vy: 0, g: 0 }));
  ps.update(1 / 30, [lm]); assert.equal(S.SAND.GRAINS, 84);
  assert.ok(ps.list.length + ps.swarmSize <= 90);
  const a = S.swarmGrains(lm, 0.6, 1), b = S.swarmGrains(lm, 0.601, 1.001);
  assert.ok(a.every((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y) < 2));
});
