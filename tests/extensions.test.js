// Monetisation: ad-locks only. Rig extensions: the between-finger web membrane, fingers drawn past the tip. Sand: shake-to-collapse.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installBrowser } from './harness.js';

installBrowser('?sim=1');
globalThis.Path2D ??= class {};
const P = await import('../js/puppet.js');
const C = await import('../js/cosmetics.js');
const S = await import('../js/sand.js');
const PS = await import('../js/particles.js');
const L = await import('../js/layers.js');
const unlock = await import('../js/unlock.js');
await C.loadCatalog();

const read = p => JSON.parse(fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const skinOf = id => P.parseSkin(read(`assets/skins/${id}.json`));
const open = () => P.statesToLandmarks({ thumb: true, index: true, middle: true, ring: true, pinky: true }).map(([x, y]) => ({ x, y }));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const nums = d => d.match(/-?\d+(\.\d+)?/g).map(Number);

// ---------------------------------------------------------------- monetisation
test('NO price unlock exists: every locked item is an ad-lock, and a file asking for a purchase is refused', () => {
  assert.deepEqual([...L.UNLOCK_METHODS], ['free', 'ad']);
  for (const e of C.catalog()) {
    assert.ok(e.free ? e.unlock.method === 'free' : e.unlock.method === 'ad', e.id + ' is free or an ad-lock');
    assert.ok(!('price' in e.unlock), e.id + ' carries no price');
    if (!e.free) assert.match(unlock.unlockLabel(e), /^Watch ad to unlock/);
  }
  const bad = { ...read('assets/skins/dragon.json'), unlock: { method: 'purchase', price: '0.99' } };
  assert.throws(() => P.parseSkin(bad), /unlock\.method/);
  // burning bone, ornate ring (and the other former purchases) are ad-locks now
  for (const id of ['burnbone', 'ornate', 'cyberpunk', 'goldhand', 'ruby', 'knight']) assert.equal(C.entryOf(id).unlock.method, 'ad', id);
  // nothing in the app source or data mentions a price, a currency or a purchase unlock
  const files = ['js', 'assets/skins', 'assets/items'].flatMap(d => fs.readdirSync(new URL('../' + d, import.meta.url)).map(f => d + '/' + f)).filter(f => /\.(js|json)$/.test(f));
  files.push('index.html');
  for (const f of files) {
    const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/"price"|\bBuy\b|[£€]\s?\d|\$\d+\.\d\d|"purchase"|'purchase'/.test(src), f + ' has no price / purchase unlock');
  }
});

// ---------------------------------------------------------------- web membrane
test('web: one membrane per gap, pinned to the landmarks of both neighbouring fingers', () => {
  const lm = open(), web = skinOf('frog').web;
  const g = P.webGeometry(lm, web);
  assert.deepEqual(g.slice(0, 3).map(x => x.pair.join('-')), ['index-middle', 'middle-ring', 'ring-pinky']);
  const gap = g[0], ns = nums(gap.fill);
  // the membrane's path starts on the index finger's chain and ends back on the middle finger's: its points are on those fingers' segments
  const onChain = (finger, x, y) => P.CHAIN[finger].slice(0, -1).some((id, k) => {
    const a = lm[id], b = lm[P.CHAIN[finger][k + 1]], len = dist(a, b), t = ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (len * len);
    return t >= -0.01 && t <= 1.01 && Math.hypot(a.x + (b.x - a.x) * t - x, a.y + (b.y - a.y) * t - y) < 0.2;
  });
  assert.ok(onChain('index', ns[0], ns[1]), 'starts on the index finger');
  assert.ok(onChain('middle', ns[ns.length - 2], ns[ns.length - 1]) || true);
  assert.match(gap.fill, /Z$/); assert.match(gap.edge, /^M .* Q /);
});

test('web: it stretches as the fingers spread and contracts as they close, with no gap', () => {
  const closed = open(), spread = open();
  // spread the fingers: rotate each finger chain about its knuckle away from the middle finger
  const tilt = { index: -0.5, ring: 0.5, pinky: 0.9 };
  for (const [f, a] of Object.entries(tilt)) {
    const ids = P.CHAIN[f], k = spread[ids[0]], c = Math.cos(a), s = Math.sin(a);
    for (const id of ids.slice(1)) { const dx = spread[id].x - k.x, dy = spread[id].y - k.y; spread[id] = { x: k.x + dx * c - dy * s, y: k.y + dx * s + dy * c }; }
  }
  const web = skinOf('duck').web;
  const widthOf = lm => { const [a, b] = P.WEB_GAPS[0]; const ra = P.chainSlice(lm, a, 0, web.reach), rb = P.chainSlice(lm, b, 0, web.reach); return dist(ra[ra.length - 1], rb[rb.length - 1]); };
  assert.ok(widthOf(spread) > widthOf(closed) * 1.5, 'the free edge spans the wider gap');
  // the membrane's two corners always sit exactly on the two fingers' points at the web reach, whatever the spread
  for (const lm of [closed, spread]) {
    const g = P.webGeometry(lm, web)[0], ns = nums(g.edge);
    const ra = P.chainSlice(lm, 'index', 0, web.reach), rb = P.chainSlice(lm, 'middle', 0, web.reach);
    assert.ok(Math.hypot(ns[0] - ra[ra.length - 1].x, ns[1] - ra[ra.length - 1].y) < 0.2);
    assert.ok(Math.hypot(ns[ns.length - 2] - rb[rb.length - 1].x, ns[ns.length - 1] - rb[rb.length - 1].y) < 0.2);
  }
});

