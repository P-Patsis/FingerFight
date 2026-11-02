import test from 'node:test';
import assert from 'node:assert/strict';
import { hexToHsl, hslToHex, shiftColor, dominantHue } from '../js/layers.js';

test('hex <-> hsl round-trips', () => {
  for (const h of ['#ff0000', '#12ab9c', '#808080', '#f8fafc']) assert.equal(hslToHex(...Object.values(hexToHsl(h))).toLowerCase(), h);
});

test('hue-shift keeps lightness of a chromatic part and moves its hue to the picked one', () => {
  const part = '#3366cc', picked = '#cc3333', ref = hexToHsl(part).h;
  const out = hexToHsl(shiftColor(part, picked, ref));
  assert.ok(Math.abs(out.l - hexToHsl(part).l) < 0.03);
  assert.ok(Math.abs(out.h - hexToHsl(picked).h) < 4 || Math.abs(out.h - hexToHsl(picked).h) > 356);
});

test('hue-shift always gives a plain #rrggbb, for greys too', () => {
  for (const c of ['#808080', '#222222', '#ffffff', '#c9a227']) assert.match(shiftColor(c, '#22aa55', 120), /^#[0-9a-f]{6}$/);
});
