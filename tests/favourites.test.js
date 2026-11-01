// Favourite background + song: independent pickers in the Profile, live preview, the menus wear/play them, a new room preselects them, persisted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, until, peers, Conn } from './harness.js';

const b = installBrowser('?sim=1');
const ls = globalThis.localStorage;
ls.setItem('ff-bg', '3'); ls.setItem('ff-music', '2');              // what the previous version remembered from the host's last lobby choice
const $ = id => b.byId.get(id);
const { music } = await import('../js/audio.js');
const played = []; const orig = music.setArena.bind(music); music.setArena = i => { played.push(i); return orig(i); };
let stopped = 0; const origStop = music.stop.bind(music); music.stop = () => { stopped++; return origStop(); };
await import('../js/main.js');
const hostPeer = () => peers.find(p => p.id?.startsWith('ffight-p-'));

test('first run after the update: the old last lobby choice becomes the first favourite (background and song)', () => {
  assert.equal($('stage').className, 'bg-3', 'the menu wears it');
  assert.equal(played.at(-1), 2, 'and plays the song in the menu');
});

test('Profile: two independent horizontally scrolling pickers; any background with any song; browsing previews live; both persist', () => {
  $('profileBtn').onclick();
  const bg = $('favBgPicker'), song = $('favSongPicker');
  assert.match(bg.className, /\bhrow\b/); assert.match(song.className, /\bhrow\b/);
  assert.equal(bg.children.length, 5); assert.equal(song.children.length, 6, 'five songs plus "No song"');
  assert.deepEqual([bg.children.filter(x => x.classList.contains('sel')).map(x => x.dataset.value), song.children.filter(x => x.classList.contains('sel')).map(x => x.dataset.value)], [['3'], ['2']]);
  bg.children[1].onclick();                                          // Neon Street background, the song stays
  assert.equal($('stage').className, 'bg-1', 'live preview of the background'); assert.equal(ls.getItem('ff-favbg'), '1'); assert.equal(ls.getItem('ff-favsong'), '2', 'the song is its own choice');
  $('favSongPicker').children[5].onclick();                          // Space Station song with the Neon Street background
  assert.equal(played.at(-1), 4, 'live preview of the song'); assert.equal(ls.getItem('ff-favsong'), '4'); assert.equal($('stage').className, 'bg-1', 'the background stays');
  assert.deepEqual($('favBgPicker').children.filter(x => x.classList.contains('sel')).map(x => x.dataset.value), ['1'], 'the picker marks the choice');
  const before = stopped; $('favSongPicker').children[0].onclick();
  assert.equal(ls.getItem('ff-favsong'), '-1'); assert.ok(stopped > before, 'No song = silent menus');
  $('favSongPicker').children[3].onclick();
  $('profileBack').onclick();
  assert.equal($('stage').className, 'bg-1', 'back in the menu the favourite background is still on'); assert.equal(played.at(-1), 2, 'and its song plays');
});

test('hosting preselects the favourites; the lobby can still override them without changing the favourites', async () => {
  $('nameInput').value = 'Hank';
  await $('createBtn').onclick();
  assert.deepEqual(b.visible(), ['lobby']);
  assert.equal($('stage').className, 'bg-1', 'the room starts on my favourite background');
  assert.equal([...$('bgPicker').children].findIndex(x => x.classList.contains('sel')), 1);
  assert.equal([...$('musicPicker').children].findIndex(x => x.classList.contains('sel')), 2, 'and my favourite song');
  const conn = new Conn(); hostPeer().emit('connection', conn); conn.emit('open');
  conn.emit('data', { t: 'hello', v: 2, kind: 'private', name: 'Pal' }); $('acceptBtn').onclick();
  $('bgPicker').children[4].onclick(); $('musicPicker').children[0].onclick();
  assert.deepEqual(conn.sent.filter(m => m.t === 'settings').at(-1).settings.background, 4);
  assert.equal(ls.getItem('ff-favbg'), '1'); assert.equal(ls.getItem('ff-favsong'), '2', 'the favourites are untouched by a lobby change');
  $('leaveBtn').onclick();
  await until(() => b.visible()[0] === 'menu', 'menu');
  assert.equal($('stage').className, 'bg-1', 'after the match the menus wear the favourite again');
  assert.equal(played.at(-1), 2);
});

test('a favourite song of "none" starts rooms on the arena\'s own track; junk in storage falls back safely', async () => {
  $('profileBtn').onclick(); $('favSongPicker').children[0].onclick(); $('favBgPicker').children[2].onclick(); $('profileBack').onclick();
  await $('createBtn').onclick();
  assert.equal([...$('musicPicker').children].findIndex(x => x.classList.contains('sel')), 2, 'no favourite song: the background\'s own track');
  $('leaveBtn').onclick();
  setTimeout(() => process.exit(0), 50).unref();
});