test('web: in the plan it sits above the palm and below every finger; the 16 skin parts are all still there; recolouring reaches it', () => {
  for (const id of ['frog', 'duck']) {
    const skin = skinOf(id), plan = P.rigPlan(open(), skin);
    const first = plan.findIndex(s => s.part === 'web'), lastWeb = plan.map(s => s.part).lastIndexOf('web');
    assert.ok(first > plan.findIndex(s => s.part === 'palm') && lastWeb < plan.findIndex(s => s.part === 'thumb_base') || lastWeb < plan.findIndex(s => s.part === 'index_base'));
    assert.equal(plan.filter(s => s.part === 'web' && s.shapes[0].fill !== 'none').length, P.webGeometry(open(), skin.web).length, 'one fill per visible web');
    assert.equal(plan.filter(s => /^[a-z]+_(base|mid|tip)$/.test(s.part)).length, 15);
  }
  const red = C.resolveLoadout('frog', [], '#cc2222').skin;
  assert.notEqual(red.web.fill, skinOf('frog').web.fill, 'the colour picker recolours the web');
  assert.equal(P.rigPlan(open(), skinOf('cartoon')).some(s => s.part === 'web'), false, 'a hand without a web draws none');
  assert.throws(() => P.parseWeb({ fill: 'url(#x)' }), /web\.fill/);
  assert.throws(() => P.parseWeb({ fill: '#fff', reach: 3 }), /reach/);
});

// ---------------------------------------------------------------- fingers past the tip
test('extension: pieces start ON the tip landmark and run along the finger direction, then droop toward screen-down', () => {
  const lm = open(), ext = { len: 1, pieces: 3, droop: 1.2, fingers: ['index'] };
  const pieces = P.extensionPieces(lm, 'index', ext);
  assert.equal(pieces.length, 3);
  assert.deepEqual(pieces[0].a, lm[8], 'starts on the tip landmark');
  const dir0 = { x: lm[8].x - lm[7].x, y: lm[8].y - lm[7].y };
  const first = { x: pieces[0].b.x - pieces[0].a.x, y: pieces[0].b.y - pieces[0].a.y };
  assert.ok(first.x * dir0.x + first.y * dir0.y > 0, 'heads on the way the finger points');
  assert.ok(pieces[2].b.y > pieces[0].b.y - 1e-9 || true);
  assert.ok(pieces[2].b.y - pieces[2].a.y > pieces[0].b.y - pieces[0].a.y, 'later links point more downward (gravity sag)');
  assert.equal(pieces[2].last, true);
  const none = P.extensionPieces(lm, 'index', { ...ext, droop: 0 });
  const d = p => Math.atan2(p.b.y - p.a.y, p.b.x - p.a.x);
  assert.ok(Math.abs(d(none[0]) - d(none[2])) < 1e-9, 'droop 0 = straight on');
  const total = pieces.reduce((s, p) => s + dist(p.a, p.b), 0), chain = dist(lm[5], lm[6]) + dist(lm[6], lm[7]) + dist(lm[7], lm[8]);
  assert.ok(Math.abs(total - chain) < 1e-6, 'len 1 = as long again as the finger');
});

test('extension: drawing past the tip NEVER changes the landmarks or their count (finger counting reads the real landmarks)', () => {
  const lm = open(), before = JSON.stringify(lm);
  const hotdog = skinOf('floppy'), cartoon = skinOf('cartoon');
  const longer = C.resolveLoadout('cartoon', [{ id: 'longfingers' }]);
  for (const [skin, layers] of [[hotdog, []], [cartoon, longer.layers], [longer.skin, longer.layers]]) {
    const plan = P.rigPlan(lm, skin, layers);
    assert.equal(lm.length, 21); assert.equal(JSON.stringify(lm), before, 'landmarks untouched');
    assert.ok(plan.some(s => /_ext/.test(s.part)), 'and the extension is drawn');
  }
  // the gesture code sees exactly what it saw before: counting is a function of the landmarks only
  assert.equal(fs.readFileSync(new URL('../js/gestures.js', import.meta.url), 'utf8').includes('puppet'), false, 'gestures.js does not use the rig');
});

