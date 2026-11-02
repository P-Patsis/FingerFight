// Profile & opponent-view layout: no favourite arena, sound grouped with the app settings, the four-or-two matrix in the
// real lobby, and the puppet skin picker (selection state).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installBrowser, peers, network, FakePeer, until, Conn } from './harness.js';

const b = installBrowser('?sim=1');
const $ = id => b.byId.get(id);
const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../index.html'), 'utf8');
await import('../js/main.js');
const visibleModes = () => $('modePicker').children.filter(x => !x.hidden).map(x => x.dataset.mode);
const section = id => html.slice(html.indexOf('<section id="' + id + '"'), html.indexOf('</section>', html.indexOf('<section id="' + id + '"')));

test('Profile: favourite arena is gone; the arena stays a lobby setting', () => {
  assert.ok(!/Favourite arena/i.test(html) && !html.includes('arenaDefault'));
  assert.ok(section('lobby').includes('id="bgPicker"'), 'the host still picks the arena in the lobby');
  assert.ok(!section('profile').includes('bgPicker'));
});

test('Profile: Player card, then how the opponent sees my hand, then App settings with the sound controls inside', () => {
  const profile = section('profile');
  assert.ok(profile.indexOf('Your name') < profile.indexOf('id="styleSlotProfile"') && profile.indexOf('id="styleSlotProfile"') < profile.indexOf('id="appSlotProfile"'));
  const app = html.slice(html.indexOf('id="appCard"'), html.indexOf('</div></div>', html.indexOf('id="appCard"')));
  for (const id of ['muteBtn', 'volSlider', 'rudeBtn', 'photoBtn']) assert.ok(app.includes('id="' + id + '"'), id + ' is in the App settings card');
  const style = html.slice(html.indexOf('id="styleCard"'), html.indexOf('id="appSlot"'));
  assert.ok(!style.includes('muteBtn') && !style.includes('volSlider'), 'sound is not mixed into the hand-style card');
  assert.ok(!/blur|Cartoon hand/i.test(html.slice(html.indexOf('id="styleCard"'), html.indexOf('id="camStatus"'))), 'no leftover old options');
  $('profileBtn').onclick();
  assert.deepEqual(b.visible(), ['profile']);
  assert.equal($('styleCard').parentElement, $('styleSlotProfile'));
  assert.equal($('appCard').parentElement, $('appSlotProfile'));
  assert.deepEqual(visibleModes(), ['skeleton', 'puppet', 'photo-skeleton', 'photo-puppet'], 'a profile is not a match: all four are shown');
  $('profileBack').onclick();
});

test('HANDS live in the Hand category (no separate row): one card per owned hand, the saved choice is marked, tapping saves it', async () => {
  $('profileBtn').onclick();
  const cards = () => $('profileGrid').children.filter(c => c.matches('.item-card'));
  await until(() => cards().length === 15, 'the fifteen free hands as cards (locked ones are unlocked in the Store)');
  assert.deepEqual($('profileLayers').children.map(x => x.dataset.value)[0], 'base', 'Hand is the first chip, and the one that is open');
  assert.deepEqual(cards().map(x => x.dataset.id), ['cartoon', 'robot', 'neon', 'paw', 'gauntlet', 'lowpoly', 'frog', 'duck', 'toybrick', 'floppy', 'gridmesh', 'bone', 'sand', 'inksketch', 'hook']);
  assert.deepEqual(cards().filter(x => x.classList.contains('eq')).map(x => x.dataset.id), ['cartoon'], 'default is the built-in cartoon');
  cards().find(x => x.dataset.id === 'robot').onclick();
  assert.equal(globalThis.localStorage.getItem('ff-puppet'), 'robot');
  assert.deepEqual(cards().filter(x => x.classList.contains('eq')).map(x => x.dataset.id), ['robot']);
  assert.equal(b.byId.get('skinPicker'), undefined, 'no separate "Choose your Hand" grid any more'); assert.equal(b.byId.get('skelRow'), undefined, 'no standalone skeleton colour row');
  $('modePicker').children.find(x => x.dataset.mode === 'photo-puppet').onclick();
  assert.equal(globalThis.localStorage.getItem('ff-mode'), 'photo-puppet');
  assert.equal(cards().length, 15, 'a puppet view opens the Hand category');
  $('profileBack').onclick();
});

const hostPeer = () => peers.find(p => p.id?.startsWith('ffight-p-'));
test('private lobby offers all four options and the skin picker; leaving and finding a random opponent offers only two', async () => {
  $('nameInput').value = 'Hank';
  await $('createBtn').onclick();
  const conn = new Conn(); hostPeer().emit('connection', conn); conn.emit('open');
  conn.emit('data', { t: 'hello', v: 2, kind: 'private', name: 'Ghost' });
  $('acceptBtn').onclick();
  await until(() => b.visible()[0] === 'lobby', 'private lobby');
  assert.deepEqual(visibleModes(), ['skeleton', 'puppet', 'photo-skeleton', 'photo-puppet']);
  assert.equal($('modePicker').children.filter(x => x.classList.contains('sel')).map(x => x.dataset.mode).join(), 'photo-puppet');
  assert.equal($('styleCard').parentElement, $('styleSlot')); assert.equal($('appCard').parentElement, $('appSlot'));
  assert.equal($('photoRow').hidden, false);

  $('leaveBtn').onclick();
  await until(() => b.visible()[0] === 'menu', 'menu');
  $('randomBtn').onclick();
  await until(() => network.has('ffight-r-0'), 'waiting slot');
  const stranger = new FakePeer(); const c = stranger.connect('ffight-r-0');
  c.on('open', () => c.send({ t: 'hello', v: 2, kind: 'random', name: 'Stranger' }));
  await until(() => b.visible()[0] === 'lobby', 'random lobby');
  assert.deepEqual(visibleModes(), ['skeleton', 'puppet'], 'strangers: two drawn options only');
  for (const x of $('modePicker').children.filter(m => !m.hidden)) assert.ok(!/photo/i.test(x.textContent + x.dataset.mode));
  assert.equal($('photoRow').hidden, true);
  // trying to force a photo view (the buttons are hidden, but call the handler anyway) changes nothing
  $('modePicker').children.find(x => x.dataset.mode === 'photo-skeleton').onclick();
  assert.equal(globalThis.localStorage.getItem('ff-mode'), 'photo-puppet', 'the friend choice is untouched');
  assert.deepEqual($('modePicker').children.filter(x => x.classList.contains('sel')).map(x => x.dataset.mode), ['puppet'], 'a stranger gets the drawn twin of my photo + puppet choice');
  setTimeout(() => process.exit(0), 50).unref();
});
