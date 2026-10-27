// Finger Fight: the controller. Screens (menu, lobby, game, over), the room link, and the round state machine.
//
// A round: the POINTER holds up fingers while the GUESSER guesses the total. When the timer ends the pointer's phone
// snaps a photo + the count + any gesture and sends it; the guesser's phone sends the guess. Each side then runs
// resolveRound() on the same inputs, so both screens show the same result. The host starts every round.
import { sfx, music } from './audio.js';
import * as fx from './fx.js';
import { Link, newCode, cleanCode, formatCode, privateId, randomId, CODE_LEN, newToken, validToken } from './net.js';
import { HandCam, SimCam } from './hands.js';
import { SKINS, drawAvatar, drawFromMessage, statesFromCount, skinById } from './avatars.js';
import {
  DEFAULTS, normalizeSettings, newGame, pointerFor, other, resolveRound, applyResult, describe,
  sanitizeName, validGuessMsg, validReveal, VIEWS, SAFE_VIEWS, RANDOM_SLOTS,
} from './logic.js';
import { fighterSVG, backgroundHTML, BACKGROUNDS, GESTURE_NAMES } from './fighters.js';
import { classifyHands, loadTuning } from './gestures.js';
import { createDebugPanel } from './debug.js';
import { hasRelay } from './ice.js';

const missingIds = [];
/** A missing element must not stop the whole script (every handler after it would stay dead); it is reported on screen instead. */
const $ = id => document.getElementById(id) || (missingIds.push(id), document.createElement('div'));

/** Anything that goes wrong in the page is written on screen (in whichever message line is visible), so a silent failure can be reported. */
function showFatal(e) {
  const text = String(e?.message || e || 'unknown error');
  if (/ResizeObserver|^Script error/i.test(text)) return;
  for (const id of ['camStatus', 'lobbyMsg', 'menuMsg', 'calibMsg']) { try { const m = $(id); m.textContent = 'Error: ' + text; m.classList.add('err'); } catch { /* not there */ } }
}
globalThis.addEventListener?.('error', ev => showFatal(ev.error || ev.message));
globalThis.addEventListener?.('unhandledrejection', ev => showFatal(ev.reason));
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
let streak = { side: null, n: 0 };      // consecutive landed hits by one side (combo pulse)
let fightLog = [];                       // every resolved round of this game, for the final collage
let inGame = false;
let token = 0;                          // bumped to cancel pending timeouts from an old round or game
let bannerTimer = null;

let matchKind = null;                   // 'private' (friends, long code) | 'random' (strangers: cartoon/skeleton only)
let roomCodeRaw = '';                   // the private match code, without dashes
let pendingGuest = null;                // private match: a guest waiting for the host to accept
let requireApproval = true;             // host: ask before someone joins a private match
let hideRude = store_get('ff-rude') !== '0';   // default ON: never show a rude gesture, only the number (my own choice, on my phone)
let showPhotos = true;                  // private match: display a friend's real photo if they send one
let helloTimer = null;                  // host: drop a connection that never says hello
let searching = false, searchId = 0;    // random matchmaking in progress
let matchWaiter = null, hostWaiter = null;
let autoStarted = false;
let opponentGone = false;               // the other phone closed after the fight was decided
let hideIp = store_get('ff-hideip') !== '0';   // random matches go through the relay only, so a stranger never sees my IP address
let guestToken = null;                  // host: the resume token the pending guest offered in hello

const MODE_LABELS = {
  avatar: 'Cartoon hand', skeleton: 'Skeleton', blur: 'Blurred photo + skeleton', 'photo-skeleton': 'Photo + skeleton', photo: 'Photo (real camera)',
};
// what I show my opponent: a view mode and a cartoon skin (remembered on this phone)
let style = { mode: VIEWS.includes(store_get('ff-mode')) ? store_get('ff-mode') : 'avatar', skin: initialSkin() };

/** The skin I draw with: the one I picked, or (default / 'random') a different random skin every time I start. */
function initialSkin() {
  const saved = store_get('ff-skin');
  return saved && saved !== 'random' && SKINS.some(s => s.id === saved) ? saved : SKINS[Math.floor(Math.random() * SKINS.length)].id;
}
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
  if (id === 'menu') { updateRejoin(); music.stop(); }
  else if (currentBg >= 0) music.setArena(currentBg);      // lobby / game / result: the arena's loop (lazy, silent if the file is missing)
}