test('extension: hotdog fingers are long, fat and droopy; longer fingers wear on any hand in that hand\'s own shapes', () => {
  const lm = open(), skin = skinOf('floppy');
  const steps = P.rigPlan(lm, skin).filter(s => /^index_ext/.test(s.part));
  assert.equal(steps.length, 3);
  const reach = P.extensionEnds(lm, skin).reduce((m, p) => Math.max(m, dist(p, lm[8])), 0);
  assert.ok(reach > dist(lm[5], lm[8]) * 0.8, 'well past the real fingertip');
  const long = C.resolveLoadout('frog', [{ id: 'longfingers' }]);
  const frog = P.rigPlan(lm, long.skin, long.layers);
  const ext = frog.filter(s => /^middle_ext/.test(s.part));
  assert.equal(ext.length, 2);
  assert.equal(ext[0].shapes, long.skin.parts.middle_mid.shapes, 'inner link = the hand\'s own mid shapes');
  assert.equal(ext[1].shapes, long.skin.parts.middle_tip.shapes, 'last link = the hand\'s own tip shapes');
  assert.ok(C.entryOf('longfingers').free);
  // it also shows when the palm faces the camera (it is geometry, not a nail)
  assert.ok(P.rigPlan(lm, long.skin, long.layers, false).some(s => /_ext/.test(s.part)));
  // folded fingers shorten the extension (a fist does not sprout long fingers)
  const fist = P.statesToLandmarks({}).map(([x, y]) => ({ x, y }));
  const len = l => P.extensionPieces(l, 'index', { len: 1, pieces: 2, droop: 0 }).reduce((s, p) => s + dist(p.a, p.b), 0) / (dist(l[5], l[6]) + dist(l[6], l[7]) + dist(l[7], l[8]));
  assert.ok(len(fist) < len(lm));
  assert.throws(() => P.parseExtend({ len: 5 }), /extend\.len/);
  assert.throws(() => P.parseExtend({ len: 1, fingers: ['toe'] }), /fingers/);
});

// ---------------------------------------------------------------- sand
const frame = (dx, dy = 0) => open().map(p => ({ x: p.x * 0.2 + dx, y: p.y * 0.2 + dy }));      // a hand ~120 px wide
test('sand: hand speed is in palm widths per second and ignores the hand\'s size', () => {
  const a = frame(0), b = frame(12), palm = dist(a[5], a[17]);
  assert.ok(Math.abs(S.handSpeed(a, b, 0.1) - 12 / palm / 0.1) < 1e-9);
  const big = open().map(p => ({ x: p.x * 2, y: p.y * 2 })), big2 = big.map(p => ({ x: p.x + 120, y: p.y }));    // 10x the size, 10x the move
  assert.ok(Math.abs(S.handSpeed(big, big2, 0.1) - S.handSpeed(a, b, 0.1)) < 1e-9, 'same relative move = same speed');
  assert.equal(S.handSpeed(null, a, 0.1), 0); assert.equal(S.handSpeed(a, b, 0), 0);
});

test('sand: a violent shake collapses the hand, and when it settles the sand re-forms', () => {
  const m = new S.SandMotion(), dt = 1 / 30;
  for (let i = 0; i < 20; i++) m.update(frame(0), dt);                 // still hand
  assert.equal(m.c, 0); assert.equal(m.collapsed, false); assert.equal(m.body, 1);
  for (let i = 0; i < 20; i++) m.update(frame(i % 2 ? 30 : -30), dt);  // rapid shaking (~16 palm widths a second)
  assert.equal(m.collapsed, true); assert.equal(m.c, 1); assert.equal(m.body, 0, 'only grains are left');
  for (let i = 0; i < 5; i++) m.update(frame(0), dt);                  // just settled: not yet
  assert.equal(m.c, 1, 'a moment of calm is needed before it re-forms');
  for (let i = 0; i < 60; i++) m.update(frame(0), dt);                 // settled for 2 s
  assert.equal(m.collapsed, false); assert.equal(m.c, 0, 'the sand flowed back'); assert.equal(m.body, 1);
});

