// Finger Fight: the controller. Screens (menu, lobby, game, over), the room link, and the round state machine.
//
// A round: the POINTER holds up fingers while the GUESSER guesses the total. When the timer ends the pointer's phone
// snaps a photo + the count + any gesture and sends it; the guesser's phone sends the guess. Each side then runs
// resolveRound() on the same inputs, so both screens show the same result. The host starts every round.
import { sfx } from './audio.js';
import { Link, newCode, cleanCode, formatCode, privateId, randomId, CODE_LEN } from './net.js';
import { HandCam, SimCam } from './hands.js';
import { SKINS, drawAvatar, drawFromMessage, statesFromCount, skinById } from './avatars.js';
import {
  DEFAULTS, normalizeSettings, newGame, pointerFor, other, resolveRound, applyResult, describe,
  sanitizeName, validGuessMsg, validReveal, VIEWS, SAFE_VIEWS, RANDOM_SLOTS,
} from './logic.js';
import { fighterSVG, backgroundHTML, BACKGROUNDS, GESTURE_NAMES } from './fighters.js';

const $ = id => document.getElementById(id);
const SIM = new URLSearchParams(location.search).has('sim');   // ?sim=1: no camera, set the hand by tapping (for testing)
const PROTOCOL = 2;

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------
let link = null;
let me = null;                          // 'host' | 'guest'
let names = { host: '', guest: '' };
let settings = { ...DEFAULTS };
let ready = { host: false, guest: false };   // camera + hand model ready on that phone
let cam = null, camReady = false;
let game = null;                        // see logic.js newGame()
let round = null;                       // the round in progress
let inGame = false;
let token = 0;                          // bumped to cancel pending timeouts from an old round or game
let bannerTimer = null;

let matchKind = null;                   // 'private' (friends, long code) | 'random' (strangers: cartoon/skeleton only)
let roomCodeRaw = '';                   // the private match code, without dashes
let pendingGuest = null;                // private match: a guest waiting for the host to accept
let requireApproval = true;             // host: ask before someone joins a private match
let showPhotos = true;                  // private match: display a friend's real photo if they send one
let helloTimer = null;                  // host: drop a connection that never says hello
let searching = false, searchId = 0;    // random matchmaking in progress
let matchWaiter = null, hostWaiter = null;
let autoStarted = false;

const MODE_LABELS = {
  avatar: 'Cartoon hand', skeleton: 'Skeleton', blur: 'Blurred photo + skeleton', 'photo-skeleton': 'Photo + skeleton', photo: 'Photo (real camera)',
};
// what I show my opponent: a view mode and a cartoon skin (remembered on this phone)
let style = { mode: VIEWS.includes(store_get('ff-mode')) ? store_get('ff-mode') : 'avatar', skin: skinById(store_get('ff-skin')).id };

function store_get(k) { try { return localStorage.getItem(k); } catch { return null; } }
const store = {
  get: store_get,
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
}

let currentBg = -1;
function setBackground(i) {
  if (i === currentBg) return;
  currentBg = i;
  $('stage').className = 'bg-' + i;
  $('scenery').innerHTML = backgroundHTML(i);      // fixed artwork, no user text
}

function later(ms, fn) {
  const t = token;
  setTimeout(() => { if (t === token) fn(); }, ms);
}

function showBanner(big, small = '', ms = 900, cls = '') {
  const b = $('banner');
  b.className = cls;
  b.replaceChildren();
  const e = document.createElement('b'); e.textContent = big; b.append(e);
  if (small) { const s = document.createElement('small'); s.textContent = small; b.append(s); }
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.replaceChildren(), ms);
}