let currentBg = -1;
function setBackground(i) {
  if (i === currentBg) return;
  currentBg = i;
  $('stage').className = 'bg-' + i;
  $('scenery').innerHTML = backgroundHTML(i);      // fixed artwork, no user text
  if ($('menu').hidden) music.setArena(i);
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
const renderSound = () => { $('muteBtn').textContent = 'Sound: ' + (sfx.muted ? 'off' : 'on'); };
$('muteBtn').onclick = () => { sfx.unlock(); sfx.setMuted(!sfx.muted); renderSound(); };
$('volSlider').value = String(Math.round(sfx.volume * 100));
$('volSlider').oninput = e => { sfx.unlock(); sfx.setVolume(Number(e.target.value) / 100); if (sfx.muted && Number(e.target.value) > 0) { sfx.setMuted(false); renderSound(); } };
$('volSlider').onchange = () => sfx.ui();
renderSound();
// every button gets a small tap sound (capture phase, so it also covers buttons built later)
document.addEventListener?.('click', e => { if (e.target?.closest?.('button')) { sfx.unlock(); sfx.ui(); } }, true);
fx.initFx($('game'));

const renderIp = () => { $('ipBtn').textContent = 'Hide my IP from strangers: ' + (hideIp ? 'on' : 'off'); };
$('ipBtn').onclick = () => { hideIp = !hideIp; store.set('ff-hideip', hideIp ? '1' : '0'); renderIp(); };
renderIp();

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
    canResume: () => !searching && !!names.host && !!names.guest,
    onReconnecting: () => netBadge('Connection lost. Reconnecting…'),
    onReconnected: () => onReconnected(),
    onStatus: t => { if (!quiet) menuMsg(t); },
  }, { relay: matchKind === 'random' && hideIp });
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
    link.setToken(newToken());
    await link.join(privateId(code));
  } catch (e) {
    const why = {
      'no-room': 'There is no match with that code (or the host already left).',
      timeout: 'Found the match but could not open a direct link in 15 s. One of the two networks (a VPN, school/work wifi or a strict firewall) is probably blocking it. Try the other device on mobile data or without the VPN.' + (hasRelay() ? '' : ' (No relay server is set up for this game yet, so blocked networks cannot work around it.)'),
      network: 'Could not reach the matchmaking server (0.peerjs.com). Check this device\'s internet, VPN or ad-blocker.',
      'server-error': 'The matchmaking server did not answer. Try again in a minute.',
      'socket-error': 'Could not reach the matchmaking server. Check internet, VPN or ad-blocker.',
      'socket-closed': 'The matchmaking connection was closed. Try again.',
      webrtc: 'This browser could not set up the peer link (WebRTC).',
      'browser-incompatible': 'This browser does not support the peer link (WebRTC).',
    }[e.message];
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
  if (hideIp && !hasRelay()) {      // relay-only needs a TURN relay (see ice.js); without one a random match could never connect
    menuMsg('Random matches hide your IP behind a relay server, and none is set up yet. Turn off "Hide my IP from strangers" to play random opponents directly (they could then see your IP address), or invite a friend with a private match.', true);
    return;
  }
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
  menuMsg('No opponent found right now. Try again in a minute.' + (hideIp ? ' (If this keeps happening, the relay may be blocked on this network.)' : ''), true);
};

// ---------------------------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------------------------
const allowPhotos = () => matchKind === 'private';          // random opponents never send, and are never shown, photos
const pictureOf = m => ({ photo: m.photo, view: m.view, skin: m.skin, hands: m.hands, lm: m.lm, ar: m.ar });

function onLinkOpen() {
  if (me === 'guest') send({ t: 'hello', v: PROTOCOL, kind: matchKind, name: names.guest, token: link?.token || undefined });
  if (me === 'host') {                                     // a connection that never says hello must not hog the room
    clearTimeout(helloTimer);
    helloTimer = setTimeout(() => { if (me === 'host' && !names.guest && !pendingGuest) link?.dropGuest(); }, 8000);
  }
}