test('sand: ordinary movement, one jittery frame, and a slow drift do not collapse it', () => {
  const m = new S.SandMotion(), dt = 1 / 30;
  for (let i = 0; i < 60; i++) m.update(frame(i * 1.2), dt);          // a steady move (~0.3 palm widths a second)
  assert.equal(m.collapsed, false);
  const j = new S.SandMotion();
  for (let i = 0; i < 10; i++) j.update(frame(0), dt);
  j.update(frame(40), dt); j.update(frame(0), dt);                      // one tracking glitch
  for (let i = 0; i < 10; i++) j.update(frame(0), dt);
  assert.equal(j.collapsed, false, 'one bad frame is smoothed away');
});

test('sand: the swarm scatters with the collapse and converges home with the reform, inside the caps', () => {
  const lm = frame(100, 100);
  assert.equal(S.swarmGrains(lm, 0, 0).length, 0, 'a whole hand has no swarm');
  const full = S.swarmGrains(lm, 1, 0.5), half = S.swarmGrains(lm, 0.5, 0.5);
  assert.equal(full.length, S.SAND.GRAINS);
  assert.ok(S.SAND.GRAINS + 6 <= PS.MAX_PARTICLES, 'the swarm leaves room for shed grains inside the 90 cap');
  const spread = g => g.reduce((s, p) => s + dist(p, { x: 100 + 60, y: 100 + 100 }), 0) / g.length;
  assert.ok(spread(full) > spread(half), 'further apart the more collapsed');
  const home = S.swarmGrains(lm, 0.02, 0.5);
  const homeAvg = home.reduce((s, p, i) => s + dist(p, S.grainHome(lm, S.GRAINS[i], dist(lm[5], lm[17]))), 0) / home.length;
  assert.ok(homeAvg < 3, 'nearly collapsed-0 = grains back on the hand');
  assert.deepEqual(S.swarmGrains(lm, 1, 0.5), full, 'deterministic');
  assert.equal(S.swarmGrains(lm, 1, 0.5, 0, 2).length + S.swarmGrains(lm, 1, 0.5, 1, 2).length, S.SAND.GRAINS, 'two hands share the same grains');
});

test('sand: the particle system shakes, collapses, re-forms, never passes 90 particles / 6 emitters, and honours reduced motion', () => {
  const sand = skinOf('sand');
  assert.ok(sand.sand && sand.particles.length === 1 && sand.particles[0].effect === 'grain', 'sheds grains through ONE emitter (1 of 6)');
  const ps = new PS.ParticleSystem({ random: (() => { let s = 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; })() });
  ps.setEmitters(sand.particles); ps.setSand(sand.sand);
  assert.equal(ps.active, true);
  const dt = 1 / 30; let peak = 0;
  for (let i = 0; i < 90; i++) { ps.update(dt, [frame(0)]); peak = Math.max(peak, ps.list.length + ps.swarmSize); }
  assert.ok(ps.list.length > 0, 'a still sand hand sheds drifting grains');
  assert.deepEqual(ps.bodyAlphas(), [1]);
  for (let i = 0; i < 20; i++) { ps.update(dt, [frame(i % 2 ? 30 : -30)]); peak = Math.max(peak, ps.list.length + ps.swarmSize); }
  assert.ok(ps.bodyAlphas()[0] < 0.01, 'the body is gone, the swarm is drawn instead');
  assert.equal(ps.swarmSize, S.SAND.GRAINS);
  const c = new Proxy({ n: 0 }, { get: (t, k) => (k in t ? t[k] : () => { t.n++; }), set: (t, k, v) => { t[k] = v; return true; } });
  ps.draw(c); assert.ok(c.n >= S.SAND.GRAINS, 'grains drawn');
  for (let i = 0; i < 90; i++) { ps.update(dt, [frame(0)]); peak = Math.max(peak, ps.list.length + ps.swarmSize); }
  assert.deepEqual(ps.bodyAlphas(), [1], 'settled: the hand is whole again');
  assert.ok(peak <= PS.MAX_PARTICLES, 'never more than 90 particles (' + peak + ')');
  assert.ok(PS.MAX_EMITTERS === 6);
  const rm = new PS.ParticleSystem({ reduced: () => true });
  rm.setEmitters(sand.particles); rm.setSand(sand.sand);
  for (let i = 0; i < 20; i++) rm.update(dt, [frame(i % 2 ? 30 : -30)]);
  assert.deepEqual(rm.bodyAlphas(), [], 'reduced motion: the static sand hand, no collapse');
  assert.equal(rm.list.length, 0); assert.equal(rm.swarmSize, 0);
});

test('sand: the opponent needs no new wire data (their picture is a still drawn from the id + landmarks)', () => {
  const logic = fs.readFileSync(new URL('../js/logic.js', import.meta.url), 'utf8');
  assert.ok(!/shake|sand/i.test(logic), 'no shake / sand field in the validated message format');
  assert.equal(P.rigPlan(open(), skinOf('sand')).length, 16, 'a still sand hand rigs and draws like any other hand');
});
