// Profile layout order (the HTML is the layout): flag on one row, preview above Customise above Choose your Hand above the customise controls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const at = id => { const i = html.indexOf('id="' + id + '"'); assert.ok(i > 0, id); return i; };

test('name + country flag share ONE row, label over input: Name on the left, a compact flag block (label, flag, toggle, input) on the right', () => {
  const row = html.slice(html.lastIndexOf('<div', at('countryHint') - 200) , html.indexOf('<p id="nameNote"'));
  assert.match(row, /class="idrow"/);
  for (const id of ['nameInput', 'countryInput', 'countryHint', 'flagBtn', 'countryRow']) assert.ok(row.includes('id="' + id + '"'), id + ' is in the one row');
  assert.match(row, /<span class="lab">Name<\/span>/); assert.match(row, /<span class="lab">Country flag<\/span>/); assert.match(row, /placeholder="type a name"/);
  assert.ok(at('nameInput') < at('flagBtn') && at('flagBtn') < at('countryInput'), 'name, then the flag label + toggle, then its input underneath');
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

test('every item group and Choose your Hand is a horizontally scrolling row (no vertical wall of cards)', () => {
  const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  for (const id of ['skinPicker', 'profileLayers', 'profileGrid']) {
    const tag = html.slice(html.lastIndexOf('<', at(id)), html.indexOf('>', at(id)));
    assert.match(tag, /\bhrow\b|items-row/, id + ' is a scrolling row');
  }
  assert.match(css, /\.hrow[^}]*overflow-x:\s*auto/s); assert.match(css, /\.hrow[^}]*flex-wrap:\s*nowrap/s);
});

test('Choose your Hand can shrink and scroll sideways (no stretch); the colour picker has a "Choose colour" label and roomy targets', () => {
  const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.hand-row[^{]*\{[^}]*min-width:\s*0/s); assert.match(css, /\.skin-picker\.hrow button\s*\{[^}]*flex:\s*0 0 72px/s);
  assert.match(css, /\.cprow button\.sw\s*\{[^}]*width:\s*34px/s);
  const js = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(js, /'Choose colour'/); assert.ok(!js.includes('Only drawn data is sent'), 'the redundant drawn-data line is gone');
  assert.match(js, /\$\('profileGrid'\)\.scrollLeft = 0/, 'a category change resets the item row scroll');
});
