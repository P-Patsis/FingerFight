import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
test('Android lifecycle closes camera on background and Back preserves game confirmation', () => {
  const listeners = {}, events = [];
  let back = 0, exits = 0;
  const App = { addListener: (name, fn) => { listeners[name] = fn; }, exitApp: () => exits++ };
  const history = { state: { ff: 1 }, back: () => back++ };
  vm.runInNewContext(read('tools/android-runtime.js'), {
    window: { Capacitor: { registerPlugin: name => { assert.equal(name, 'App'); return App; } }, dispatchEvent: e => events.push(e.type) },
    history, Event: class { constructor(type) { this.type = type; } }
  });
  listeners.appStateChange({ isActive: false });
  listeners.appStateChange({ isActive: true });
  assert.deepEqual(events, ['pagehide', 'online']);
  listeners.backButton(); assert.equal(back, 1); assert.equal(exits, 0);
  history.state = null; listeners.backButton(); assert.equal(exits, 1);
});
test('Android uses bundled secure origin and requests camera without microphone', () => {
  const config = JSON.parse(read('capacitor.config.json'));
  assert.equal(config.server.hostname, 'localhost');
  assert.equal(config.server.androidScheme, 'https');
  assert.equal(config.server.cleartext, false);
  assert.equal(config.server.url, undefined);
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android.permission.CAMERA/);
  assert.doesNotMatch(manifest, /RECORD_AUDIO/);
});
test('debug signing stays within FingerFight', () => {
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /storeFile file\("\.\.\/\.\.\/\.android-tools\/debug.keystore"\)/);
  assert.doesNotMatch(gradle, /\.\.\/\.\.\/\.\.\/\.android-tools/);
});
