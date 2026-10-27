import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { versionFor } from '../tools/stamp.mjs';

const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('sw.js VERSION matches the files it caches (run: node tools/stamp.mjs)', () => {
  assert.equal(sw.match(/const VERSION = '([^']*)'/)[1], versionFor());
});
test('the worker takes over at once, cleans old caches, and refreshes the shell past the HTTP cache', () => {
  assert.match(sw, /skipWaiting\(\)/); assert.match(sw, /clients\.claim\(\)/);
  assert.match(sw, /caches\.delete\(k\)/);
  assert.match(sw, /cache: 'no-cache'/);
  assert.ok(sw.includes("c.add(new Request(u, { cache: 'reload' }))") || sw.includes("cache: 'reload'"), 'precache bypasses the HTTP cache');
});
