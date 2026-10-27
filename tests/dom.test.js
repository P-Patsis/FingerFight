// Static consistency checks (no browser here): every element id the code uses exists in index.html,
// every import resolves, and every CSS class the markup/JS relies on is defined.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');
const main = read('js/main.js');
const hands = read('js/hands.js');
const css = read('css/style.css');

test('every element id used by the scripts exists in index.html', () => {
  const used = new Set();
  for (const src of [main, hands]) for (const m of src.matchAll(/(?:\$|getElementById)\(\s*'([A-Za-z0-9_-]+)'\s*\)/g)) used.add(m[1]);
  const defined = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  const missing = [...used].filter(id => !defined.has(id));
  assert.deepEqual(missing, [], 'ids used but not in index.html: ' + missing.join(', '));
  assert.ok(used.size > 40, 'found ' + used.size + ' ids');
});

test('data-step buttons name real settings', () => {
  for (const m of html.matchAll(/data-step="(\w+):(-?\d)"/g)) assert.ok(['seconds', 'hits', 'maxFingers'].includes(m[1]), m[1]);
});

test('imports resolve to files', () => {
  for (const f of fs.readdirSync(path.join(root, 'js'))) {
    for (const m of read('js/' + f).matchAll(/from\s+'(\.\/[^']+)'/g)) assert.ok(fs.existsSync(path.join(root, 'js', m[1])), f + ' imports ' + m[1]);
  }
  for (const m of html.matchAll(/(?:src|href)="((?:js|css|vendor)\/[^"]+)"/g)) assert.ok(fs.existsSync(path.join(root, m[1])), 'index.html references ' + m[1]);
});

test('CSS classes the scripts add are defined', () => {
  const wanted = ['idle', 'punch', 'hit', 'ko', 'win', 'taunt', 'crit-fx', 'shake', 'shake-big', 'flash', 'spark', 'dmg', 'reveal', 'badge', 'sim', 'hint', 'thinking', 'urgent', 'locked', 'sel', 'mode-picker', 'skin-picker', 'real', 'lost', 'on', 'mirror', 'crit', 'good'];
  for (const c of wanted) assert.ok(new RegExp('\\.' + c.replace('-', '\\-') + '\\b').test(css), 'missing CSS for .' + c);
  for (let i = 0; i < 5; i++) { assert.ok(css.includes('.bg-' + i), 'bg-' + i); assert.ok(css.includes('.thumb-' + i), 'thumb-' + i); }
});

test('the PeerJS bundle is present and pinned', () => {
  const peer = read('vendor/peerjs.min.js');
  assert.ok(peer.length > 80000 && /Peer/.test(peer));
});