function onLinkClosed(reason) {
  if (!me || searching) return;
  if (game?.over) {                                  // the fight is decided: the other phone closing now is normal, keep the result screen
    opponentGone = true;
    $('againBtn').disabled = true;
    if (matchKind === 'private') $('overMsg').textContent = 'Your opponent has left.';
    return;
  }
  const wasPlaying = inGame && game && !game.over;
  const randomFight = wasPlaying && matchKind === 'random';
  const iDropped = reason !== 'left' && globalThis.navigator?.onLine === false;
  clearSession();
  if (randomFight && !iDropped) { forfeitWin(); return; }       // a stranger who drops or quits the fight loses it
  resetAll();
  show('menu');
  menuMsg(randomFight ? 'You lost the match: your connection dropped.'
    : wasPlaying ? 'Your opponent left the fight.' : 'The connection closed (' + reason + ').', true);
}

/** Random match: the other player is gone mid-fight. I win; the connection is finished, nothing more is accepted. */
function forfeitWin() {
  token++;
  releaseCamera();
  round = null;
  inGame = false;
  game.over = true; game.winner = me;
  try { link?.close(); } catch { /* ignore */ }
  link = null;
  $('overTitle').textContent = 'YOU WIN!';
  $('overText').textContent = names[other(me)] + ' disconnected, so you win by forfeit.';
  $('againBtn').hidden = true;
  $('overMsg').textContent = 'Random matches end here. Find another opponent from the menu.';
  show('over');
  sfx.win();
}

// ---- reconnecting and rejoining (private matches only)
const SESSION_KEY = 'ff-session';
const SESSION_MAX_AGE = 3 * 60 * 1000;     // long enough to reload the page or switch apps, short enough to never be stale
function saveSession() {
  if (matchKind !== 'private' || !link?.token || !me) return;
  store.set(SESSION_KEY, JSON.stringify({ role: me, code: roomCodeRaw, token: link.token, names, t: Date.now() }));
}
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } updateRejoin(); }
function loadSession() {
  try {
    const x = JSON.parse(store.get(SESSION_KEY) || 'null');
    if (!x || (x.role !== 'host' && x.role !== 'guest') || x.code?.length !== CODE_LEN || !validToken(x.token) || Date.now() - x.t > SESSION_MAX_AGE) return null;
    return { role: x.role, code: cleanCode(x.code), token: x.token, names: { host: sanitizeName(x.names?.host), guest: sanitizeName(x.names?.guest) } };
  } catch { return null; }
}
function updateRejoin() {
  const x = loadSession();
  $('rejoinBtn').hidden = !x;
  if (x) $('rejoinBtn').textContent = 'Rejoin your last match (' + (x.role === 'host' ? x.names.guest || 'friend' : x.names.host || 'host') + ')';
}

function netBadge(text) {
  $('netBadge').textContent = text;
  $('netBadge').hidden = !text;
}

function onReconnected() {
  netBadge('');
  showBanner('RECONNECTED', '', 1200);
  send({ t: 'ready', ready: ready[me] });
  if (me !== 'host') return;
  send({ t: 'settings', settings });
  if (inGame && game && !game.over) {
    // an unresolved round is replayed from scratch: nobody loses a hit because of a dropped connection
    if (!round?.resolved) game.round = Math.max(0, (round?.n || game.round) - 1);
    token++;
    round = null; releaseCamera();
    send({ t: 'sync', health: game.health, round: game.round });
    later(1500, nextRound);
  } else if (inGame && game?.over) {
    send({ t: 'sync', health: game.health, round: game.round, over: true, winner: game.winner });
  }
}

function applySync(m) {
  const max = settings.hits;
  const hp = v => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);
  const h = hp(m.health?.host), g = hp(m.health?.guest);
  if (h === null || g === null || !Number.isInteger(m.round) || m.round < 0 || m.round > 999) return;
  game.health = { host: h, guest: g };
  game.round = m.round;
  renderHp('host'); renderHp('guest');
  if (m.over && (m.winner === 'host' || m.winner === 'guest') && !game.over) {
    game.over = true; game.winner = m.winner;
    token++; knockout();
    return;
  }
  if (!m.over) { token++; round = null; releaseCamera(); }
}

