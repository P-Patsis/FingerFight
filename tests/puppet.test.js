// The puppet rig (pure math), the skin format checks, the skin registry and the opponent-view matrix.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installBrowser } from './harness.js';
import { makeHand, ALL } from './helpers.js';
import { parseSkin, rigPlan, drawPlan, drawPuppet, affineFrom3, segmentMatrix, statesToLandmarks, PART_NAMES, SEGMENTS, CHAIN } from '../js/puppet.js';
import { loadSkins, resetSkins, getSkin, skinIds, skinIdOf, hasSkin } from '../js/skins.js';
import { VIEWS, SAFE_VIEWS, viewsFor, normalizeView, isSafeView, safeViewOf, viewOf, validPicture, validReveal } from '../js/logic.js';

installBrowser('?');                                  // gives loadSkins a fetch that reads assets/skins from disk
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const skinFile = id => JSON.parse(fs.readFileSync(path.join(root, 'assets/skins', id + '.json'), 'utf8'));
const apply = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const px = (hand, w = 640, h = 480) => hand.map(p => ({ x: p.x * w, y: p.y * h }));

// ---------------------------------------------------------------------------------------------------------------------
test('every shipped skin file passes the format checks and has all 16 named parts', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/skins/manifest.json'), 'utf8'));
  assert.ok(manifest.skins.length >= 3, 'at least three built-in skins');
  assert.ok(manifest.skins.includes(manifest.default));
  for (const id of manifest.skins) {
    const skin = parseSkin(skinFile(id));
    assert.equal(skin.id, id);
    assert.deepEqual(Object.keys(skin.parts).sort(), [...PART_NAMES].sort());
  }
  assert.equal(PART_NAMES.length, 16);
  assert.deepEqual(fs.readdirSync(path.join(root, 'assets/skins')).filter(f => f !== 'manifest.json').map(f => f.replace('.json', '')).sort(), [...manifest.skins].sort(), 'every skin file is listed in the manifest, and vice versa');
});

test('the skin format is checked: what is missing or unsafe is refused with a message that says what', () => {
  const good = () => skinFile('cartoon');
  assert.throws(() => parseSkin(null), /not an object/);
  assert.throws(() => parseSkin({ ...good(), format: 2 }), /format/);
  assert.throws(() => parseSkin({ ...good(), id: 'Bad Id' }), /id/);
  const noPart = good(); delete noPart.parts.index_mid;
  assert.throws(() => parseSkin(noPart), /missing part index_mid/);
  const badLen = good(); badLen.parts.thumb_tip.length = 0;
  assert.throws(() => parseSkin(badLen), /thumb_tip\.length/);
  const url = good(); url.parts.palm.shapes[0].fill = 'url(#evil)';
  assert.throws(() => parseSkin(url), /colour/);
  const path_ = good(); path_.parts.palm.shapes[0].d = 'M 0 0 <script>';
  assert.throws(() => parseSkin(path_), /path data/);
  const flat = good(); flat.parts.palm.ref = { wrist: [0, 0], index: [10, 10], pinky: [20, 20] };
  assert.throws(() => parseSkin(flat), /line/);
  const overlay = good(); overlay.overlays = [{ part: 'elbow', shapes: [{ d: 'M 0 0 L 1 1' }] }];
  assert.throws(() => parseSkin(overlay), /unknown part/);
});

test('"use" lets a skin share one shape between parts (one finger drawn once)', () => {
  const j = skinFile('cartoon');
  const shared = { format: 1, id: 'shared', parts: { palm: j.parts.palm, index_base: j.parts.index_base } };
  for (const p of PART_NAMES) if (!shared.parts[p]) shared.parts[p] = { use: 'index_base' };
  const skin = parseSkin(shared);
  assert.equal(skin.parts.pinky_tip.length, j.parts.index_base.length);
  const loop = { ...shared, parts: { ...shared.parts, index_base: { use: 'pinky_tip' }, pinky_tip: { use: 'index_base' } } };
  assert.throws(() => parseSkin(loop), /missing part/, 'a loop of aliases is refused, not followed forever');
});

// ---------------------------------------------------------------------------------------------------------------------
test('rig: every segment starts on its first landmark and its tip lands exactly on its second landmark', () => {
  const skin = parseSkin(skinFile('cartoon'));
  const hand = px(makeHand(ALL));
  const plan = rigPlan(hand, skin);
  assert.equal(plan.length, 16, 'palm + 15 segments');
  for (const [name, [a, b]] of Object.entries(SEGMENTS)) {
    const step = plan.find(s => s.part === name);
    const L = skin.parts[name].length;
    const A = apply(step.m, 0, 0), B = apply(step.m, 0, -L);
    assert.ok(near(A.x, hand[a].x) && near(A.y, hand[a].y), name + ' pivot on landmark ' + a);
    assert.ok(near(B.x, hand[b].x) && near(B.y, hand[b].y), name + ' end on landmark ' + b);
  }
});

