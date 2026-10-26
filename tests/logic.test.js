import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, resolveRound, applyResult, pointerFor, normalizeSettings, describe, other, DEFAULTS } from '../js/logic.js';

const R = o => resolveRound({ pointer: 'host', count: 4, guess: 4, gesture: null, noHand: false, crits: true, ...o });

test('pointer alternates, host first', () => {
  assert.deepEqual([1, 2, 3, 4].map(pointerFor), ['host', 'guest', 'host', 'guest']);
});

test('correct guess hits the pointer for 1', () => {
  assert.deepEqual(R({}), { target: 'host', damage: 1, crit: false, reason: 'correct' });
  assert.equal(R({ pointer: 'guest' }).target, 'guest');
});

test('wrong guess, no gesture: a miss', () => {
  assert.deepEqual(R({ guess: 3 }), { target: null, damage: 0, crit: false, reason: 'miss' });
  assert.equal(R({ guess: null }).reason, 'miss', 'no guess counts as wrong');
});

test('wrong guess + gesture: pointer lands a critical on the guesser', () => {
  assert.deepEqual(R({ guess: 3, gesture: 'middle' }), { target: 'guest', damage: 2, crit: true, reason: 'crit' });
  assert.equal(R({ guess: 3, gesture: 'moutza' }).damage, 2);
  assert.equal(R({ guess: 3, gesture: 'sideways' }).damage, 3);
  assert.equal(R({ pointer: 'guest', guess: 3, gesture: 'middle' }).target, 'host');
});

test('right guess beats the gesture', () => {
  assert.equal(R({ guess: 4, gesture: 'sideways' }).reason, 'correct');
});

test('gestures do nothing when crits are off', () => {
  assert.equal(R({ guess: 3, gesture: 'sideways', crits: false }).reason, 'miss');
});

test('hiding the hand forfeits the round', () => {
  assert.deepEqual(R({ noHand: true, guess: 9 }), { target: 'host', damage: 1, crit: false, reason: 'nohand' });
});

test('a game plays to the end', () => {
  let g = newGame({ hits: 3 });
  assert.deepEqual(g.health, { host: 3, guest: 3 });
  g = applyResult(g, R({}));                       // guest hits host
  assert.equal(g.health.host, 2); assert.equal(g.over, false);
  g = applyResult(g, R({ guess: 3, gesture: 'middle' }));   // host crit on guest: 3 -> 1
  assert.equal(g.health.guest, 1);
  g = applyResult(g, R({ pointer: 'guest' }));     // host hits guest: 1 -> 0
  assert.equal(g.health.guest, 0); assert.equal(g.over, true); assert.equal(g.winner, 'host');
});

test('health never goes below zero', () => {
  const g = applyResult(newGame({ hits: 1 }), R({ guess: 0, gesture: 'sideways' }));
  assert.equal(g.health.guest, 0); assert.equal(g.winner, 'host');
});

test('settings are cleaned', () => {
  assert.deepEqual(normalizeSettings({}), DEFAULTS);
  const s = normalizeSettings({ seconds: '99', hits: 0, crits: 0, background: 9 });
  assert.deepEqual(s, { seconds: 20, hits: 1, crits: false, background: 4 });
  assert.equal(normalizeSettings({ seconds: 'abc' }).seconds, 5);
});

test('result text is from the viewer\'s side', () => {
  const hit = R({});
  assert.equal(describe(hit, 'host', 'guest'), 'You guessed it!');
  assert.equal(describe(hit, 'host', 'host'), 'They guessed it!');
  assert.equal(other('host'), 'guest');
});

import { sanitizeName, validGuess, validReveal, validPhoto, validGuessMsg } from '../js/logic.js';

test('names are cleaned', () => {
  assert.equal(sanitizeName('  Alex  '), 'Alex');
  assert.equal(sanitizeName('<img src=x onerror=alert(1)>'), 'img srcx one');   // markup characters removed, 12 chars max
  assert.equal(sanitizeName(''), 'Fighter');
  assert.equal(sanitizeName(null), 'Fighter');
  assert.equal(sanitizeName('Μαρία'), 'Μαρία', 'non-Latin letters are fine');
  assert.equal(sanitizeName('a'.repeat(40)).length, 12);
});

test('guesses from the network are checked', () => {
  for (const g of [null, 0, 5, 10]) assert.ok(validGuess(g), String(g));
  for (const g of [-1, 11, 2.5, '5', undefined, NaN, {}]) assert.ok(!validGuess(g), String(g));
});

test('reveals from the network are checked', () => {
  const ok = { count: 4, gesture: null, noHand: false, photo: '' };
  assert.ok(validReveal(ok));
  assert.ok(validReveal({ ...ok, gesture: 'middle', photo: 'data:image/jpeg;base64,AAAA' }));
  assert.ok(!validReveal({ ...ok, count: 11 }));
  assert.ok(!validReveal({ ...ok, count: 3.5 }));
  assert.ok(!validReveal({ ...ok, count: '4' }));
  assert.ok(!validReveal({ ...ok, gesture: 'rude' }));
  assert.ok(!validReveal({ ...ok, gesture: undefined }));
  assert.ok(!validReveal({ ...ok, noHand: 'no' }));
  assert.ok(!validReveal({ ...ok, photo: 'http://evil.example/x.jpg' }), 'only inline jpeg photos');
  assert.ok(!validReveal({ ...ok, photo: 'data:image/svg+xml;base64,AAAA' }), 'no svg');
  assert.ok(!validReveal({ ...ok, photo: 'data:image/jpeg;base64,' + 'A'.repeat(150_000) }), 'too big');
  assert.ok(!validReveal(null));
  assert.ok(!validReveal('x'));
});

test('guess messages (the guesser shows fingers too) are checked', () => {
  assert.ok(validGuessMsg({ guess: 4, photo: '' }));
  assert.ok(validGuessMsg({ guess: null, photo: 'data:image/jpeg;base64,AAAA' }));
  assert.ok(!validGuessMsg({ guess: 11, photo: '' }));
  assert.ok(!validGuessMsg({ guess: 4 }), 'photo is required (may be empty)');
  assert.ok(!validGuessMsg({ guess: 4, photo: 'https://evil.example/a.jpg' }));
  assert.ok(!validGuessMsg({ guess: '4', photo: '' }));
  assert.ok(!validGuessMsg(null));
  assert.ok(validPhoto('') && !validPhoto(5) && !validPhoto('data:text/html;base64,AAAA'));
});