$('rejoinBtn').onclick = async () => {
  sfx.unlock();
  const x = loadSession();
  if (!x) { updateRejoin(); return; }
  resetAll();
  matchKind = 'private'; me = x.role; names = { ...x.names }; roomCodeRaw = x.code;
  menuMsg('Rejoining…');
  link = makeLink();
  try {
    if (x.role === 'guest') await link.join(privateId(x.code), 20000, x.token);
    else { link.setToken(x.token); await link.rehost(privateId(x.code)); }
  } catch (e) {
    menuMsg(x.role === 'guest' ? 'Could not rejoin. The match may be over.' : 'Could not reopen the match (' + e.message + '). Try again in a minute.', true);
    resetAll(); clearSession();
    return;
  }
  $('roomCode').textContent = formatCode(x.code);
  enterLobby();
  if (x.role === 'guest') { send({ t: 'ready', ready: ready.guest }); }
  else menuMsg('');
  saveSession();
};

function acceptGuest(name) {
  pendingGuest = null;
  names.guest = name;
  link?.setToken(guestToken);
  saveSession();
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
      guestToken = validToken(m.token) ? m.token : null;
      if (matchKind === 'private' && requireApproval) { pendingGuest = sanitizeName(m.name); renderLobby(); }
      else acceptGuest(sanitizeName(m.name));
      break;
    case 'welcome':                                 // guest: accepted; here are the host's details
      if (me !== 'guest' || m.kind !== matchKind) break;
      names.host = sanitizeName(m.name);
      settings = normalizeSettings(m.settings);
      ready.host = m.ready === true;
      send({ t: 'ready', ready: ready.guest });
      saveSession();
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
    case 'sync':                                    // guest: the host's view of the fight after a reconnect
      if (me !== 'guest' || !inGame || !game) break;
      applySync(m);
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
  const dice = el('button', 'dice', '🎲');
  dice.type = 'button'; dice.title = 'A random skin every match';
  dice.dataset.skin = 'random';
  dice.onclick = () => { store.set('ff-skin', 'random'); style.skin = initialSkin(); renderStyle(); };
  skins.append(dice);
  $('photoBtn').onclick = () => { showPhotos = !showPhotos; renderStyle(); };
  $('rudeBtn').onclick = () => { hideRude = !hideRude; store.set('ff-rude', hideRude ? '1' : '0'); renderStyle(); };
  renderStyle();
}

function renderStyle() {
  const random = matchKind === 'random';
  if (random && !SAFE_VIEWS.includes(style.mode)) style.mode = 'avatar';
  for (const b of $('modePicker').children) {
    b.classList.toggle('sel', b.dataset.mode === style.mode);
    b.disabled = random && !SAFE_VIEWS.includes(b.dataset.mode);
  }
  const randomPick = store.get('ff-skin') === 'random' || !store.get('ff-skin');
  for (const b of $('skinPicker').children) b.classList.toggle('sel', b.dataset.skin === 'random' ? randomPick : (!randomPick && b.dataset.skin === style.skin));
  $('skinRow').hidden = style.mode !== 'avatar';
  $('photoRow').hidden = random;
  $('photoBtn').textContent = showPhotos ? 'On' : 'Off';
  $('photoBtn').classList.toggle('on', showPhotos);
  $('rudeBtn').textContent = hideRude ? 'On' : 'Off';
  $('rudeBtn').classList.toggle('on', hideRude);
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
  $('valMax').textContent = settings.maxFingers;
  $('approveBtn').textContent = requireApproval ? 'On' : 'Off';
  $('approveBtn').classList.toggle('on', requireApproval);
  $('approveRow').hidden = !(matchKind === 'private' && me === 'host');
  [...$('bgPicker').children].forEach((b, i) => b.classList.toggle('sel', i === settings.background));
  setBackground(settings.background);
  $('settingsCard').hidden = random;
  $('settingsCard').classList.toggle('locked', me !== 'host');
  $('joinPrompt').hidden = !pendingGuest;
  if (pendingGuest) $('joinPrompt').scrollIntoView?.({ block: 'nearest' });
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
  clearSession();
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
  cam = cam || (SIM ? new SimCam() : new HandCam($('video'), $('overlayCanvas')));
  hookCamera();
  const slow = setTimeout(() => status('Still loading the hand model… this is slow. It is a one-time download (about 17 MB); keep this page open.'), 20000);
  try {
    await cam.load();
  } catch (e) {
    clearTimeout(slow);
    status('Could not load the hand model (' + (e.message || e) + '). Check your internet connection (or a VPN / ad-blocker blocking cdn.jsdelivr.net or storage.googleapis.com).');
    $('camBtn').disabled = false;
    return;
  }
  clearTimeout(slow);
  let err;
  try { err = await cam.startCamera(); } catch (e) { err = 'Could not start the camera (' + (e.message || e) + ').'; }
  if (err === 'cancelled') { $('camBtn').disabled = false; return; }
  if (err) { status(err); $('camBtn').disabled = false; return; }
  cam.stopCamera();                              // permission and model are checked; the camera stays OFF until a guess window opens
  camReady = true;
  ready[me] = true;
  status('Camera ready. It switches on only while you guess, and off at the snap.');
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
  saveSession();
  token++;
  inGame = true;
  game = newGame(settings);
  round = null;
  fightLog = []; streak = { side: null, n: 0 };
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
  const pointing = pointer === me;
  $('mid').className = pointing ? 'point' : 'guess';
  $('roleLabel').replaceChildren(el('b', '', pointing ? 'YOU POINT' : 'YOU GUESS'), el('small', '', pointing ? 'hold up fingers; they guess' : 'guess how many they hold'));
  $('timerNum').textContent = settings.seconds;
  $('timerWrap').classList.remove('urgent');
  $('timerBar').firstElementChild.style.transform = 'scaleX(1)';
  for (const side of ['host', 'guest']) { contentEl(side).replaceChildren(); fighterEl(side).className = 'fighter idle'; }
  releaseCamera();
  fx.wipe();
  showBanner('ROUND ' + n, '', 1000);
  later(1100, () => { showBanner(pointer === me ? 'YOU POINT' : 'YOU GUESS', pointer === me ? 'Hold up your fingers! They will guess the number.' : 'Show your guess with your fingers!', 1000); sfx.roundStart(); });
  later(1900, startGuessPhase);
}