test('rig: the palm shape is pinned to wrist, index knuckle and pinky knuckle', () => {
  const skin = parseSkin(skinFile('robot'));
  const hand = px(makeHand(ALL));
  const palm = rigPlan(hand, skin).find(s => s.part === 'palm');
  const { ref } = skin.parts.palm;
  for (const [key, id] of [['wrist', 0], ['index', 5], ['pinky', 17]]) {
    const P = apply(palm.m, ref[key][0], ref[key][1]);
    assert.ok(near(P.x, hand[id].x, 1e-4) && near(P.y, hand[id].y, 1e-4), key);
  }
});

test('rig: a mirrored hand (the other hand, or the back camera) flips the palm instead of breaking it', () => {
  const skin = parseSkin(skinFile('cartoon'));
  const hand = makeHand(ALL);
  const flipped = hand.map(p => ({ x: 1 - p.x, y: p.y }));
  const det = m => m[0] * m[3] - m[1] * m[2];
  const a = rigPlan(px(hand), skin), b = rigPlan(px(flipped), skin);
  assert.ok(det(a.find(s => s.part === 'palm').m) * det(b.find(s => s.part === 'palm').m) < 0, 'opposite handedness');
  assert.equal(b.length, 16);
});

test('rig: finger thickness follows the size of the hand, length follows the landmarks', () => {
  const skin = parseSkin(skinFile('cartoon'));
  const small = rigPlan(px(makeHand(ALL), 100, 100), skin).find(s => s.part === 'index_base').m;
  const big = rigPlan(px(makeHand(ALL), 400, 400), skin).find(s => s.part === 'index_base').m;
  const width = m => Math.hypot(m[0], m[1]);
  assert.ok(near(width(big) / width(small), 4, 1e-6), 'four times the hand, four times the width');
});

test('rig: a hand that cannot be posed gives an empty plan instead of NaN matrices', () => {
  const skin = parseSkin(skinFile('cartoon'));
  assert.deepEqual(rigPlan([], skin), []);
  assert.deepEqual(rigPlan(Array.from({ length: 21 }, () => ({ x: 5, y: 5 })), skin), [], 'all points on one spot');
  const broken = px(makeHand(ALL)); broken[8] = { x: NaN, y: 3 };
  assert.deepEqual(rigPlan(broken, skin), []);
  assert.equal(segmentMatrix({ x: 1, y: 1 }, { x: 1, y: 1 }, 10, 1), null);
  assert.equal(affineFrom3([0, 0], [1, 1], [2, 2], { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }), null);
});

test('rig: overlays (rings, gloves, nail polish later) ride on their part; a skin can reorder its parts', () => {
  const j = skinFile('cartoon');
  j.overlays = [{ part: 'ring_base', shapes: [{ d: 'M -8 -10 L 8 -10', stroke: '#fbbf24', strokeWidth: 3 }] }];
  const plan = rigPlan(px(makeHand(ALL)), parseSkin(j));
  const i = plan.findIndex(s => s.part === 'ring_base');
  assert.equal(plan[i + 1].part, 'ring_base+');
  assert.deepEqual(plan[i + 1].m, plan[i].m, 'same transform as the part it decorates');
  j.order = ['pinky_tip', 'palm'];
  assert.deepEqual(rigPlan(px(makeHand(ALL)), parseSkin(j)).map(s => s.part).filter(p => !p.endsWith('+')), ['pinky_tip', 'palm']);
});

test('the canvas renderer sets a transform per part, fills and strokes with the skin colours, and restores the context', () => {
  class FakePath { constructor(d) { this.d = d; } }
  globalThis.Path2D = FakePath;
  const calls = [];
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => calls.push([k, ...a])), set: (t, k, v) => { t[k] = v; if (k === 'fillStyle' || k === 'strokeStyle') calls.push(['set:' + k, v]); return true; } });
  try {
    const skin = parseSkin(skinFile('cartoon'));
    drawPuppet(ctx, [px(makeHand(ALL))], skin);
    assert.equal(calls.filter(c => c[0] === 'setTransform').length, 16);
    assert.ok(calls.some(c => c[0] === 'fill') && calls.some(c => c[0] === 'stroke'));
    assert.ok(calls.some(c => c[0] === 'set:fillStyle' && c[1] === '#f6c9a0'));
    assert.equal(calls[0][0], 'save'); assert.equal(calls.at(-1)[0], 'restore');
    delete globalThis.Path2D;
    const before = calls.length;
    assert.doesNotThrow(() => drawPlan(ctx, rigPlan(px(makeHand(ALL)), skin)));
    assert.equal(calls.length, before, 'without Path2D nothing is drawn and nothing breaks');
  } finally { delete globalThis.Path2D; }
});

