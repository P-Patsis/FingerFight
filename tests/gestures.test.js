import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHand, ALL, FAN, FLAT } from './helpers.js';
import { countHand, countHands, classify, classifyHands, fingerStates } from '../js/gestures.js';

const ASPECTS = [1, 0.75, 1.333];   // square, portrait 3:4, landscape 4:3

test('counts fingers', () => {
  for (const a of ASPECTS) {
    assert.equal(countHand(makeHand({}), a), 0, 'fist');
    assert.equal(countHand(makeHand({ index: true }), a), 1);
    assert.equal(countHand(makeHand({ index: true, middle: true }, { index: -8, middle: 8 }), a), 2, 'peace');
    assert.equal(countHand(makeHand({ thumb: true, index: true }), a), 2);
    assert.equal(countHand(makeHand({ thumb: true, index: true, middle: true, ring: true }), a), 4);
    assert.equal(countHand(makeHand(ALL, FAN), a), 5, 'open hand');
  }
});

test('finger states name the right fingers', () => {
  const s = fingerStates(makeHand({ middle: true, thumb: true }));
  assert.deepEqual(s, { thumb: true, index: false, middle: true, ring: false, pinky: false });
});

test('two hands add up, capped at 10', () => {
  const open = makeHand(ALL, FAN);
  assert.equal(countHands([open, makeHand({ index: true, middle: true })]), 7);
  assert.equal(countHands([open, open]), 10);
  assert.equal(countHands([]), 0);
});

test('middle finger', () => {
  for (const a of ASPECTS) {
    assert.equal(classify(makeHand({ middle: true }), a), 'middle');
    assert.equal(classify(makeHand({ middle: true, thumb: true }), a), 'middle', 'thumb is ignored');
  }
});

test('moutza = open hand, fingers fanned wide', () => {
  for (const a of ASPECTS) assert.equal(classify(makeHand(ALL, FAN), a), 'moutza', 'aspect ' + a);
});

test('five fingers held together is NOT moutza', () => {
  for (const a of ASPECTS) assert.equal(classify(makeHand(ALL, FLAT), a), null, 'aspect ' + a);
});

test('middle finger sideways (90 degrees) with the others up', () => {
  const up = { thumb: true, index: true, middle: true, ring: true, pinky: true };
  for (const a of ASPECTS) {
    const c = classify(makeHand(up, { index: 0, middle: 90, ring: 0, pinky: 0 }), a);
    assert.equal(c, 'sideways', 'aspect ' + a);
  }
});

test('ordinary poses are not gestures', () => {
  for (const a of ASPECTS) {
    assert.equal(classify(makeHand({}), a), null, 'fist');
    assert.equal(classify(makeHand({ index: true }), a), null, 'pointing');
    assert.equal(classify(makeHand({ index: true, middle: true }, { index: -8, middle: 8 }), a), null, 'peace');
    assert.equal(classify(makeHand({ thumb: true }), a), null, 'thumbs up');
    assert.equal(classify(makeHand({ index: true, middle: true, ring: true }), a), null, 'three');
  }
});

test('strongest gesture wins across two hands', () => {
  const mid = makeHand({ middle: true }), open = makeHand(ALL, FAN), fist = makeHand({});
  assert.equal(classifyHands([fist, mid]), 'middle');
  assert.equal(classifyHands([mid, open]), 'moutza');
  assert.equal(classifyHands([fist]), null);
});