async function startGuessPhase() {
  const t = token;
  round.phase = 'guess';
  contentEl(other(me)).replaceChildren(el('div', 'thinking', '✋ ???'));   // their hand stays hidden until the reveal
  if (!SIM) {
    const err = await cam.startCamera();                             // the camera is switched on only now, for this one guess window
    if (t !== token || !round) { cam.release(); camIndicator(false); return; }
    if (err) $('camStatus').textContent = err;
    camIndicator(!err);
  }
  setupCameraUI();                                                   // both players hold up fingers to their own camera
  runTimer(settings.seconds);
}

/** A red "camera on" badge that is visible exactly while the camera is running. */
function camIndicator(on) { $('camLive').hidden = !on; }

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
  const lim = settings.maxFingers < 10 ? ' (max ' + settings.maxFingers + ')' : '';
  const caption = (pointing ? 'POINT: hold up your fingers' : 'GUESS: show the number with your fingers') + lim;
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
    for (let c = 0; c <= settings.maxFingers; c++) { const b = btn(String(c), () => { cam.set({ count: c }); refresh(); }); b.dataset.count = c; wrap.append(b); }
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
  if (debugWanted) { cam.debug = true; debugPanel().show(true); }
  cam.onFrame = s => {
    dbg?.update(s);
    $('liveCount').textContent = Math.min(s.count, settings.maxFingers);
    // gestures never score; the label is shown only to the pointer and only if the rude-gesture filter is off
    $('liveGesture').textContent = pointing && s.gesture && !hideRude ? GESTURE_NAMES[s.gesture] : '';
  };
  cam.run();
}

// ---------------------------------------------------------------------------------------------
// Debug panel + camera test (calibration) + camera safety hooks
// ---------------------------------------------------------------------------------------------
loadTuning();                                   // thresholds the player adjusted earlier (saved on this phone)
let dbg = null;                                 // the debug panel, built on first use
const debugPanel = () => (dbg = dbg || createDebugPanel(document.body));

/** If the camera stops by itself (permission taken away, another app, unplugged) the badge must go out and the player is told. */
function hookCamera() {
  if (!cam || SIM) return;
  cam.onLost = () => {
    camIndicator(false);
    const b = $('camBox'); b.hidden = true;
    if (round && round.phase === 'guess') showBanner('CAMERA STOPPED', 'Check the camera permission. No hand = no guess.', 2500);
    if (!$('calib').hidden) $('calibMsg').textContent = 'The camera stopped. Check the browser camera permission, then tap Done and try again.';
    dbg?.show(false);
  };
}

