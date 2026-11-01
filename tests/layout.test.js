// Profile layout order (the HTML is the layout): flag on one row, preview above Customise above Choose your Hand above the customise controls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const at = id => { const i = html.indexOf('id="' + id + '"'); assert.ok(i > 0, id); return i; };

test('country flag: label, inline input + flag icon and the toggle are ONE row (one .set element, no separate field row)', () => {
  const row = html.slice(html.lastIndexOf('<div', at('flagBtn')), html.indexOf('</div>', at('flagBtn')) + 6);
  for (const id of ['countryInput', 'countryHint', 'flagBtn', 'countryRow']) assert.ok(row.includes('id="' + id + '"'), id + ' is in the same row');
  assert.match(row, /Show country flag/); assert.match(row, /class="set flagrow"/);
  assert.ok(!/<label[^>]*id="countryRow"/.test(html), 'no full-width label row any more');
});

test('opponent-view panel order: view choice, preview / camera window, Customise button, Choose your Hand, customise controls', () => {
  const order = ['modePicker', 'previewZone', 'viewPreviewBox', 'cWearTop', 'custBtn', 'skinRow', 'custArea', 'profileLayers', 'profileGrid'].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(!html.includes('id="wearPhoto"'), 'no standalone Photo toggle');
});
