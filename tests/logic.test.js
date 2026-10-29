import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, resolveRound, applyResult, pointerFor, normalizeSettings, describe, other, DEFAULTS } from '../js/logic.js';

const R = o => resolveRound({ pointer: 'host', count: 4, guess: 4, noHand: false, ...o });

test('pointer alternates, host first', () => {
  assert.deepEqual([1, 2, 3, 4].map(pointerFor), ['host', 'guest', 'host', 'guest']);
});

test('correct guess hits the pointer for 1', () => {
  assert.deepEqual(R({}), { target: 'host', damage: 1, reason: 'correct' });
  assert.equal(R({ pointer: 'guest' }).target, 'guest');
});

test('wrong guess, no gesture: a miss', () => {
  assert.deepEqual(R({ guess: 3 }), { target: null, damage: 0, reason: 'miss' });
  assert.equal(R({ guess: null }).reason, 'noguess', 'no hand seen: no guess, still no damage');
});

test('gestures never score: a rude gesture with a wrong guess is just a miss', () => {
  for (const gesture of ['middle', 'moutza', 'sideways']) {
    assert.deepEqual(R({ guess: 3, gesture }), { target: null, damage: 0, reason: 'miss' });
    assert.equal(R({ pointer: 'guest', guess: 3, gesture }).target, null);
  }
});

test('a right guess scores exactly 1, whatever the gesture', () => {
  assert.deepEqual(R({ guess: 4, gesture: 'sideways' }), { target: 'host', damage: 1, reason: 'correct' });
});

test('a closed fist is a real 0 and can be guessed', () => {
  assert.deepEqual(R({ count: 0, guess: 0 }), { target: 'host', damage: 1, reason: 'correct' });
  assert.equal(R({ count: 0, guess: 1 }).target, null);
});

test('no hand at all: no guess scores nothing, and no answer scores nothing', () => {
  assert.deepEqual(R({ guess: null }), { target: null, damage: 0, reason: 'noguess' });
  assert.equal(R({ guess: undefined }).damage, 0);
  assert.deepEqual(R({ noHand: true, guess: 0 }), { target: null, damage: 0, reason: 'nohand' });
  assert.equal(R({ noHand: true, guess: 9 }).target, null);
});

test('a game plays to the end', () => {
  let g = newGame({ hits: 3 });
  assert.deepEqual(g.health, { host: 3, guest: 3 });
  g = applyResult(g, R({}));                       // guest hits host
  assert.equal(g.health.host, 2); assert.equal(g.over, false);
  g = applyResult(g, R({ guess: 3, gesture: 'middle' }));   // wrong guess: nobody is hurt
  assert.deepEqual(g.health, { host: 2, guest: 3 });
  g = applyResult(g, R({ pointer: 'guest' }));     // host hits guest: 3 -> 2
  g = applyResult(g, R({ pointer: 'guest' }));     // 2 -> 1
  g = applyResult(g, R({ pointer: 'guest' }));     // 1 -> 0
  assert.equal(g.health.guest, 0); assert.equal(g.over, true); assert.equal(g.winner, 'host');
});

test('health never goes below zero', () => {
  const g = applyResult(newGame({ hits: 1 }), R({ pointer: 'guest', guess: 4 }));
  assert.equal(g.health.guest, 0); assert.equal(g.winner, 'host');
});

test('settings are cleaned', () => {
  assert.deepEqual(normalizeSettings({}), DEFAULTS);
  const s = normalizeSettings({ seconds: '99', hits: 0, background: 9 });
  assert.deepEqual(s, { seconds: 20, hits: 1, maxFingers: 10, background: 4, shrink: false });
  assert.equal(normalizeSettings({ seconds: 'abc' }).seconds, 5);
});

test('result text is from the viewer\'s side', () => {
  const hit = R({});
  assert.equal(describe(hit, 'host', 'guest'), 'You guessed it!');
  assert.equal(describe(hit, 'host', 'host'), 'They guessed it!');
  assert.equal(other('host'), 'guest');
});

import { sanitizeName, validGuess, validReveal, validPhoto, validGuessMsg, validPicture, validHands, validLandmarks, VIEWS, SAFE_VIEWS } from '../js/logic.js';

const hand = (over = {}) => ({ thumb: false, index: true, middle: false, ring: false, pinky: false, ...over });
const lm = () => [Array.from({ length: 21 }, (_, i) => [i * 10, 1000 - i * 10])];
const pic = (over = {}) => ({ view: 'puppet', skin: 'cartoon', hands: [hand()], lm: null, ar: 1.333, photo: '', ...over });

test('names are cleaned: any language, symbols and emoji stay; markup, invisible tricks and pile-ups go', () => {
  assert.equal(sanitizeName('  Alex  '), 'Alex');
  assert.equal(sanitizeName('<img src=x>'), 'img src=x', 'angle brackets (markup) are removed');
  assert.equal(sanitizeName(''), 'Fighter');
  assert.equal(sanitizeName(null), 'Fighter');
  for (const n of ['Μαρία', '李小龙', 'محمد', 'José', 'Zoë', 'Ольга', '$*Cool*$', 'Pano_99', "O'Neil", '😀🔥', '👨‍👩‍👧', '🇬🇷 Pano']) assert.equal(sanitizeName(n), n, n);
  assert.equal(sanitizeName('a'.repeat(40)).length, 12);
  assert.equal(sanitizeName('😀'.repeat(20)), '😀'.repeat(12), 'the limit counts visible characters: an emoji is one');
  assert.equal(sanitizeName('a\u202eb\u200bc\u0007d'), 'abcd', 'right-to-left override, zero-width and control characters are dropped');
  assert.equal(sanitizeName('Z' + '\u0300'.repeat(30)), 'Z\u0300\u0300', 'stacked combining marks are limited');
  assert.equal(sanitizeName('a    b\tc'), 'a b c');
});