let debugWanted = false;                        // the player's choice for in-match debugging; the panel is re-shown each round
$('dbgBtn').onclick = () => {
  if (!cam || SIM) return;
  debugWanted = !debugWanted;
  debugPanel().show(debugWanted);
  cam.debug = debugWanted;
};

async function openCalib() {
  sfx.unlock();
  show('calib');
  if (SIM) { $('calibMsg').textContent = 'The simulator has no camera.'; return; }
  const msg = t => { $('calibMsg').textContent = t; };
  msg('Loading the hand model (about 17 MB, once)…');
  cam = cam || new HandCam($('video'), $('overlayCanvas'));
  hookCamera();
  try { await cam.load(); } catch (e) { msg('Could not load the hand model (' + (e.message || e) + ').'); return; }
  if ($('calib').hidden) return;                                   // the player already left
  const err = await cam.startCamera();
  if (err === 'cancelled' || $('calib').hidden) { if (err !== 'cancelled') closeCalib(); return; }
  if (err) { msg(err); return; }
  const box = $('camBox');
  $('calibBox').replaceChildren(box);
  box.hidden = false;
  $('camCaption').textContent = 'Hold up fingers. Numbers are below.';
  $('camCaption').className = 'guess';
  camIndicator(true);
  cam.debug = true;
  const p = debugPanel(); p.show(true);
  cam.onFrame = s => { p.update(s); $('liveCount').textContent = s.count; $('liveGesture').textContent = s.gesture && !hideRude ? GESTURE_NAMES[s.gesture] : ''; };
  msg('Camera on (it switches off when you tap Done). Try each finger and watch the ratios.');
  cam.run();
}
function closeCalib() {
  if (cam && !SIM) { cam.release(); cam.onFrame = null; cam.debug = false; }
  camIndicator(false);
  const box = $('camBox'); box.hidden = true; if (box.parentElement !== document.body) document.body.append(box);
  dbg?.show(false);
  show('menu');
}
$('calibBtn').onclick = openCalib;
$('calibDone').onclick = closeCalib;

