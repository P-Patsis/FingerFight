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

test('Profile top block is ONE sticky stack in order: camera preview, Choose your Hand, colour picker, category chips; only the item cards come after', () => {
  const order = ['modePicker', 'stickyTop', 'previewZone', 'viewPreviewBox', 'liveBox', 'cWearTop', 'skinRow', 'cCat', 'profileLayers', 'custArea', 'profileGrid'].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  const top = html.slice(html.lastIndexOf('<div', at('stickyTop')), at('custArea'));
  for (const id of ['previewZone', 'skinRow', 'cCat', 'profileLayers']) assert.ok(top.includes('id="' + id + '"'), id + ' is inside the sticky block');
  assert.ok(!top.includes('id="profileGrid"'), 'the item cards scroll under it, they are not part of it');
  assert.ok(!html.includes('id="wearPhoto"'), 'no standalone Photo toggle');
});

test('Done (camera off) is a small button INSIDE the preview zone (top-right corner), not a full-width bar', () => {
  const zone = html.slice(html.lastIndexOf('<div', at('previewZone')), at('skinRow'));
  assert.ok(zone.includes('id="custDone"'), 'custDone lives in the preview window');
  const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.done-x[^}]*position:\s*absolute/s); assert.match(css, /\.done-x[^}]*top:/s); assert.match(css, /\.done-x[^}]*right:/s);
});

test('the player name is a label and its input on ONE row', () => {
  const i = html.indexOf('namerow'); assert.ok(i > 0, 'a namerow');
  const row = html.slice(html.lastIndexOf('<', i), html.indexOf('</label>', i) + 8);
  assert.ok(row.includes('id="nameInput"') && /Player name|Name/i.test(row), 'label and input share the row element');
  assert.ok(!/>\s*PLAYER\s*</.test(html), 'no PLAYER header');
});

test('every item group and Choose your Hand is a horizontally scrolling row (no vertical wall of cards)', () => {
  const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  for (const id of ['skinPicker', 'profileLayers', 'profileGrid']) {
    const tag = html.slice(html.lastIndexOf('<', at(id)), html.indexOf('>', at(id)));
    assert.match(tag, /\bhrow\b|items-row/, id + ' is a scrolling row');
  }
  assert.match(css, /\.hrow[^}]*overflow-x:\s*auto/s); assert.match(css, /\.hrow[^}]*flex-wrap:\s*nowrap/s);
});
