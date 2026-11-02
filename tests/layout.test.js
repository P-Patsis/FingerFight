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
  const order = ['modePicker', 'stickyTop', 'previewZone', 'viewPreviewBox', 'liveBox', 'cWearTop', 'cCat', 'profileLayers', 'custArea', 'profileGrid'].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  const top = html.slice(html.lastIndexOf('<div', at('stickyTop')), at('custArea'));
  for (const id of ['previewZone', 'cCat', 'profileLayers']) assert.ok(top.includes('id="' + id + '"'), id + ' is inside the sticky block');
  assert.ok(!top.includes('id="profileGrid"'), 'the item cards scroll under it, they are not part of it');
  assert.ok(!html.includes('id="wearPhoto"'), 'no standalone Photo toggle');
});

test('Done (camera off) is a small button INSIDE the preview zone (top-right corner), not a full-width bar', () => {
  const zone = html.slice(html.lastIndexOf('<div', at('previewZone')), at('cCat'));
  assert.ok(zone.includes('id="custDone"'), 'custDone lives in the preview window');
  const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.done-x[^}]*position:\s*absolute/s); assert.match(css, /\.done-x[^}]*top:/s); assert.match(css, /\.done-x[^}]*right:/s);
});

test('the item cards are a horizontally scrolling row (no vertical wall of cards); the category chips are TWO rows, all visible', () => {
  const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  const tag = id => html.slice(html.lastIndexOf('<', at(id)), html.indexOf('>', at(id)));
  assert.match(tag('profileGrid'), /\bhrow\b/, 'the cards scroll sideways');
  assert.match(tag('profileLayers'), /two-rows/); assert.doesNotMatch(tag('profileLayers'), /hrow/, 'the chips do not scroll');
  assert.ok(!html.includes('Choose your Hand') && !html.includes('id="skinPicker"'), 'hands are in the Hand category now');
  assert.match(css, /\.chips\.two-rows[^}]*grid-template-columns:\s*repeat\(4,/s, '7 chips in 4 columns = two rows');
  assert.match(css, /\.hrow[^}]*overflow-x:\s*auto/s); assert.match(css, /\.hrow[^}]*flex-wrap:\s*nowrap/s);
});

test('the colour picker has roomy targets and no "Choose colour" caption; the full-colour button is a plain button that opens OUR panel', () => {
  const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.cprow button\.sw\s*\{[^}]*width:\s*34px/s);
  const js = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.ok(!js.includes("'Choose colour'"), 'caption removed'); assert.ok(!js.includes('Only drawn data is sent'), 'the redundant drawn-data line is gone');
  assert.ok(!/input\[type=color\]/.test(js.replace(/\/\/.*$/gm, '')) && !js.includes("type = 'color'"), 'no native colour input is created: the OS dialog cannot appear');
  assert.match(css, /\.cp-panel\s*\{[^}]*position:\s*absolute/s, 'the panel floats over the cards instead of growing the pinned block');
});

test('name box and country block share one baseline: equal label-line heights and equal input heights', () => {
  const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.namerow > \.lab, \.flaghead\s*\{[^}]*height:\s*26px/s); assert.match(css, /\.namerow input, \.flagrow input\s*\{[^}]*height:\s*38px/s);
  assert.match(css, /\.idrow\s*\{[^}]*align-items:\s*flex-start/s);
});

test('every view\'s preview is the same size (4:3, same width rule as the puppet window); the intensity slider has no padding that shortens its travel', () => {
  const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  const last = css.lastIndexOf('.preview-zone .view-preview canvas');
  assert.match(css.slice(last), /width:\s*min\(100%, calc\(24vh \* 1\.3333\)\)[^}]*aspect-ratio:\s*4 \/ 3/s, 'same width and 4:3 as .wear-box');
  assert.match(css, /\.preview-zone \.wear-box\s*\{[^}]*width:\s*min\(100%, calc\(24vh \* 1\.3333\)\)/s);
  assert.match(html, /id="viewPreview" width="240" height="180"/, 'the canvas itself is 4:3, so nothing is stretched');
  assert.match(css, /\.cat-color input\[type=range\]\s*\{[^}]*padding:\s*0;[^}]*border:\s*0/s);
});

test('the colour picker is built by the app: hue slider + saturation/brightness square, no native colour input anywhere', () => {
  const js = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.ok(!/\.type = 'color'/.test(js), 'no <input type=color>');
  assert.match(js, /cp-sv/); assert.match(js, /cp-hue/); assert.ok(!html.includes('type="color"'));
});

test('the hue slider has a rainbow track scoped to the colour picker; the picker panel is compact; other sliders keep the global style', () => {
  const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  const rule = css.slice(css.lastIndexOf('.cat-color input[type=range].cp-hue {'));
  assert.match(rule, /linear-gradient\(90deg, #f00[^)]*#ff0[^)]*#0f0[^)]*#0ff[^)]*#00f[^)]*#f0f[^)]*#f00/s, 'red, yellow, green, cyan, blue, magenta, red');
  assert.match(rule, /appearance:\s*none/); assert.match(css, /\.cp-hue::-webkit-slider-thumb[^}]*background:\s*#fff/s, 'a white handle that shows on any colour');
  assert.match(css, /\.cp-hue::-moz-range-thumb/);
  assert.ok(!/(^|\n)input\[type=range\][^{]*\{[^}]*linear-gradient/.test(css), 'no global slider got the gradient');
  assert.match(css, /\.cp-sv\s*\{\s*height:\s*100px/); assert.match(css, /\.cp-panel\s*\{\s*gap:\s*6px;\s*padding:\s*8px/);
  assert.match(fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8'), /sv\.width = 240; sv\.height = 100;/, 'the canvas is drawn at its shown size: no stretched, padded square');
});