test('a pose from finger states: 21 points, raised fingers reach higher than curled ones, two hands side by side', () => {
  const all = { thumb: true, index: true, middle: true, ring: true, pinky: true };
  const none = { thumb: false, index: false, middle: false, ring: false, pinky: false };
  const up = statesToLandmarks(all), fist = statesToLandmarks(none);
  assert.equal(up.length, 21);
  for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb']) assert.ok(up[CHAIN[f][3]][1] < fist[CHAIN[f][3]][1] - 100, f + ' tip is higher when raised');
  for (const p of [...up, ...fist]) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const left = statesToLandmarks(all, 0), right = statesToLandmarks(all, 700, true);
  assert.ok(Math.min(...right.map(p => p[0])) > Math.max(...left.map(p => p[0])), 'the second hand sits right of the first');
  assert.ok(right[4][0] > right[20][0], 'mirrored: thumb on the right');
  // and the pose rigs cleanly with every shipped skin
  for (const id of ['cartoon', 'robot', 'neon']) assert.equal(rigPlan(up.map(([x, y]) => ({ x, y })), parseSkin(skinFile(id))).length, 16);
});

// ---------------------------------------------------------------------------------------------------------------------
test('skins load from the manifest, in order, with the default named; a broken skin is skipped, the rest still load', async () => {
  resetSkins();
  const files = new Map([['manifest.json', { default: 'robot', skins: ['cartoon', 'robot', 'neon', 'broken', 'liar', 'gone'] }],
    ['cartoon.json', skinFile('cartoon')], ['robot.json', skinFile('robot')], ['neon.json', skinFile('neon')],
    ['broken.json', { format: 1, id: 'broken', parts: {} }], ['liar.json', skinFile('neon')]]);
  const fetched = [];
  const fake = async url => { const name = url.replace('x/', ''); fetched.push(name); return files.has(name) ? { ok: true, status: 200, json: async () => files.get(name) } : { ok: false, status: 404, json: async () => { throw new Error('404'); } }; };
  const warn = console.warn; console.warn = () => {};
  try { assert.deepEqual(await loadSkins(fake, 'x/'), ['cartoon', 'robot', 'neon']); } finally { console.warn = warn; }
  assert.deepEqual(skinIds(), ['cartoon', 'robot', 'neon']);
  assert.equal(getSkin('neon').id, 'neon');
  assert.equal(getSkin('nonsense').id, 'robot', 'an unknown skin id (another phone has one this phone lacks) gives the manifest default');
  assert.equal(skinIdOf('neon'), 'neon'); assert.equal(skinIdOf('../x'), 'robot'); assert.equal(skinIdOf(undefined), 'robot');
  assert.equal(hasSkin('broken'), false); assert.equal(hasSkin('liar'), false);
  await loadSkins(fake, 'x/');
  assert.equal(fetched.filter(n => n === 'manifest.json').length, 1, 'loaded once');
  resetSkins();
});

test('with no manifest the built-in plain skin still draws, and the picker would be empty', async () => {
  resetSkins();
  const warn = console.warn; console.warn = () => {};
  try { assert.deepEqual(await loadSkins(async () => ({ ok: false, status: 404, json: async () => ({}) }), 'x/'), []); } finally { console.warn = warn; }
  assert.deepEqual(skinIds(), []);
  const plain = getSkin('cartoon');
  assert.equal(plain.id, 'plain');
  assert.equal(rigPlan(px(makeHand(ALL)), plain).length, 16);
  resetSkins();
  assert.deepEqual(await loadSkins(), ['cartoon', 'robot', 'neon', 'paw', 'dragon', 'gauntlet', 'goldhand'], 'and it recovers: the real files load afterwards');
});

// ---------------------------------------------------------------------------------------------------------------------
const hand = (up = true) => ({ thumb: up, index: up, middle: up, ring: up, pinky: up });
const pic = (over = {}) => ({ view: 'puppet', skin: 'cartoon', hands: [hand()], lm: null, ar: 1.333, photo: '', ...over });
const PHOTO = 'data:image/jpeg;base64,AAAA';

test('opponent view matrix: friends choose from four, strangers from two drawn ones and never a photo', () => {
  assert.deepEqual(VIEWS, ['skeleton', 'puppet', 'photo-skeleton', 'photo-puppet']);
  assert.deepEqual(viewsFor('private'), ['skeleton', 'puppet', 'photo-skeleton', 'photo-puppet']);
  assert.deepEqual(viewsFor('random'), ['skeleton', 'puppet']);
  assert.ok(viewsFor('random').every(v => !v.includes('photo')));
  assert.deepEqual(SAFE_VIEWS, viewsFor('random'));
  for (const gone of ['avatar', 'blur', 'photo']) assert.ok(!VIEWS.includes(gone), gone + ' is no longer an option');
});

