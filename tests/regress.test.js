// Regression tests: music plays again after a failed download, the tracking loop survives a bad frame, a photo style survives
// a random match, and the flag shows in a match for any letter case.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, peers, until, Conn } from './harness.js';
import { makeHand, ALL } from './helpers.js';

const b = installBrowser('?sim=1');
const $ = id => b.byId.get(id);
Object.defineProperty(globalThis.navigator, 'languages', { value: ['el'], configurable: true });   // a Greek phone that reports the language only
globalThis.localStorage.setItem('ff-flag', '1');
globalThis.localStorage.setItem('ff-mode', 'photo-puppet');

// ---- a fake AudioContext, so the real audio.js can "play"
const started = [];
class FakeParam { constructor() { this.value = 0; } setValueAtTime() {} linearRampToValueAtTime() {} cancelScheduledValues() {} exponentialRampToValueAtTime() {} }
class FakeNode { constructor() { this.gain = new FakeParam(); this.frequency = new FakeParam(); this.playbackRate = new FakeParam(); this.Q = new FakeParam(); this.detune = new FakeParam(); this.pan = new FakeParam(); } connect(n) { return n; } disconnect() {} start() { started.push(this); } stop() {} }
class FakeCtx { constructor() { this.state = 'running'; this.currentTime = 0; this.destination = new FakeNode(); this.sampleRate = 44100; }
  createGain() { return new FakeNode(); } createBufferSource() { return new FakeNode(); } createOscillator() { return new FakeNode(); } createBiquadFilter() { return new FakeNode(); }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
  async decodeAudioData() { return { duration: 10 }; } async resume() { this.state = 'running'; } }
globalThis.window = globalThis; globalThis.AudioContext = FakeCtx;
let fetchMode = 'fail';
const realFetch = globalThis.fetch;
globalThis.fetch = async url => {
  if (!String(url).includes('assets/audio/')) return realFetch(url);
  if (fetchMode === 'fail') throw new TypeError('Failed to fetch');
  return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) };
};
const { sfx, music } = await import('../js/audio.js');

test('music plays: a first download that fails does not silence the arena for the whole session', async () => {
  music.setArena(1);                         // before any tap: remembered
  sfx.unlock();                              // the first tap creates the context and tries the track: fails
  await new Promise(r => setTimeout(r, 30));
  assert.equal(started.length, 0, 'nothing playing yet (download failed)');
  fetchMode = 'ok';
  const realNow = Date.now; Date.now = () => realNow() + 16000;      // the retry window passes
  try { music.setArena(null); music.setArena(1); await until(() => started.length > 0, 'the track starts on the retry', 2000); }
  finally { Date.now = realNow; }
  assert.ok(started.length > 0);
});

test('sound effects make sound once the context exists', () => {
  const before = started.length;
  sfx.hit(1); sfx.ui();
  assert.ok(started.length > before, 'oscillators were started');
});

// ---- the hand-tracking loop
test('a throwing frame is reported on screen and the loop keeps running (it used to die silently)', async () => {
  const { HandCam } = await import('../js/hands.js');
  const video = $('video'); video.videoWidth = 640; video.videoHeight = 480; video.readyState = 4; video.currentTime = 0;
  const ctx2d = { clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {} };
  const canvas = { width: 640, height: 480, getContext: () => ctx2d, classList: { toggle() {} } };
  const cam = new HandCam(video, canvas);
  let calls = 0;
  cam.landmarker = { detectForVideo() { calls++; if (calls === 1) throw new Error('model hiccup'); return { landmarks: [makeHand(ALL)] }; } };
  const errors = [], frames = [];
  cam.onError = e => errors.push(e); cam.onFrame = s => frames.push(s);
  let raf = 0; globalThis.requestAnimationFrame = f => { if (raf++ < 6) setTimeout(() => { video.currentTime += 0.1; f(); }, 1); };
  cam.run();
  await until(() => frames.length >= 2, 'frames keep coming after the error', 2000);
  cam.running = false;
  assert.deepEqual(errors, ['model hiccup']);
  assert.equal(frames[0].count, 5);
});

// ---- the flag in a private match
const sentOf = (conn, t) => conn.sent.filter(m => m.t === t);
const hostPeer = () => peers.find(p => p.id?.startsWith('ffight-p-'));
await import('../js/main.js');

test('flag: a Greek phone (language "el" only) shows the flag; a guest that sends lower-case "gr" shows too; unknown shows none', async () => {
  $('nameInput').value = 'Hank';
  await $('createBtn').onclick();
  await until(() => $('flagBtn'), 'profile');
  const conn = new Conn(); hostPeer().emit('connection', conn); conn.emit('open');
  conn.emit('data', { t: 'hello', v: 2, kind: 'private', name: 'Ghost', flag: 'gr' });
  $('acceptBtn').onclick();
  await until(() => b.visible()[0] === 'lobby', 'lobby');
  assert.match($('nameHost').textContent, /^🇬🇷 Hank/, 'my flag comes from the browser language');
  assert.match($('nameGuest').textContent, /^🇬🇷 Ghost/, 'lower-case code from the other phone is accepted');
  const welcome = sentOf(conn, 'welcome')[0];
  assert.equal(welcome.flag, 'GR', 'what goes on the wire is canonical');
});

test('hand style: a photo choice survives a random match (it used to be overwritten with the cartoon) and is used again in the next private match', async () => {
  const sel = () => $('modePicker').children.filter(x => x.classList.contains('sel')).map(x => x.dataset.mode);
  assert.deepEqual(sel(), ['photo-puppet'], 'private lobby shows my photo choice');
  $('leaveBtn').onclick();
  await until(() => b.visible()[0] === 'menu', 'menu');
  $('randomBtn').onclick();
  const { network, FakePeer } = await import('./harness.js');
  await until(() => network.has('ffight-r-0'), 'waiting slot');
  const stranger = new FakePeer(); const c = stranger.connect('ffight-r-0');
  c.on('open', () => c.send({ t: 'hello', v: 2, kind: 'random', name: 'Stranger' }));
  await until(() => b.visible()[0] === 'lobby', 'random lobby');
  assert.deepEqual(sel(), ['puppet'], 'against a stranger the drawn twin (puppet) is shown');
  assert.equal(globalThis.localStorage.getItem('ff-mode'), 'photo-puppet', 'the saved choice is untouched');
  $('leaveBtn').onclick();
  await until(() => b.visible()[0] === 'menu', 'menu again');
  await $('createBtn').onclick();
  await until(() => b.visible()[0] === 'lobby', 'private lobby again');
  assert.deepEqual(sel(), ['photo-puppet'], 'photo is back for friends');
  setTimeout(() => process.exit(0), 50).unref();
});
