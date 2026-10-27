// Every element id the script looks up must exist in index.html (a missing one used to kill all later buttons).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('every $(\'id\') in main.js exists in index.html', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  const used = new Set([...readFileSync(new URL('../js/main.js', import.meta.url), 'utf8').matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
  assert.deepEqual([...used].filter(u => !ids.has(u)), []);
});
