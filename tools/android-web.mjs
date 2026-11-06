// Assemble only the public game shell, never the backend or repository files.
import { mkdir, copyFile, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { shellFiles } from './stamp.mjs';
const out = new URL('../dist/android-web/', import.meta.url);
await rm(out, { recursive: true, force: true });
for (const file of new Set(shellFiles())) {
  if (file.includes('..') || file.startsWith('/')) throw new Error('Unsafe shell path');
  const target = new URL(file, out);
  await mkdir(new URL('.', target), { recursive: true });
  await copyFile(new URL('../' + file, import.meta.url), target);
}
await mkdir(new URL('vendor/vision/', out), { recursive: true });
await copyFile(new URL('../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs', import.meta.url), new URL('vendor/vision/vision_bundle.mjs', out));
await cp(new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url), new URL('vendor/vision/wasm/', out), { recursive: true });
const model = new URL('../.android-tools/hand_landmarker.task', import.meta.url);
const modelBytes = await readFile(model);
if (createHash('sha256').update(modelBytes).digest('hex') !== 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1') throw new Error('Hand model checksum mismatch');
await copyFile(model, new URL('vendor/vision/hand_landmarker.task', out));
const hands = new URL('js/hands.js', out);
await writeFile(hands, (await readFile(hands, 'utf8'))
  .replace("'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14'", "new URL('../vendor/vision', import.meta.url).href")
  .replace("'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'", "new URL('../vendor/vision/hand_landmarker.task', import.meta.url).href"));
const main = new URL('js/main.js', out);
await writeFile(main, (await readFile(main, 'utf8')).replace("if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator", "if (false && typeof navigator !== 'undefined' && 'serviceWorker' in navigator")
  .replace("location.origin + location.pathname + '#room='", "'https://p-patsis.github.io/FingerFight/#room='"));
console.log('Android web shell assembled; local hand model; no service worker.');

await copyFile(new URL('../node_modules/@capacitor/core/dist/capacitor.js', import.meta.url), new URL('vendor/capacitor.js', out));
await copyFile(new URL('android-runtime.js', import.meta.url), new URL('js/android-runtime.js', out));
const index = new URL('index.html', out);
await writeFile(index, (await readFile(index, 'utf8')).replace('</body>', '<script src="vendor/capacitor.js"></script><script type="module" src="js/android-runtime.js"></script></body>'));

// Capacitor SystemBars supplies CSS custom properties for Android edge-to-edge.
const css = new URL('css/style.css', out);
await writeFile(css, (await readFile(css, 'utf8')).replace(/env\(safe-area-inset-(top|right|bottom|left)(?:,\s*0px)?\)/g, 'var(--safe-area-inset-$1, 0px)'));