test('guesses are checked', () => {
  for (const g of [null, 0, 5, 10]) assert.ok(validGuess(g), String(g));
  for (const g of [-1, 11, 2.5, '5', undefined, NaN, {}]) assert.ok(!validGuess(g), String(g));
});

test('finger data and landmarks are checked', () => {
  assert.ok(validHands([]) && validHands([hand(), hand({ thumb: true })]));
  assert.ok(!validHands([hand(), hand(), hand()]), 'three hands');
  assert.ok(!validHands([{ thumb: 1, index: true, middle: false, ring: false, pinky: false }]), 'not booleans');
  assert.ok(!validHands([{ index: true }]), 'missing fingers');
  assert.ok(!validHands([{ ...hand(), extra: true }]), 'extra keys');
  assert.ok(!validHands('x') && !validHands(null));
  assert.ok(validLandmarks(null) && validLandmarks(lm()));
  assert.ok(!validLandmarks([[[1, 2]]]), 'wrong point count');
  assert.ok(!validLandmarks([lm()[0].map(() => [1001, 5])]), 'out of range');
  assert.ok(!validLandmarks([lm()[0].map(() => [1.5, 5])]), 'not integers');
  assert.ok(!validLandmarks([lm()[0], lm()[0], lm()[0]]), 'three hands');
});

test('pictures: cartoon and skeleton views never need a photo; photos only where allowed', () => {
  assert.ok(validPicture(pic(), true) && validPicture(pic(), false));
  assert.ok(validPicture(pic({ view: 'skeleton', lm: lm() }), false));
  const photo = 'data:image/jpeg;base64,AAAA';
  assert.ok(validPicture(pic({ view: 'photo', photo }), true), 'friends may send photos');
  assert.ok(!validPicture(pic({ view: 'photo', photo }), false), 'a random opponent may not');
  assert.ok(!validPicture(pic({ view: 'puppet', photo }), false), 'not even tucked into a puppet message');
  assert.ok(!validPicture(pic({ view: 'blur', photo: '' }), false), 'photo-based views are refused outright');
  assert.ok(!validPicture(pic({ view: 'gif' }), true));
  assert.ok(!validPicture(pic({ skin: '../../x' }), true));
  assert.ok(!validPicture(pic({ ar: 0 }), true) && !validPicture(pic({ ar: '1' }), true));
  assert.ok(!validPicture(pic({ photo: 'http://evil.example/x.jpg' }), true), 'only inline jpeg photos');
  assert.ok(!validPicture(pic({ photo: 'data:image/svg+xml;base64,AAAA' }), true), 'no svg');
  assert.ok(!validPicture(pic({ photo: 'data:image/jpeg;base64,' + 'A'.repeat(150_000) }), true), 'too big');
  assert.ok(!validPicture(null, true));
  assert.deepEqual(SAFE_VIEWS.filter(v => !VIEWS.includes(v)), []);
});

test('reveals from the network are checked', () => {
  const ok = { count: 4, gesture: null, noHand: false, ...pic() };
  assert.ok(validReveal(ok) && validReveal(ok, false));
  assert.ok(validReveal({ ...ok, gesture: 'middle' }));
  assert.ok(!validReveal({ ...ok, count: 11 }) && !validReveal({ ...ok, count: 3.5 }) && !validReveal({ ...ok, count: '4' }));
  assert.ok(!validReveal({ ...ok, gesture: 'rude' }) && validReveal({ ...ok, gesture: undefined }), 'a missing gesture is fine; an unknown one is not');
  assert.ok(!validReveal({ ...ok, noHand: 'no' }));
  assert.ok(!validReveal({ ...ok, view: 'photo', photo: 'data:image/jpeg;base64,AAAA' }, false), 'photo reveal refused in a random match');
  assert.ok(!validReveal(null) && !validReveal('x'));
});

test('guess messages are checked', () => {
  assert.ok(validGuessMsg({ guess: 4, ...pic() }) && validGuessMsg({ guess: null, ...pic() }));
  assert.ok(!validGuessMsg({ guess: 11, ...pic() }) && !validGuessMsg({ guess: '4', ...pic() }));
  assert.ok(!validGuessMsg({ guess: 4 }), 'picture fields are required');
  assert.ok(!validGuessMsg({ guess: 4, ...pic({ view: 'photo', photo: 'data:image/jpeg;base64,AAAA' }) }, false));
  assert.ok(!validGuessMsg(null));
  assert.ok(validPhoto('') && !validPhoto(5) && !validPhoto('data:text/html;base64,AAAA'));
});

test('max fingers is a clamped setting (default 10, 5 = one hand)', () => {
  assert.equal(DEFAULTS.maxFingers, 10);
  assert.equal(normalizeSettings({ maxFingers: 5 }).maxFingers, 5);
  assert.equal(normalizeSettings({ maxFingers: 0 }).maxFingers, 1);
  assert.equal(normalizeSettings({ maxFingers: 99 }).maxFingers, 10);
  assert.equal(normalizeSettings({ maxFingers: 'x' }).maxFingers, 10);
});
