// Inspect the actual Play bundle, including its release-only web configuration.
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const bundle=process.argv[2]||'artifacts/FingerFight-release-unsigned.aab';
const entries=execFileSync('unzip',['-Z1',bundle],{encoding:'utf8',maxBuffer:4_000_000}).split('\n');
for(const path of ['BundleConfig.pb','base/manifest/AndroidManifest.xml','base/dex/classes.dex','base/assets/public/index.html','base/assets/public/js/android-runtime.js','base/assets/public/vendor/vision/hand_landmarker.task','base/assets/public/vendor/vision/wasm/vision_wasm_internal.wasm'])assert.ok(entries.includes(path),`Missing bundle file: ${path}`);
for(const song of ['dojo','neon','rooftop','volcano','space'])assert.ok(entries.includes(`base/assets/public/assets/audio/${song}.ogg`));
assert.ok(!entries.some(path=>/(?:^|\/)(?:backend|node_modules|\.git|\.android-tools)\//.test(path)),'Private files in bundle');
const read=path=>execFileSync('unzip',['-p',bundle,'base/assets/public/'+path],{encoding:'utf8'});
assert.match(read('js/dev-tools.js'),/DEVELOPMENT_TOOLS = false/);
assert.match(read('js/main.js'),/if \(false && typeof navigator/);
assert.match(read('js/hands.js'),/new URL\('\.\.\/vendor\/vision'/);
const signed=entries.some(path=>/^META-INF\/[^/]+\.(RSA|EC|DSA)$/.test(path));
if(process.env.FF_UPLOAD_KEYSTORE){assert.ok(signed,'Missing upload signature');execFileSync('jarsigner',['-verify',bundle],{stdio:'pipe'});}
else assert.equal(signed,false,'Unexpected signature without configured upload key');
console.log(`Bundle contents verified; developer tools disabled; ${signed?'upload-signed (Play acceptance not tested)':'UNSIGNED — configure upload signing before Play submission'}.`);