const panelOf = side => (side === me ? 'bottom' : 'top');
const fighterEl = side => $(panelOf(side) + 'Fighter');
const hpEl = side => $(panelOf(side) === 'top' ? 'topHp' : 'botHp');
const contentEl = side => $(panelOf(side) + 'Content');
const send = obj => link?.send(obj);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ---------------------------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------------------------
$('nameInput').value = store.get('ff-name') || '';
{
  // a shared link carries the code after the "#": browsers never send that part to any server
  const m = /(?:^|[#&])room=([A-Za-z0-9-]+)/.exec(location.hash || '');
  if (m) {
    $('codeInput').value = formatCode(cleanCode(m[1]));
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }   // don't leave the code in the address bar
  }
}
$('codeInput').addEventListener('input', e => { e.target.value = formatCode(cleanCode(e.target.value)); });
$('muteBtn').onclick = () => {
  sfx.setMuted(!sfx.muted);
  $('muteBtn').textContent = 'Sound: ' + (sfx.muted ? 'off' : 'on');
};

function menuMsg(text, err = false) {
  $('menuMsg').textContent = text;
  $('menuMsg').classList.toggle('err', err);
}

function myName() {
  const n = sanitizeName($('nameInput').value);
  store.set('ff-name', n);
  return n;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Resolves true as soon as cond() is true, or false after ms. */
async function waitFor(cond, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await sleep(150); }
  return cond();
}

function makeLink(quiet = false) {
  return new Link({
    onOpen: onLinkOpen,
    onMessage: onMessage,
    onClose: reason => onLinkClosed(reason),
    onStatus: t => { if (!quiet) menuMsg(t); },
  });
}

/** Tears down a link. With [only], a stale search attempt closes just its own link and never touches a newer one. */
function cleanupLink(only) {
  if (only && link !== only) { only.closed = true; try { only.close(); } catch { /* ignore */ } return; }
  if (link) { link.closed = true; try { link.close(); } catch { /* ignore */ } }
  link = null; me = null; names = { host: '', guest: '' };
  clearTimeout(helloTimer);
}

// ---- private match: a long unique code to share
$('createBtn').onclick = async () => {
  sfx.unlock();
  resetAll();
  matchKind = 'private';
  me = 'host';
  names.host = myName();
  menuMsg('Creating your match…');
  link = makeLink();
  let code = null;
  for (let i = 0; i < 6 && !code; i++) {
    const c = newCode();
    try { await link.host(privateId(c)); code = c; } catch (e) {
      if (e.message === 'taken') { link.close(); link = makeLink(); continue; }
      menuMsg('Could not create a match (' + e.message + '). Check your internet connection.', true);
      resetAll();
      return;
    }
  }
  if (!code) { menuMsg('Could not create a match. Try again.', true); resetAll(); return; }
  roomCodeRaw = code;
  $('roomCode').textContent = formatCode(code);
  enterLobby();
};

$('joinBtn').onclick = async () => {
  sfx.unlock();
  const code = cleanCode($('codeInput').value);
  if (code.length !== CODE_LEN) { menuMsg('A match code has ' + CODE_LEN + ' letters and digits. Paste the whole code.', true); return; }
  resetAll();
  matchKind = 'private';
  me = 'guest';
  names.guest = myName();
  menuMsg('Connecting…');
  link = makeLink();
  try {
    await link.join(privateId(code));
  } catch (e) {
    const why = { 'no-room': 'There is no match with that code (or the host already left).', timeout: 'Could not connect. The other phone may be on a network that blocks connections.' }[e.message];
    menuMsg(why || 'Could not connect (' + e.message + ').', true);
    resetAll();
    return;
  }
  roomCodeRaw = code;
  enterLobby();
};

// ---- random opponent: strangers meet in a few well-known slots, with no server of ours.
// Look in each slot for someone waiting; if nobody is, claim the first free slot and wait there.
function setSearching(on) {
  searching = on;
  $('randomBtn').hidden = on;
  $('cancelBtn').hidden = !on;
  $('createBtn').disabled = on;
  $('joinBtn').disabled = on;
}

$('cancelBtn').onclick = () => { searchId++; setSearching(false); cleanupLink(); matchKind = null; menuMsg('Search cancelled.'); };

async function tryJoinRandom(i, name, active) {
  me = 'guest'; names = { host: '', guest: name };
  const l = makeLink(true); link = l;
  let mine;
  const matched = new Promise(res => { mine = res; matchWaiter = res; });
  const done = () => { if (matchWaiter === mine) matchWaiter = null; };
  try { await l.join(randomId(i), 4000); } catch { done(); cleanupLink(l); return false; }
  const ok = await Promise.race([matched, sleep(3500).then(() => false)]);   // a host answers 'welcome' straight away
  done();
  if (!ok || !active()) { cleanupLink(l); return false; }
  return true;
}

async function tryHostRandom(i, name, active) {
  me = 'host'; names = { host: name, guest: '' };
  let mine;
  const matched = new Promise(res => { mine = res; hostWaiter = res; });    // set up BEFORE opening, so an early guest isn't missed
  const done = () => { if (hostWaiter === mine) hostWaiter = null; };
  const l = makeLink(true); link = l;
  try { await l.host(randomId(i)); } catch (e) { done(); cleanupLink(l); return e.message === 'taken' ? 'taken' : 'error'; }
  menuMsg('Waiting for an opponent…');
  const r = await Promise.race([matched, waitFor(() => !active(), 40000).then(() => 'timeout')]);
  done();
  if (r === true && active()) return 'matched';
  cleanupLink(l);
  return 'timeout';
}

$('randomBtn').onclick = async () => {
  sfx.unlock();
  resetAll();
  matchKind = 'random';
  const id = ++searchId;
  setSearching(true);
  const active = () => searching && id === searchId;
  const myRandom = 'Fighter ' + (1000 + Math.floor(Math.random() * 9000));    // strangers get a generated name
  const deadline = Date.now() + 120_000;
  menuMsg('Looking for an opponent…');
  let matched = false;
  while (!matched && active() && Date.now() < deadline) {
    for (let i = 0; i < RANDOM_SLOTS && active() && !matched; i++) matched = await tryJoinRandom(i, myRandom, active);
    for (let i = 0; i < RANDOM_SLOTS && active() && !matched; i++) {
      const r = await tryHostRandom(i, myRandom, active);
      if (r === 'matched') matched = true;
      else if (r !== 'taken') break;               // timed out or failed: go back to looking
    }
    if (!matched && active()) await sleep(300 + Math.random() * 700);      // jitter so two searchers don't move in lockstep
  }
  if (id !== searchId) return;                     // cancelled
  setSearching(false);
  if (matched) { enterLobby(); return; }
  cleanupLink(); matchKind = null;
  menuMsg('No opponent found right now. Try again in a minute.', true);
};

// ---------------------------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------------------------
const allowPhotos = () => matchKind === 'private';          // random opponents never send, and are never shown, photos
const pictureOf = m => ({ photo: m.photo, view: m.view, skin: m.skin, hands: m.hands, lm: m.lm, ar: m.ar });

function onLinkOpen() {
  if (me === 'guest') send({ t: 'hello', v: PROTOCOL, kind: matchKind, name: names.guest });
  if (me === 'host') {                                     // a connection that never says hello must not hog the room
    clearTimeout(helloTimer);
    helloTimer = setTimeout(() => { if (me === 'host' && !names.guest && !pendingGuest) link?.dropGuest(); }, 8000);
  }
}

function onLinkClosed(reason) {
  if (!me || searching) return;
  const wasPlaying = inGame;
  resetAll();
  show('menu');
  menuMsg(wasPlaying ? 'Your opponent left the fight.' : 'The connection closed (' + reason + ').', true);
}

function acceptGuest(name) {
  pendingGuest = null;
  names.guest = name;
  send({ t: 'welcome', v: PROTOCOL, kind: matchKind, name: names.host, settings, ready: ready.host });
  hostWaiter?.(true);
  renderLobby();
}

$('acceptBtn').onclick = () => { if (me === 'host' && pendingGuest) acceptGuest(pendingGuest); };
$('rejectBtn').onclick = () => {
  if (me !== 'host' || !pendingGuest) return;
  send({ t: 'rejected' });
  pendingGuest = null;
  link?.dropGuest();
  renderLobby();
};

function onMessage(m) {
  switch (m.t) {
    case 'bye':
      onLinkClosed('left');
      break;
    case 'full':
      if (matchWaiter) { matchWaiter(false); break; }
      resetAll(); show('menu'); menuMsg('That match already has two players.', true);
      break;
    case 'rejected':
      if (matchWaiter) { matchWaiter(false); break; }
      resetAll(); show('menu'); menuMsg('The host declined your request.', true);
      break;
    case 'hello':                                   // host: someone connected
      if (me !== 'host' || names.guest || pendingGuest) break;
      if (m.v !== PROTOCOL || m.kind !== matchKind) { send({ t: 'rejected' }); link?.dropGuest(); break; }
      clearTimeout(helloTimer);
      if (matchKind === 'private' && requireApproval) { pendingGuest = sanitizeName(m.name); renderLobby(); }
      else acceptGuest(sanitizeName(m.name));
      break;
    case 'welcome':                                 // guest: accepted; here are the host's details
      if (me !== 'guest' || m.kind !== matchKind) break;
      names.host = sanitizeName(m.name);
      settings = normalizeSettings(m.settings);
      ready.host = m.ready === true;
      send({ t: 'ready', ready: ready.guest });
      matchWaiter?.(true);
      renderLobby();
      break;
    case 'settings':
      if (me !== 'guest' || !names.host) break;
      settings = normalizeSettings(m.settings);
      renderLobby();
      break;
    case 'ready':
      if (!names.host || !names.guest) break;
      ready[other(me)] = m.ready === true;
      renderLobby();
      break;
    case 'start':
      if (me !== 'guest' || !names.host) break;
      settings = normalizeSettings(m.settings);
      startGame();
      break;
    case 'round':
      if (me === 'guest' && inGame && Number.isInteger(m.n) && m.n === game.round + 1) beginRound(m.n);
      break;
    case 'reveal':
      if (round && m.n === round.n && !round.reveal && round.pointer === other(me) && validReveal(m, allowPhotos())) {
        round.reveal = { count: m.count, gesture: m.gesture, noHand: m.noHand, ...pictureOf(m) };
        tryResolve();
      }
      break;
    case 'guess':
      if (round && m.n === round.n && !round.guessMsg && round.pointer === me && validGuessMsg(m, allowPhotos())) {
        round.guessMsg = { guess: m.guess, ...pictureOf(m) };
        tryResolve();
      }
      break;
    default: break;
  }
}

// ---------------------------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------------------------
function enterLobby() {
  menuMsg('');
  setBackground(settings.background);
  buildBgPicker();
  buildStyleCard();
  show('lobby');
  renderLobby();
  if (SIM) enableCamera();
}

function buildBgPicker() {
  const box = $('bgPicker');
  box.replaceChildren();
  BACKGROUNDS.forEach((name, i) => {
    const b = el('button', 'thumb-' + i, name);
    b.type = 'button';
    b.onclick = () => { if (me === 'host') { settings.background = i; setBackground(i); send({ t: 'settings', settings }); renderLobby(); } };
    box.append(b);
  });
}

// ---- what my opponent sees of my hand
const effectiveStyle = () => (matchKind === 'random' && !SAFE_VIEWS.includes(style.mode) ? { ...style, mode: 'avatar' } : style);

function buildStyleCard() {
  const modes = $('modePicker');
  modes.replaceChildren();
  for (const v of VIEWS) {
    const b = el('button', SAFE_VIEWS.includes(v) ? '' : 'real', MODE_LABELS[v]);
    b.type = 'button';
    b.dataset.mode = v;
    b.onclick = () => { if (matchKind === 'random' && !SAFE_VIEWS.includes(v)) return; style.mode = v; store.set('ff-mode', v); renderStyle(); };
    modes.append(b);
  }
  const skins = $('skinPicker');
  skins.replaceChildren();
  for (const sk of SKINS) {
    const b = el('button', '');
    b.type = 'button';
    b.dataset.skin = sk.id;
    b.title = sk.name;
    const c = document.createElement('canvas');
    c.width = 80; c.height = 80;
    drawAvatar(c.getContext('2d'), 80, 80, statesFromCount(5), sk, false);
    b.append(c);
    b.onclick = () => { style.skin = sk.id; store.set('ff-skin', sk.id); renderStyle(); };
    skins.append(b);
  }
  $('photoBtn').onclick = () => { showPhotos = !showPhotos; renderStyle(); };
  renderStyle();
}

function renderStyle() {
  const random = matchKind === 'random';
  if (random && !SAFE_VIEWS.includes(style.mode)) style.mode = 'avatar';
  for (const b of $('modePicker').children) {
    b.classList.toggle('sel', b.dataset.mode === style.mode);
    b.disabled = random && !SAFE_VIEWS.includes(b.dataset.mode);
  }
  for (const b of $('skinPicker').children) b.classList.toggle('sel', b.dataset.skin === style.skin);
  $('skinRow').hidden = style.mode !== 'avatar';
  $('photoRow').hidden = random;
  $('photoBtn').textContent = showPhotos ? 'On' : 'Off';
  $('photoBtn').classList.toggle('on', showPhotos);
  const real = !SAFE_VIEWS.includes(style.mode);
  $('styleNote').textContent = random
    ? 'Random opponent: only drawn data is shared. Your camera image never leaves this phone.'
    : real ? 'Warning: this sends a real camera image of you (maybe your face or room) to your opponent.'
    : 'Only drawn data is sent. Your camera image never leaves this phone.';
  $('styleNote').classList.toggle('err', real && !random);
}

function renderLobby() {
  const random = matchKind === 'random';
  $('privateBox').hidden = !(matchKind === 'private' && me === 'host');
  $('randomNote').hidden = !random;
  $('nameHost').textContent = names.host || '-';
  $('nameGuest').textContent = names.guest || 'Waiting…';
  $('dotHost').classList.toggle('on', !!names.host);
  $('dotGuest').classList.toggle('on', !!names.guest);
  $('stHost').textContent = names.host ? (ready.host ? 'ready' : 'camera off') : '';
  $('stGuest').textContent = names.guest ? (ready.guest ? 'ready' : 'camera off') : '';
  $('valSeconds').textContent = settings.seconds;
  $('valHits').textContent = settings.hits;
  $('critBtn').textContent = settings.crits ? 'On' : 'Off';
  $('critBtn').classList.toggle('on', settings.crits);
  $('approveBtn').textContent = requireApproval ? 'On' : 'Off';
  $('approveBtn').classList.toggle('on', requireApproval);
  $('approveRow').hidden = !(matchKind === 'private' && me === 'host');
  [...$('bgPicker').children].forEach((b, i) => b.classList.toggle('sel', i === settings.background));
  setBackground(settings.background);
  $('settingsCard').hidden = random;
  $('settingsCard').classList.toggle('locked', me !== 'host');
  $('joinPrompt').hidden = !pendingGuest;
  if (pendingGuest) $('joinText').textContent = pendingGuest + ' wants to join your match.';
  $('camBtn').hidden = camReady;
  const canStart = me === 'host' && link?.open && !!names.guest && ready.host && ready.guest;
  $('startBtn').hidden = me !== 'host' || random;           // a random match starts by itself
  $('startBtn').disabled = !canStart;
  $('lobbyMsg').textContent = me === 'guest' ? (names.host ? (random ? 'Starts when you both have your camera on.' : 'The host starts the fight.') : 'Waiting for the host to accept you…')
    : pendingGuest ? 'Accept or decline the player above.'
    : !names.guest ? (random ? 'Waiting…' : 'Send the code to your friend. Waiting for them to join…')
    : !(ready.host && ready.guest) ? 'Both players need to enable their camera.' : '';
  if (random && canStart && !autoStarted) {
    autoStarted = true;
    setTimeout(() => { if (me === 'host' && !inGame && !$('lobby').hidden) $('startBtn').onclick(); }, 1500);
  }
}

$('settingsCard').addEventListener('click', e => {
  if (me !== 'host') return;
  const step = e.target.closest?.('[data-step]');
  if (!step) return;
  const [key, delta] = step.dataset.step.split(':');
  settings = normalizeSettings({ ...settings, [key]: settings[key] + Number(delta) });
  send({ t: 'settings', settings });
  renderLobby();
});
$('critBtn').onclick = () => {
  if (me !== 'host') return;
  settings = normalizeSettings({ ...settings, crits: !settings.crits });
  send({ t: 'settings', settings });
  renderLobby();
};
$('approveBtn').onclick = () => { if (me === 'host') { requireApproval = !requireApproval; renderLobby(); } };

$('copyBtn').onclick = async () => {
  try { await navigator.clipboard.writeText(formatCode(roomCodeRaw)); $('lobbyMsg').textContent = 'Code copied. Send it to your friend.'; }
  catch { $('lobbyMsg').textContent = 'Could not copy. Select the code above and copy it by hand.'; }
};
$('shareBtn').onclick = async () => {
  const url = location.origin + location.pathname + '#room=' + roomCodeRaw;       // the code is after the "#": never sent to a server
  try {
    if (navigator.share) { await navigator.share({ title: 'Finger Fight', text: 'Join my Finger Fight match!', url }); return; }
    await navigator.clipboard.writeText(url);
    $('lobbyMsg').textContent = 'Link copied. Send it to your friend.';
  } catch { $('lobbyMsg').textContent = 'Share this link: ' + url; }
};
$('leaveBtn').onclick = leave;
$('overLeave').onclick = leave;
$('camBtn').onclick = enableCamera;

function leave() {
  send({ t: 'bye' });
  resetAll();
  show('menu');
  menuMsg('');
}

async function enableCamera() {
  sfx.unlock();
  if (camReady) return;
  $('camBtn').disabled = true;
  const status = t => { $('camStatus').textContent = t; };
  status(SIM ? 'Simulator: no camera needed.' : 'Loading the hand model (about 17 MB, once)…');
  cam = SIM ? new SimCam() : new HandCam($('video'), $('overlayCanvas'));
  try {
    await cam.load();
  } catch (e) {
    status('Could not load the hand model (' + (e.message || e) + '). Check your internet connection.');
    $('camBtn').disabled = false;
    return;
  }
  const err = await cam.startCamera();
  if (err) { status(err); $('camBtn').disabled = false; return; }
  camReady = true;
  ready[me] = true;
  status('Camera ready.');
  $('flipBtn').onclick = async () => { const e = await cam.flip(); if (e) status(e); };
  send({ t: 'ready', ready: true });
  renderLobby();
}

$('startBtn').onclick = () => {
  if (me !== 'host') return;
  send({ t: 'start', settings });
  startGame();
};

// ---------------------------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------------------------
function startGame() {
  token++;
  inGame = true;
  game = newGame(settings);
  round = null;
  setBackground(settings.background);
  for (const side of ['host', 'guest']) {
    const f = fighterEl(side);
    f.innerHTML = fighterSVG(side);
    f.className = 'fighter idle';
  }
  $('topName').textContent = names[other(me)];
  $('botName').textContent = names[me];
  renderHp('host'); renderHp('guest');
  for (const side of ['host', 'guest']) contentEl(side).replaceChildren();
  $('roundLabel').textContent = 'ROUND 1';
  $('roleLabel').textContent = '';
  $('timerNum').textContent = settings.seconds;
  show('game');
  showBanner('GET READY', '', 1100);
  if (me === 'host') later(1500, nextRound);
}

function renderHp(side, flashFrom = null) {
  const box = hpEl(side);
  box.replaceChildren();
  for (let i = 0; i < settings.hits; i++) {
    const seg = el('i', i >= game.health[side] ? 'lost' : '');
    if (flashFrom !== null && i >= game.health[side] && i < flashFrom) seg.classList.add('flash');
    box.append(seg);
  }
}

function nextRound() {
  if (!inGame || game.over) return;
  const n = game.round + 1;
  send({ t: 'round', n });
  beginRound(n);
}

function beginRound(n) {
  token++;                                              // cancels anything left over from the previous round
  game.round = n;
  const pointer = pointerFor(n);
  round = { n, pointer, phase: 'intro', reveal: null, guessMsg: null, resolved: false };
  $('roundLabel').textContent = 'ROUND ' + n;
  $('roleLabel').textContent = pointer === me ? 'You point' : 'You guess';
  $('timerNum').textContent = settings.seconds;
  $('timerWrap').classList.remove('urgent');
  $('timerBar').firstElementChild.style.transform = 'scaleX(1)';
  for (const side of ['host', 'guest']) { contentEl(side).replaceChildren(); fighterEl(side).className = 'fighter idle'; }
  releaseCamera();
  showBanner('ROUND ' + n, '', 1000);
  later(1100, () => { showBanner('FIGHT!', pointer === me ? 'Hold up your fingers!' : 'Show your GUESS with your fingers!', 900); sfx.fight(); });
  later(1900, startGuessPhase);
}

function startGuessPhase() {
  round.phase = 'guess';
  setupCameraUI();                                                   // both players hold up fingers to their own camera
  contentEl(other(me)).replaceChildren(el('div', 'thinking', '✋ ???'));   // their hand stays hidden until the reveal
  runTimer(settings.seconds);
}

function runTimer(seconds) {
  const t = token;
  const end = performance.now() + seconds * 1000;
  let lastWhole = seconds + 1;
  const id = setInterval(() => {
    if (t !== token) { clearInterval(id); return; }
    const left = Math.max(0, end - performance.now());
    const whole = Math.ceil(left / 1000);
    $('timerNum').textContent = whole;
    $('timerBar').firstElementChild.style.transform = 'scaleX(' + (left / (seconds * 1000)).toFixed(3) + ')';
    $('timerWrap').classList.toggle('urgent', whole <= 2 && left > 0);
    if (whole !== lastWhole) { lastWhole = whole; if (whole <= 3 && whole > 0) sfx.tick(); }
    if (left <= 0) { clearInterval(id); endGuessPhase(); }
  }, 100);
}

// ---- both roles: your camera (or the simulator) fills the bottom panel. The pointer's fingers are the answer,
//      the guesser's fingers are the guess.
function setupCameraUI() {
  const pointing = round.pointer === me;
  const caption = pointing ? 'POINT: hold up your fingers' : 'GUESS: show the number with your fingers';
  const box = contentEl(me);
  if (SIM) {
    const wrap = el('div', 'sim');
    wrap.append(el('div', 'hint', caption));
    const btn = (label, onClick) => { const b = el('button', '', label); b.type = 'button'; b.onclick = onClick; return b; };
    const refresh = () => {
      for (const b of wrap.querySelectorAll('[data-count]')) b.classList.toggle('sel', Number(b.dataset.count) === cam.sim.count);
      for (const b of wrap.querySelectorAll('[data-g]')) b.classList.toggle('sel', (b.dataset.g || null) === cam.sim.gesture);
      wrap.querySelector('[data-nohand]').classList.toggle('sel', cam.sim.noHand);
    };
    for (let c = 0; c <= 10; c++) { const b = btn(String(c), () => { cam.set({ count: c }); refresh(); }); b.dataset.count = c; wrap.append(b); }
    if (pointing) for (const g of ['', 'middle', 'moutza', 'sideways']) { const b = btn(g || 'no gesture', () => { cam.set({ gesture: g || null }); refresh(); }); b.dataset.g = g; wrap.append(b); }
    const nh = btn('hide hand', () => { cam.set({ noHand: !cam.sim.noHand }); refresh(); }); nh.dataset.nohand = '1'; wrap.append(nh);
    box.replaceChildren(wrap);
    refresh();
    return;
  }
  const camBox = $('camBox');
  box.replaceChildren(camBox);
  camBox.hidden = false;
  $('camCaption').textContent = caption;
  $('camCaption').className = pointing ? 'point' : 'guess';
  cam.onFrame = s => {
    $('liveCount').textContent = s.count;
    // only the pointer's gestures score, so only show the gesture label to the pointer
    $('liveGesture').textContent = pointing && s.gesture ? GESTURE_NAMES[s.gesture] : '';
  };
  cam.run();
}

function releaseCamera() {
  if (!cam || SIM) return;
  cam.pause();
  cam.onFrame = null;
  const camBox = $('camBox');
  camBox.hidden = true;
  if (camBox.parentElement !== document.body) document.body.append(camBox);
}

// ---- the timer ran out
function endGuessPhase() {
  if (!round || round.phase !== 'guess') return;
  round.phase = 'waiting';
  const snap = cam.snap(effectiveStyle());         // both phones snap at 0, in the style I chose (cartoon/skeleton only in random matches)
  releaseCamera();
  if (round.pointer === me) {
    round.reveal = { count: snap.count, gesture: snap.gesture, noHand: snap.noHand, ...pictureOf(snap) };
    contentEl(me).replaceChildren(el('div', 'hint', 'Snap! Waiting for their guess…'));
    send({ t: 'reveal', n: round.n, ...round.reveal });
  } else {
    // the guess is the number of fingers you held up; no hand seen = no guess
    round.guessMsg = { guess: snap.noHand ? null : snap.count, ...pictureOf(snap) };
    contentEl(me).replaceChildren(el('div', 'hint', snap.noHand ? 'Time! No hand seen, so no guess.' : 'Locked in: ' + snap.count));
    send({ t: 'guess', n: round.n, ...round.guessMsg });
  }
  later(9000, () => { if (round && !round.resolved) { showBanner('LOST CONNECTION?', 'Waiting for your opponent…', 2500); } });
  tryResolve();
}

function tryResolve() {
  if (!round || round.resolved || !round.reveal || !round.guessMsg) return;
  round.resolved = true;
  round.phase = 'result';
  const { pointer, reveal, guessMsg } = round;
  const result = resolveRound({ pointer, count: reveal.count, guess: guessMsg.guess, gesture: reveal.gesture, noHand: reveal.noHand, crits: settings.crits });
  const before = { ...game.health };
  game = applyResult(game, result);
  showReveal(pointer, reveal, guessMsg, result);
  playResult(result, reveal, before);
}

/**
 * The picture of a hand for the reveal. Real photos are shown only in private matches (and only if I allow it);
 * everything else, and every fallback, is DRAWN here from the finger data, so a stranger can't push an image at me.
 */
function buildPicture(msg) {
  const photoView = !SAFE_VIEWS.includes(msg.view);
  if (photoView && msg.photo && allowPhotos() && showPhotos) {
    const img = el('img');
    img.alt = 'Hand';
    img.src = msg.photo;
    return img;
  }
  const c = document.createElement('canvas');
  c.width = 240; c.height = 180;
  drawFromMessage(c.getContext('2d'), 240, 180, msg);
  return c;
}

function showReveal(pointer, reveal, guessMsg, result) {
  // the pointer's side: picture, number, gesture
  const card = el('div', 'reveal');
  if (!reveal.noHand) card.append(buildPicture(reveal));
  const big = el('div', 'big', reveal.noHand ? '?' : String(reveal.count));
  big.append(el('small', '', reveal.noHand ? 'no hand seen' : 'fingers'));
  card.append(big);
  if (reveal.gesture && settings.crits) card.append(el('span', 'badge', GESTURE_NAMES[reveal.gesture]));
  contentEl(pointer).replaceChildren(card);
  // the guesser's side: their fingers, the guess, and whether it was right
  const g = el('div', 'reveal');
  if (guessMsg.guess !== null) g.append(buildPicture(guessMsg));
  const gb = el('div', 'big', guessMsg.guess === null ? '–' : String(guessMsg.guess));
  gb.append(el('small', '', guessMsg.guess === null ? 'no guess' : 'guess'));
  g.append(gb, el('span', result.reason === 'correct' ? 'badge ok' : 'badge no', result.reason === 'correct' ? 'CORRECT' : 'WRONG'));
  contentEl(other(pointer)).replaceChildren(g);
}

// ---------------------------------------------------------------------------------------------
// Fight animation
// ---------------------------------------------------------------------------------------------
function centerOf(side) {
  const r = fighterEl(side).getBoundingClientRect();
  const g = $('game').getBoundingClientRect();
  return { x: r.left + r.width / 2 - g.left, y: r.top + r.height / 2 - g.top };
}

function spark(side, crit, damage) {
  const p = centerOf(side);
  const s = el('div', 'spark' + (crit ? ' crit' : ''));
  s.style.left = p.x + 'px'; s.style.top = p.y + 'px';
  $('fx').append(s);
  setTimeout(() => s.remove(), 700);
  const d = el('div', 'dmg' + (crit ? ' crit' : ''), '-' + damage);
  d.style.left = p.x + 'px'; d.style.top = p.y + 'px';
  $('fx').append(d);
  setTimeout(() => d.remove(), 1200);
}

function shake(big) {
  const g = $('game');
  g.classList.remove('shake', 'shake-big', 'flash');
  void g.offsetWidth;                               // restart the animation
  g.classList.add(big ? 'shake-big' : 'shake');
  if (big) g.classList.add('flash');
  setTimeout(() => g.classList.remove('shake', 'shake-big', 'flash'), 700);
}

function playResult(result, reveal, before) {
  const text = describe(result, round.pointer, me);
  if (!result.target) {
    sfx.miss();
    fighterEl(round.pointer).classList.add('taunt');
    later(500, () => showBanner('MISS', text, 1500));
    return finishRound(1800);
  }
  const target = result.target, attacker = other(target);
  later(500, () => { fighterEl(attacker).classList.add('punch'); sfx.whoosh(); });
  later(850, () => {
    fighterEl(target).classList.add('hit');
    spark(target, result.crit, result.damage);
    shake(result.crit);
    (result.crit ? sfx.crit : sfx.hit).call(sfx);
    if (navigator.vibrate) navigator.vibrate(result.crit ? [60, 40, 90] : 50);
    renderHp(target, before[target]);
    if (result.crit) {
      fighterEl(attacker).classList.add('crit-fx');
      showBanner('CRITICAL!', GESTURE_NAMES[reveal.gesture] + ' (−' + result.damage + ')', 1700, 'crit');
    } else if (result.reason === 'nohand') {
      showBanner('NO HAND!', text, 1500, 'good');
    } else {
      showBanner('HIT!', text, 1300, 'good');
    }
  });
  later(1700, () => { for (const s of ['host', 'guest']) fighterEl(s).classList.remove('punch', 'hit', 'taunt', 'crit-fx'); });
  finishRound(2600);
}

function finishRound(ms) {
  if (game.over) { later(ms, knockout); return; }
  if (me === 'host') later(ms + 1500, nextRound);
}

function knockout() {
  const loser = other(game.winner), winner = game.winner;
  fighterEl(loser).classList.remove('idle'); fighterEl(loser).classList.add('ko');
  fighterEl(winner).classList.remove('idle'); fighterEl(winner).classList.add('win');
  sfx.ko();
  showBanner('K.O.', '', 2200, 'crit');
  later(2600, () => {
    inGame = false;
    const won = winner === me;
    $('overTitle').textContent = won ? 'YOU WIN!' : 'YOU LOSE';
    $('overText').textContent = names[winner] + ' wins ' + (game.health[winner]) + ' hit' + (game.health[winner] === 1 ? '' : 's') + ' to ' + game.health[loser] + '.';
    $('againBtn').hidden = false;
    $('againBtn').disabled = me !== 'host';
    $('againBtn').textContent = me === 'host' ? 'Play again' : 'Waiting for host…';
    $('overMsg').textContent = '';
    show('over');
    if (won) sfx.win();
  });
}

$('againBtn').onclick = () => {
  if (me !== 'host' || !link?.open) return;
  send({ t: 'start', settings });
  startGame();
};

// ---------------------------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------------------------
function resetAll() {
  token++;
  inGame = false;
  round = null;
  game = null;
  releaseCamera();
  if (link) { link.closed = true; try { link.close(); } catch { /* ignore */ } }
  link = null;
  me = null;
  names = { host: '', guest: '' };
  ready = { host: false, guest: false };
  settings = { ...DEFAULTS };
  if (cam && !SIM) { try { cam.stream?.getTracks().forEach(t => t.stop()); } catch { /* ignore */ } }
  cam = null; camReady = false;
  matchKind = null; roomCodeRaw = ''; pendingGuest = null; autoStarted = false;
  clearTimeout(helloTimer);
  matchWaiter = null; hostWaiter = null;
  if (searching) { searchId++; setSearching(false); }
  $('camBtn').disabled = false;
  $('camStatus').textContent = '';
  $('banner').replaceChildren();
  setBackground(0);
}

setBackground(0);
show('menu');