function releaseCamera() {
  if (!cam || SIM) return;
  cam.release();
  cam.onFrame = null;
  cam.debug = false;
  dbg?.show(false);
  camIndicator(false);
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
    // the guess is the number of fingers you held up (a closed fist is 0); no hand at all = no guess
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
  const { pointer } = round;
  // quicker matches: anything above the limit counts as the limit (and is drawn as a plain hand of that many fingers)
  const max = settings.maxFingers;
  const plain = (m, n) => ({ ...m, view: 'avatar', photo: '', lm: null, gesture: null, hands: statesFromCount(n) });
  const reveal = round.reveal.count > max ? { ...plain(round.reveal, max), count: max } : round.reveal;
  const guessMsg = round.guessMsg.guess !== null && round.guessMsg.guess > max ? { ...plain(round.guessMsg, max), guess: max } : round.guessMsg;
  const result = resolveRound({ pointer, count: reveal.count, guess: guessMsg.guess, noHand: reveal.noHand });
  fightLog.push({ n: round.n, pointer, reveal, guessMsg, reason: result.reason });
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

/** Does this picture show a rude gesture? Uses the sender's gesture flag, the hand landmarks, and the finger flags. */
function looksRude(msg) {
  if (msg.gesture) return true;
  if (Array.isArray(msg.hands) && msg.hands.some(h => h.middle && !h.index && !h.ring && !h.pinky)) return true;   // only the middle finger up
  if (Array.isArray(msg.lm) && msg.lm.length) {
    const hands = msg.lm.map(h => h.map(([x, y]) => ({ x: x / 1000, y: y / 1000 })));
    if (classifyHands(hands, msg.ar || 1)) return true;
  }
  return false;
}

/** With the filter on, a rude picture is replaced by a plain drawn hand with the same number of fingers. */
function filtered(msg) {
  if (!hideRude || !looksRude(msg)) return msg;
  const n = Array.isArray(msg.hands) ? msg.hands.reduce((a, h) => a + Object.values(h).filter(Boolean).length, 0) : 0;
  return { ...msg, gesture: null, view: 'avatar', photo: '', lm: null, hands: statesFromCount(Math.min(10, Number.isInteger(msg.count) ? msg.count : n)) };
}

function showReveal(pointer, reveal, guessMsg, result) {
  reveal = filtered(reveal);
  guessMsg = guessMsg.guess === null ? guessMsg : filtered(guessMsg);
  // the pointer's side: picture, number
  const card = el('div', 'reveal');
  if (!reveal.noHand) card.append(buildPicture(reveal));
  const big = el('div', 'big', reveal.noHand ? '?' : String(reveal.count));
  big.append(el('small', '', reveal.noHand ? 'no hand seen' : 'fingers'));
  card.append(big);
  if (reveal.gesture && !hideRude) card.append(el('span', 'badge', GESTURE_NAMES[reveal.gesture]));   // shown, never scored
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

function spark(side, strong, damage) {
  const p = centerOf(side);
  const s = el('div', 'spark' + (strong ? ' crit' : ''));
  s.style.left = p.x + 'px'; s.style.top = p.y + 'px';
  $('fx').append(s);
  setTimeout(() => s.remove(), 700);
  const d = el('div', 'dmg' + (strong ? ' crit' : ''), '-' + damage);
  d.style.left = p.x + 'px'; d.style.top = p.y + 'px';
  $('fx').append(d);
  setTimeout(() => d.remove(), 1200);
}

function playResult(result, reveal, before) {
  const text = describe(result, round.pointer, me);
  if (!result.target) {
    streak = { side: null, n: 0 };
    // a wrong guess is a BLOCK (the pointer defended); no hand / no guess is a plain miss
    if (result.reason === 'miss') { sfx.block(); const p = centerOf(round.pointer); fx.burst(p.x, p.y, { color: '#93c5fd', power: 0.5 }); }
    else sfx.miss();
    fighterEl(round.pointer).classList.add('taunt');
    later(500, () => showBanner(result.reason === 'miss' ? 'BLOCKED' : 'MISS', text, 1500));
    return finishRound(1800);
  }
  const target = result.target, attacker = other(target);
  later(500, () => { fighterEl(attacker).classList.add('punch'); sfx.whoosh(); });
  later(850, () => {
    fighterEl(target).classList.add('hit');
    // strength: 1 for a normal hit, more when it takes the last hit point, and a little more along a streak
    streak = streak.side === attacker ? { side: attacker, n: streak.n + 1 } : { side: attacker, n: 1 };
    const lethal = game.health[target] === 0;
    const strength = lethal ? 2 : 1 + Math.min(0.6, (streak.n - 1) * 0.25);
    const p = centerOf(target);
    spark(target, lethal, result.damage);
    fx.burst(p.x, p.y, { color: lethal ? '#f43f5e' : '#fde047', power: strength });
    fx.shake(strength); fx.flash(strength);
    sfx.hit(strength);
    if (navigator.vibrate) navigator.vibrate(lethal ? [60, 40, 90] : 50);
    renderHp(target, before[target]);
    if (streak.n >= 2) { fx.combo(streak.n, centerOf(attacker).x, centerOf(attacker).y); }
    showBanner('HIT!', text, 1300, 'good');
  });
  later(1700, () => { for (const s of ['host', 'guest']) fighterEl(s).classList.remove('punch', 'hit', 'taunt', 'crit-fx'); });
  finishRound(2600);
}

function finishRound(ms) {
  later(Math.max(0, ms - 500), () => sfx.roundEnd());
  if (game.over) { later(ms, knockout); return; }
  if (me === 'host') later(ms + 1500, nextRound);
}

/** The final screen: every round as a column, player 1's hand above and player 2's below. A correct guess is tinted green. */
function renderCollage() {
  const box = $('collage');
  box.replaceChildren();
  box.hidden = fightLog.length === 0;
  if (!fightLog.length) return;
  const grid = el('div', 'cg');
  const lab = el('div', 'cg-lab');
  lab.append(el('div', 'cg-n', ''), el('div', 'cg-name', names.host + (me === 'host' ? ' (you)' : '')), el('div', 'cg-name', names.guest + (me === 'guest' ? ' (you)' : '')));
  grid.append(lab);
  const tile = (msg, isPointer, h) => {
    const none = isPointer ? msg.noHand : msg.guess === null;
    const correct = !isPointer && h.reason === 'correct';
    const t = el('div', 'cg-tile' + (correct ? ' ok' : ''));
    t.append(none ? el('div', 'cg-none', 'no hand') : buildPicture(filtered(msg)));
    const value = isPointer ? (msg.noHand ? '?' : msg.count) : (msg.guess === null ? '–' : msg.guess);
    t.append(el('div', 'cg-cap', (isPointer ? 'showed ' : 'guessed ') + value));
    if (correct) t.append(el('div', 'cg-ok', 'GUESSED IT!'));
    return t;
  };
  for (const h of fightLog) {
    const col = el('div', 'cg-col');
    col.append(el('div', 'cg-n', 'Round ' + h.n));
    const hostPoints = h.pointer === 'host';
    col.append(tile(hostPoints ? h.reveal : h.guessMsg, hostPoints, h), tile(hostPoints ? h.guessMsg : h.reveal, !hostPoints, h));
    grid.append(col);
  }
  box.append(grid);
}

function knockout() {
  const loser = other(game.winner), winner = game.winner;
  fighterEl(loser).classList.remove('idle'); fighterEl(loser).classList.add('ko');
  fighterEl(winner).classList.remove('idle'); fighterEl(winner).classList.add('win');
  sfx.ko();
  { const p = centerOf(loser); fx.burst(p.x, p.y, { color: '#f43f5e', power: 2 }); fx.shake(2.2); fx.flash(2); }
  showBanner('K.O.', '', 2200, 'crit');
  later(2600, () => {
    inGame = false;
    const won = winner === me;
    $('overTitle').textContent = won ? 'YOU WIN!' : 'YOU LOSE';
    $('overText').textContent = names[winner] + ' wins ' + (game.health[winner]) + ' hit' + (game.health[winner] === 1 ? '' : 's') + ' to ' + game.health[loser] + '.';
    clearSession();                                    // the match is over: nothing to rejoin
    if (matchKind === 'random') {                      // strangers: the connection ends with the match, no rematch
      try { link?.close(); } catch { /* ignore */ }
      link = null;
      $('againBtn').hidden = true;
      $('overMsg').textContent = 'Random matches end here. Find another opponent from the menu.';
    } else {
      $('againBtn').hidden = false;
      $('againBtn').disabled = me !== 'host' || opponentGone;
      $('againBtn').textContent = me === 'host' ? 'Play again' : 'Waiting for host…';
      $('overMsg').textContent = opponentGone ? 'Your opponent has left.' : '';
    }
    renderCollage();
    show('over');
    if (won) { sfx.win(); fx.confetti(); } else { sfx.lose(); fx.rain(); }
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
  fightLog = []; streak = { side: null, n: 0 };
  fx.clearFx();
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
  guestToken = null; opponentGone = false; netBadge(''); camIndicator(false);
  matchWaiter = null; hostWaiter = null;
  if (searching) { searchId++; setSearching(false); }
  $('camBtn').disabled = false;
  $('camStatus').textContent = '';
  $('banner').replaceChildren();
  setBackground(0);
}

setBackground(0);
show('menu');
updateRejoin();

// Installable app + offline start (needs HTTPS, so not on the plain-http dev server)
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && location.protocol === 'https:') {
  // Updates: the new worker takes over by itself (skipWaiting + clients.claim). Reload once when that happens: straight away
  // on the menu, but never in the middle of a match, where a small banner asks instead.
  const hadWorker = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadWorker || reloading) return;
    if (!$('menu').hidden) { reloading = true; location.reload(); return; }
    const b = document.createElement('button');
    b.className = 'btn small'; b.type = 'button'; b.textContent = 'Update available: tap to refresh';
    b.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:60';
    b.onclick = () => { reloading = true; location.reload(); };
    document.body.append(b);
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  }).catch(() => { /* not fatal */ });
}

// The camera must never stay on in the background: leave the page (home button, app switch, screen off) and it goes dark.
const camOff = () => { if (cam && !SIM) { cam.release(); camIndicator(false); const b = $('camBox'); b.hidden = true; if (!$('calib').hidden) { $('calibMsg').textContent = 'Camera switched off (the page was hidden). Tap Camera test again.'; dbg?.show(false); } } };
document.addEventListener?.('visibilitychange', () => { if (document.hidden) camOff(); else link?.nudge?.(); });
globalThis.addEventListener?.('pagehide', camOff);
globalThis.addEventListener?.('online', () => link?.nudge?.());       // wifi / 4G came back: re-open the match link now, not at the next timer

if (missingIds.length) setTimeout(() => showFatal('This page is out of date (missing: ' + [...new Set(missingIds)].join(', ') + '). Reload it, or clear this site\'s data in the browser settings.'), 0);
