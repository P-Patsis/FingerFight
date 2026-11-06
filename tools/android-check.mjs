import { readFile, readdir, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../dist/android-web/', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');
const hands = await read('js/hands.js');
assert.ok(!hands.includes('https://cdn.jsdelivr.net/npm/@mediapipe'));
assert.ok(!hands.includes('https://storage.googleapis.com/mediapipe-models'));
assert.ok((await stat(new URL('vendor/vision/hand_landmarker.task', root))).size > 7_000_000);
assert.ok((await stat(new URL('vendor/vision/wasm/vision_wasm_internal.wasm', root))).size > 1_000_000);
assert.match(await read('js/main.js'), /if \(false && typeof navigator/);
assert.match(await read('js/main.js'), /https:\/\/p-patsis\.github\.io\/FingerFight\/#room=/);
assert.match(await read('index.html'), /js\/android-runtime.js/);
assert.match(await read('css/style.css'), /var\(--safe-area-inset-top, 0px\)/);
const top = await readdir(root);
for (const name of ['backend', 'node_modules', '.git', '.android-tools', 'tests', 'package-lock.json']) assert.ok(!top.includes(name), `Private/build files copied: ${name}`);
// Every relative JS dependency must be present in the shipped shell.
for (const name of await readdir(new URL('js/', root))) {
  if (!name.endsWith('.js')) continue;
  const source = await read('js/' + name);
  for (const match of source.matchAll(/(?:from\s*|import\s*)['"](\.\/[^'"]+)['"]/g)) {
    await stat(new URL(match[1], new URL('js/' + name, root)));
  }
}
console.log('Android asset checks pass: local tracker/model, dependencies, safe areas, lifecycle, no backend files.');