test('random: the receiver refuses every photo and every photo view, whatever a modified client sends', () => {
  const reveal = o => ({ count: 3, gesture: null, noHand: false, ...pic(o) });
  for (const view of [...VIEWS, 'avatar', 'blur', 'photo']) {
    const safe = view === 'skeleton' || view === 'puppet' || view === 'avatar';
    assert.equal(validReveal(reveal({ view }), false), safe, 'no photo, view ' + view);
    assert.equal(validReveal(reveal({ view, photo: PHOTO }), false), false, 'with a photo, view ' + view);
  }
  assert.equal(validPicture(pic({ view: 'photo-puppet' }), false), false, 'the photo view is refused even with an empty photo');
});

test('private: all four options (and an older phone\'s views) are accepted, photos included', () => {
  for (const view of VIEWS) assert.equal(validPicture(pic({ view, photo: view.startsWith('photo-') ? PHOTO : '' }), true), true, view);
  for (const view of ['avatar', 'blur', 'photo']) assert.equal(validPicture(pic({ view, photo: view === 'avatar' ? '' : PHOTO }), true), true, 'older phone: ' + view);
  assert.equal(validPicture(pic({ view: 'hologram' }), true), false);
});

test('older saved or received views map to the nearest current one; strangers get the drawn twin of a photo choice', () => {
  assert.equal(viewOf('avatar'), 'puppet'); assert.equal(viewOf('blur'), 'photo-skeleton'); assert.equal(viewOf('photo'), 'photo-skeleton');
  assert.equal(viewOf(null), 'puppet'); assert.equal(viewOf('hologram'), 'puppet'); assert.equal(viewOf('skeleton'), 'skeleton');
  assert.equal(normalizeView('hologram'), null);
  assert.equal(safeViewOf('photo-puppet'), 'puppet'); assert.equal(safeViewOf('photo-skeleton'), 'skeleton');
  assert.equal(safeViewOf('puppet'), 'puppet'); assert.equal(safeViewOf('skeleton'), 'skeleton');
  assert.equal(isSafeView('puppet'), true); assert.equal(isSafeView('photo-puppet'), false); assert.equal(isSafeView('blur'), false);
});

// ---------------------------------------------------------------------------------------------------------------------
test('live camera view: puppet views draw the puppet from the same detection pass, others draw the skeleton; no second tracking pass', async () => {
  await loadSkins();
  const { HandCam } = await import('../js/hands.js');
  class FakePath { constructor(d) { this.d = d; } }
  globalThis.Path2D = FakePath;
  const run = async overlayView => {
    const video = installBrowser('?').byId.get('video'); video.videoWidth = 640; video.videoHeight = 480; video.readyState = 4; video.currentTime = 0;
    const log = [];
    const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => log.push(k)), set: (t, k, v) => { t[k] = v; return true; } });
    const cam = new HandCam(video, { width: 640, height: 480, getContext: () => ctx2d, classList: { toggle() {} } });
    let detections = 0;
    cam.landmarker = { detectForVideo() { detections++; return { landmarks: [makeHand(ALL)] }; } };
    cam.setOverlay(overlayView, 'neon');
    const frames = [];
    cam.onFrame = s => frames.push(s);
    let raf = 0; globalThis.requestAnimationFrame = f => { if (raf++ < 4) setTimeout(() => { video.currentTime += 0.1; f(); }, 1); };
    cam.run();
    while (frames.length < 3) await new Promise(r => setTimeout(r, 5));
    cam.running = false;
    return { transforms: log.filter(k => k === 'setTransform').length, frames: frames.length, detections };
  };
  try {
    const puppet = await run('puppet');
    assert.ok(puppet.transforms >= 16 * 3, 'the puppet (16 parts) is drawn every frame');
    assert.equal(puppet.detections, puppet.frames, 'one detection per frame: the puppet reuses the tracker\'s landmarks');
    const photoPuppet = await run('photo-puppet');
    assert.ok(photoPuppet.transforms >= 16 * 3, 'photo + puppet also shows the puppet on my own screen');
    assert.equal((await run('skeleton')).transforms, 0, 'skeleton views draw bones, not the puppet');
    assert.equal((await run('photo-skeleton')).transforms, 0);
  } finally { delete globalThis.Path2D; }
});

test('a saved skin choice is not lost while the skin files are still loading', async () => {
  resetSkins();
  assert.equal(skinIdOf('neon'), 'neon', 'before the load finishes a well-formed id is kept');
  assert.equal(skinIdOf('../x'), 'cartoon');
  await loadSkins();
  assert.equal(skinIdOf('neon'), 'neon');
  assert.equal(skinIdOf('retired'), 'cartoon', 'a skin that no longer exists falls back to the default');
});
