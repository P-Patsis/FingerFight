// Inspect the built APK with standard zip tools; run after assembleDebug.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const apk = process.argv[2] || 'artifacts/FingerFight-debug.apk';
const entries = execFileSync('unzip', ['-Z1', apk], { encoding: 'utf8', maxBuffer: 4_000_000 }).split('\n');
for (const path of ['assets/public/index.html', 'assets/public/js/android-runtime.js', 'assets/public/vendor/vision/hand_landmarker.task', 'assets/public/vendor/vision/wasm/vision_wasm_internal.wasm', 'classes.dex', 'AndroidManifest.xml']) assert.ok(entries.includes(path), `Missing APK file: ${path}`);
for(const file of ['dojo','neon','rooftop','volcano','space'])assert.ok(entries.includes('assets/public/assets/audio/'+file+'.ogg'),'Missing APK music: '+file);
assert.ok(!entries.some(path => /(?:^|\/)(?:backend|node_modules|\.git|\.android-tools)\//.test(path)), 'Unexpected private files');
const main = execFileSync('unzip', ['-p', apk, 'assets/public/js/main.js'], { encoding: 'utf8' });
assert.match(main, /if \(false && typeof navigator/);
const hands = execFileSync('unzip', ['-p', apk, 'assets/public/js/hands.js'], { encoding: 'utf8' });
assert.match(hands, /new URL\('\.\.\/vendor\/vision'/);
console.log('APK contents verified.');
