import { API_URL } from './service-config.js';
import { bindStickyScroll, revealStickyControl } from './panel-scroll.js';
import { Service } from './service.js';
import { Matchmaker } from './matchmaking.js';
import { initSocial } from './social.js';
import { Computer } from './computer.js';
import { FIT_DEFAULT, FIT_LIMITS } from './fit.js';
import { ComicMotion } from './handfx.js';
import { ELEMENTS } from './special-skins.js';
// Finger Fight: the controller. Screens (menu, lobby, game, over), the room link, and the round state machine.
//
// A round: the POINTER holds up fingers while the GUESSER guesses the total. When the timer ends the pointer's phone
// snaps a photo + the count + any gesture and sends it; the guesser's phone sends the guess. Each side then runs
// resolveRound() on the same inputs, so both screens show the same result. The host starts every round.
import { sfx, music, bindPageFocus, TRACK_NAMES } from './audio.js';
import * as fx from './fx.js';
import { Link, newCode, cleanCode, formatCode, privateId, randomId, CODE_LEN, newToken, validToken } from './net.js';
import { HandCam, SimCam } from './hands.js';
import { createWakeLock } from './wake.js';
import { drawFromMessage, drawPuppetPicture, drawViewPreview, drawSkeletonPicture, statesFromCount, previewHandPx, SKELETON_COLOR } from './avatars.js';
import { setMotionStrength } from './dynamics.js';
import { statesToLandmarks } from './puppet.js';
import { skinIds, getSkin, skinIdOf, loadUserSkins, isUserSkin } from './skins.js';
import { loadCatalog, catalog, filterCatalog, entryOf, resolveLoadout, gen, genWire, setGen, rerollPainting } from './cosmetics.js';
import { cleanGc, GC_MIN, GC_MAX, newSeed } from './generated.js';
import { CATEGORIES, CATEGORY_LABELS, LAYERS, LAYER_LABELS, MAX_STACK, PROFILE_LAYERS, SKELETON_STYLES, cleanSkelStyle, INTENSITY_MIN, INTENSITY_MAX, INTENSITY_DEFAULT, cleanColor } from './layers.js';
import { Inventory } from './inventory.js';
import { Stats } from './stats.js';
import { Looks, sameGetup, MAX_LOOKS } from './looks.js';
import { hsvToHex, hexToHsv, drawSV, svAt } from './colorpick.js';
import { unlockItem, unlockLabel } from './unlock.js';
import { ParticleSystem } from './particles.js';
import {
  NAME_MAX, DEFAULTS, normalizeSettings, newGame, pointerFor, other, resolveRound, applyResult, describe,
  sanitizeName, validGuessMsg, validReveal, VIEWS, viewsFor, viewOf, safeViewOf, isSafeView, cameraWarning, RANDOM_SLOTS, RUDE_GESTURES, effectiveMax, effectiveMin, autoCameraWanted, shrinkNotice, turnMessage, HIT_MS, newIdle, trackIdle, IDLE_ROUNDS,
} from './logic.js';
import { cleanName, uniqueName, flagEmoji, countryCode, countryFromText, isObscene } from './names.js';
import { fighterSVG, backgroundHTML, BACKGROUNDS, GESTURE_NAMES } from './fighters.js';
import { isRudeMessage as looksRude, loadTuning } from './gestures.js';
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
let flags = { host: '', guest: '' };       // optional 2-letter country codes the players chose to show (never derived from an IP address)
let pendingFlag = '';
let profile = null;                     // set below: name lives in the input, the rest here (see "Profile")
let settings = { ...DEFAULTS };                   // replaced by freshSettings() once the profile is read
let ready = { host: false, guest: false };   // camera + hand model ready on that phone
let cam = null, camReady = false;
let camBusy = false, camAutoFailed = false;   // auto-start: one attempt per room; a failure leaves the Enable camera button with the reason
let game = null;                        // see logic.js newGame()
let round = null;                       // the round in progress
let streak = { side: null, n: 0 };      // consecutive landed hits by one side (combo pulse)
let fightLog = [];                       // every resolved round of this game, for the final collage
let inGame = false;
const wake = createWakeLock();                 // screen stays on while the game screen is showing
let idle = newIdle();                          // consecutive rounds each player showed no hand (anti-grief)
let token = 0;                          // bumped to cancel pending timeouts from an old round or game
let bannerTimer = null;

let computer=null,customiseReturn='menu',editingMatch=false;
let matchKind = null;                   // 'private' (friends, long code) | 'random' (strangers: puppet/skeleton only)
let roomCodeRaw = '';                   // the private match code, without dashes
let pendingGuest = null;                // private match: a guest waiting for the host to accept
let hideRude = store_get('ff-rude') !== '0';   // default ON: never show a rude gesture, only the number (my own choice, on my phone)
let showPhotos = true;                  // private match: display a friend's real photo if they send one
let helloTimer = null;                  // host: drop a connection that never says hello
let searching = false, searchId = 0;    // random matchmaking in progress
let matchWaiter = null, hostWaiter = null, queueSearch = null, queueCleanup = Promise.resolve();
let autoStarted = false;
let opponentGone = false;               // the other phone closed after the fight was decided
const hideIp = true;                            // always on: random matches go through the relay only, so a stranger never sees my IP address
let guestToken = null;                  // host: the resume token the pending guest offered in hello

const MODE_LABELS = { skeleton: 'Skeleton', puppet: 'Puppet', 'photo-skeleton': 'Photo + skeleton', 'photo-puppet': 'Photo + puppet' };
// what I show my opponent: a view (see VIEWS in logic.js; older saved values are mapped) and a puppet skin (see SKINS.md), both remembered on this phone
try{setGen({fit:JSON.parse(store_get('ff-fit')||'null')});}catch{ /* bad saved fit uses defaults */ }
setGen({ gc: Number(store_get('ff-polylevel')), fi: Number(store_get('ff-fire')), nl: Number(store_get('ff-naillength') ?? 5), el: store_get('ff-element') });                  // how many facets the Geometric hand has (1 chunky - 5 fine), mine; it travels as `gc`
setMotionStrength(10); // Always full idle animation; reduced-motion preference still takes precedence.
let style = { mode: viewOf(store_get('ff-mode')), skin: store_get('ff-puppet') || 'cartoon', baseColor: null, skel: cleanColor(store_get('ff-skel')), skelStyle: cleanSkelStyle(store_get('ff-skelstyle')), stack: [] };   // stack = worn items in the order equipped, last on top: [{id, color}]; see COSMETICS.md
const cust = { on: false };                                           // the Profile's customise / try-on mode (see custBtn)
const tryOn = { on: false, busy: false, token: 0 };      // the live camera try-on in the Store / Profile (see startTryOn)
function store_get(k) { try { return localStorage.getItem(k); } catch { return null; } }
const store = {
  get: store_get,
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
/** Copies what the inventory says is worn into the style that is drawn and sent. */
function takeLoadout() { const L = inv.loadout(); style.skin = L.base; style.baseColor = L.baseColor; style.stack = L.stack; }
const stats = new Stats({ getItem: store_get, setItem: (k, v) => store.set(k, v) });   // local play statistics (this phone only)
const practiceStats=new Stats({getItem:store_get,setItem:(k,v)=>store.set(k,v)},'ff-practice-stats');
const matchStats=()=>matchKind==='computer'?practiceStats:stats;
const savedLooksPanel=$('savedLooksPanel');
let savedLooksOpen=false;
const looks = new Looks({ getItem: store_get, setItem: (k, v) => store.set(k, v) });   // saved looks (this phone only)
const inv = new Inventory({ getItem: store_get, setItem: (k, v) => store.set(k, v) });   // owned items and equipment (this phone only)
takeLoadout();

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------
// ---- the phone's BACK button: while in a room / fight / sub-screen we hold one extra history entry, so Back lands here instead of leaving the site
let currentScreen = 'menu', navPushed = false, ignorePop = 0;
function navPush() { try { globalThis.history.pushState({ ff: 1 }, ''); navPushed = true; } catch { /* no history API */ } }
function navSync(id) {
  const deep = id !== 'menu';
  if (deep && !navPushed) navPush();
  else if (!deep && navPushed) { navPushed = false; ignorePop++; try { globalThis.history.back(); } catch { ignorePop--; } }
}
/** Leaving a room ends the match for both players, so it is always confirmed. */
function askLeave(id) {
  const msg = id === 'game' ? 'Leave the fight? Your opponent will be told you left.'
    : matchKind === 'random' ? 'Leave this match?'
    : 'Leave this room? Your opponent will be told, and the match code stops working until you open a room again.';
  return typeof globalThis.confirm === 'function' ? globalThis.confirm(msg) : true;
}
globalThis.addEventListener?.('popstate', () => {
  if (ignorePop > 0) { ignorePop--; return; }
  if (!navPushed) return;
  navPushed = false;                                      // the browser has already taken our entry away
  if (currentScreen === 'lobby' || currentScreen === 'game' || currentScreen === 'over') {
    if (askLeave(currentScreen)) leave(); else navPush();   // "stay": put the entry back, the room and the connection are untouched
  } else if (currentScreen === 'calib') closeCalib();
  else if(currentScreen==='profile'&&editingMatch)closeMatchCustomise();
  else show('menu');
});

function show(id) {
  if (tryOn.on || tryOn.busy) stopTryOn();                // the try-on camera never outlives its screen
  if (cust.on && id !== 'profile') leaveCust();           // and the Profile's customise mode ends with the Profile
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  currentScreen = id;
  wake.want(id === 'game');
  // the style and sound cards are shared by the Profile screen and the lobby: the same controls, so nothing is duplicated or out of step
  $('custOnly').hidden = !['profile','lobby'].includes(id);                // customise / try-on lives in the Profile only (the lobby shares the opponent-view part)
  if (id === 'store') { $('wearSlotStore').append($('wearCard')); layoutWear('store'); }
  if (id === 'profile') { $('styleSlotProfile').append($('styleCard')); $('appSlotProfile').append($('appCard')); layoutWear('profile'); renderProfileItems(); }
  else if (id === 'lobby') { $('styleSlot').append($('styleCard')); $('appSlot').append($('appCard')); }
  if (id === 'menu') updateRejoin();
  if (id === 'lobby' || id === 'game' || id === 'over') { if (currentMusic >= 0) music.setArena(currentMusic); }   // a match: the arena's loop (lazy, silent if the file is missing)
  else appScene();                                               // everywhere else: my favourite background and song
  if (id === 'profile') renderFav();
  navSync(id);
}

let currentBg = -1, currentMusic = -1;
/** The scenery only; the music is its own choice (setMusic). */
function setBackground(i) {
  if (i === currentBg) return;
  currentBg = i;
  $('stage').className = 'bg-' + i;
  $('scenery').innerHTML = backgroundHTML(i);      // fixed artwork, no user text
}

// ---- favourite background + song (Profile): the menus wear the background and play the song; a new room starts with both (the host can still change them in the lobby)
const clampBg = n => (Number.isInteger(n) && n >= 0 && n < BACKGROUNDS.length ? n : 0);
const favInit = () => {
  const bg = store_get('ff-favbg') !== null ? Number(store_get('ff-favbg')) : Number(store_get('ff-bg'));         // the host's old last choice becomes the first favourite
  const raw = store_get('ff-favsong') !== null ? Number(store_get('ff-favsong')) : (store_get('ff-music') !== null ? Number(store_get('ff-music')) : -1);   // -1 = no song
  return { bg: clampBg(bg), music: Number.isInteger(raw) && raw >= 0 && raw < TRACK_NAMES.length ? raw : -1 };
};
const fav = favInit();
if (store_get('ff-favbg') === null || store_get('ff-favsong') === null) { store.set('ff-favbg', String(fav.bg)); store.set('ff-favsong', String(fav.music)); }   // written once, so the favourites survive the old keys going away
/** The scene outside a match (menu, Profile, Store, Stats...): the favourite background, and the favourite song if there is one. */
function appScene() {
  setBackground(fav.bg);
  if (fav.music >= 0) music.setArena(fav.music); else music.stop();
}
/** Picking in the Profile takes effect at once (live preview) and is remembered on this phone. */
function setFav(change) {
  if ('bg' in change) { fav.bg = clampBg(change.bg); store.set('ff-favbg', String(fav.bg)); }
  if ('music' in change) { fav.music = Number.isInteger(change.music) && change.music >= 0 && change.music < TRACK_NAMES.length ? change.music : -1; store.set('ff-favsong', String(fav.music)); }
  appScene(); renderFav();
}
function renderFav() {
  const bgBox = $('favBgPicker'), songBox = $('favSongPicker');
  bgBox.replaceChildren(); songBox.replaceChildren();
  BACKGROUNDS.forEach((name, i) => {
    const b = el('button', 'thumb-' + i + (i === fav.bg ? ' sel' : ''), name); b.type = 'button'; b.dataset.value = String(i); b.onclick = () => setFav({ bg: i });
    bgBox.append(b);
  });
  const none = el('button', 'song' + (fav.music < 0 ? ' sel' : ''), 'No song'); none.type = 'button'; none.dataset.value = '-1'; none.onclick = () => setFav({ music: -1 });
  songBox.append(none);
  TRACK_NAMES.forEach((name, i) => {
    const s = el('button', 'song' + (i === fav.music ? ' sel' : ''), name); s.type = 'button'; s.dataset.value = String(i); s.onclick = () => setFav({ music: i });
    songBox.append(s);
  });
}
function setMusic(i) {
  currentMusic = i;
  if ($('menu').hidden) music.setArena(i);
}
/** Shows the match's background and plays its music: two separate settings. */
function setScene() { setBackground(settings.background); setMusic(settings.music); }

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
profile = { flag: store.get('ff-flag') === '1', country: store.get('ff-country') || detectCountry() };
/** A guess for the flag field only: the region of the browser's language setting (el-GR -> GR). No network, no IP involved. */
function detectCountry() {
  try {
    const tags = [...(navigator.languages || []), navigator.language || ''];
    for (const l of tags) { const c = /[-_]/.test(l) ? countryCode(l) : ''; if (c) return c; }              // a tag with a region: el-GR -> GR
    for (const l of tags) { const c = countryCode(l, true); if (c) return c; }        // otherwise the main country of the language: el -> GR
  } catch { /* ignore */ }
  return '';                                                                            // unknown: no flag is shown
}
const myFlag = () => (profile.flag ? countryCode(profile.country) || undefined : undefined);
const freshSettings = () => normalizeSettings({ ...DEFAULTS, background: fav.bg, music: fav.music >= 0 ? fav.music : fav.bg });   // a new room starts with my favourite background and song (no song: the arena's own track); the lobby can still change them
{
  // a shared link carries the code after the "#": browsers never send that part to any server
  const m = /(?:^|[#&])room=([A-Za-z0-9-]+)/.exec(location.hash || '');
  if (m) {
    $('codeInput').value = formatCode(cleanCode(m[1]));
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }   // don't leave the code in the address bar
  }
}
$('codeInput').addEventListener('input', e => { e.target.value = formatCode(cleanCode(e.target.value)); });
const renderSound = () => { $('muteBtn').textContent = sfx.muted ? 'Off' : 'On'; $('muteBtn').classList.toggle('on', !sfx.muted); };
$('muteBtn').onclick = () => { sfx.unlock(); sfx.setMuted(!sfx.muted); renderSound(); };
$('volSlider').value = String(Math.round(sfx.volume * 100));
$('volSlider').oninput = e => { sfx.unlock(); sfx.setVolume(Number(e.target.value) / 100); if (sfx.muted && Number(e.target.value) > 0) { sfx.setMuted(false); renderSound(); } };
$('volSlider').onchange = () => sfx.ui();
renderSound();
// every button gets a small tap sound (capture phase, so it also covers buttons built later)
document.addEventListener?.('click', e => { if (e.target?.closest?.('button')) { sfx.unlock(); sfx.ui(); } }, true);
fx.initFx($('game'));


settings = freshSettings();

// ---- Profile & settings (everything is saved on this phone and used in every match)
function renderWho() { $('whoAmI').textContent = sanitizeName($('nameInput').value); }
function renderProfile() {
  const n = sanitizeName($('nameInput').value);
  $('nameNote').textContent = isObscene(n) ? 'This name is not allowed. In matches you will appear as "Naughty Player #…".' : '';
  $('flagBtn').textContent = profile.flag ? 'On' : 'Off';
  $('flagBtn').classList.toggle('on', profile.flag);
  $('countryRow').hidden = !profile.flag;               // the input sits inline on the same row, only while the flag is on
  $('countryInput').value = profile.country || '';
  $('countryHint').textContent = flagEmoji(profile.country);
  renderWho();
}
$('nameInput').oninput = () => { store.set('ff-name', sanitizeName($('nameInput').value)); renderProfile(); };
$('flagBtn').onclick = () => { profile.flag = !profile.flag; store.set('ff-flag', profile.flag ? '1' : '0'); renderProfile(); };
$('countryInput').oninput = e => {
  const c = countryFromText(e.target.value);      // the box keeps what was typed; only the matching code is saved
  profile.country = c; store.set('ff-country', c); $('countryHint').textContent = flagEmoji(c);
};
$('profileBtn').onclick = () => { customiseReturn='menu';editingMatch=false; if (!inGame) setGen({ sd: newSeed() }); buildStyleCard(); renderProfile(); show('profile'); };
$('profileBack').onclick = () => editingMatch?closeMatchCustomise():show('menu');
function openMatchCustomise(){
  if(inGame)return;
  customiseReturn=currentScreen;editingMatch=true;autoStarted=false;
  if(me){ready[me]=false;send({t:'ready',ready:false});}
  buildStyleCard();renderProfile();show('profile');enterCust();
}
function closeMatchCustomise(){
  const destination=customiseReturn;editingMatch=false;
  show(destination);
  if(me){ready[me]=camReady;send({t:'ready',ready:camReady});}
  if(destination==='lobby'||destination==='over')renderLobby();
}
$('overCustomise').onclick=openMatchCustomise;
renderWho();
const service=new Service(API_URL),social=initSocial(service,{getName:()=>myName(),onBack:()=>show('menu'),invite:async target=>{await $('createBtn').onclick();if(!roomCodeRaw)throw new Error('Could not open a room');await service.request('/invites','POST',{target,code:roomCodeRaw});$('lobbyMsg').textContent='Invitation sent. You will approve your friend when they join.';},join:async code=>{$('codeInput').value=code;await $('joinBtn').onclick();}});
$('accountBtn').hidden=!service.enabled||globalThis.Capacitor?.isNativePlatform?.()===true;$('accountBtn').onclick=()=>{show('social');social.open();};

function menuMsg(text, err = false) {
  $('menuMsg').textContent = text;
  $('menuMsg').classList.toggle('err', err);
}

function myName() {
  store.set('ff-name', sanitizeName($('nameInput').value));
  return cleanName($('nameInput').value, NAME_MAX);      // what others see: cleaned, or "Naughty Player #123" if obscene
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Resolves true as soon as cond() is true, or false after ms. */
async function waitFor(cond, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await sleep(150); }
  return cond();
}

function makeLink(quiet = false, iceServers = null) {
  return new Link({
    onOpen: onLinkOpen,
    onMessage: onMessage,
    onClose: reason => onLinkClosed(reason),
    canResume: () => !searching && !!names.host && !!names.guest,
    keepRoom: () => me === 'host' && (matchKind === 'private' || (matchKind === 'random' && !names.guest)),   // a private room outlives its guest; a waiting random host survives an aborted probe
    canReplaceSeat: () => me === 'host' && matchKind === 'private' && !inGame,       // nothing to protect between fights
    onSeatReplaced: () => { names.guest = ''; ready.guest = false; pendingGuest = null; guestToken = null; netBadge(''); },
    onSeatFreed: reason => hostSeatFreed(reason),
    onReconnecting: () => netBadge(me === 'host' ? (names.guest || 'Your opponent') + ' disconnected. Waiting…' : 'Connection lost. Reconnecting…'),
    onReconnected: () => onReconnected(),
    onStatus: t => { if (!quiet) menuMsg(t); },
  }, { relay: matchKind === 'random' && hideIp, iceServers });
}

/** Tears down a link. With [only], a stale search attempt closes just its own link and never touches a newer one. */
function cleanupLink(only) {
  if (only && link !== only) { only.closed = true; try { only.close(); } catch { /* ignore */ } return; }
  if (link) { link.closed = true; try { link.close(); } catch { /* ignore */ } }
  link = null; me = null; names = { host: '', guest: '' }; flags = { host: '', guest: '' };
  clearTimeout(helloTimer);
}

$('computerBtn').onclick=async()=>{
  sfx.unlock();resetAll();clearSession();matchKind='computer';me='host';names={host:myName(),guest:'Computer'};settings=freshSettings();
  await loadCatalog();
  if(matchKind!=='computer')return;
  computer=new Computer({skins:()=>skinIds()});
  link={open:true,send(){},close(){this.open=false;}};ready.guest=true;enterLobby();
};

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
  saveSession();
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

$('cancelBtn').onclick = () => { resetAll(); menuMsg('Search cancelled.'); };

/** Look at every slot at once and join the player who has waited longest (see Link.joinAny). */
async function tryJoinRandom(name, active) {
  me = 'guest'; names = { host: '', guest: name };
  const l = makeLink(true); link = l;
  let mine;
  const matched = new Promise(res => { mine = res; matchWaiter = res; });
  const done = () => { if (matchWaiter === mine) matchWaiter = null; };
  try { await l.joinAny(Array.from({ length: RANDOM_SLOTS }, (_, i) => randomId(i)), 9000); } catch { done(); cleanupLink(l); return false; }
  const ok = await Promise.race([matched, sleep(3500).then(() => false)]);   // a host answers 'welcome' straight away
  done();
  if (!ok || !active()) { cleanupLink(l); return false; }
  return true;
}

async function tryHostRandom(i, name, active, since) {
  me = 'host'; names = { host: name, guest: '' };
  let mine;
  const matched = new Promise(res => { mine = res; hostWaiter = res; });    // set up BEFORE opening, so an early guest isn't missed
  const done = () => { if (hostWaiter === mine) hostWaiter = null; };
  const l = makeLink(true); link = l;
  l.queueSince = since;                         // joiners see how long this player has been waiting overall
  try { await l.host(randomId(i)); } catch (e) { done(); cleanupLink(l); return e.message === 'taken' ? 'taken' : 'error'; }
  menuMsg('Waiting for an opponent…');
  const r = await Promise.race([matched, waitFor(() => !active(), 7000 + Math.random() * 6000).then(() => 'timeout')]);
  done();
  if (r === true && active()) return 'matched';
  cleanupLink(l);
  return 'timeout';
}

/** Server pairing is shared by native and website clients; the PeerJS link still carries game messages. */
async function findQueuedOpponent() {
  resetAll();matchKind='random';const id=++searchId;setSearching(true);
  const active=()=>searching&&id===searchId;
  const finder=new Matchmaker(service);queueSearch=finder;
  let paired;
  menuMsg('Preparing multiplayer…');
  try {
    await queueCleanup;if(!active())return;
    await finder.start(myName(),{
      openPeer:async (peer,iceServers)=>{if(!active())throw new Error('Search cancelled');link=makeLink(true,iceServers);await link.host(peer);if(!active())throw new Error('Search cancelled');},
      onPair:pair=>{
        if(!active())throw new Error('Search cancelled');me=pair.role;names={host:'',guest:''};names[me]=myName();settings=normalizeSettings(pair.settings);
        link.expectPair(pair);if(me==='guest')link.setToken(newToken());
        paired=new Promise(resolve=>{if(me==='host')hostWaiter=resolve;else matchWaiter=resolve;});
        menuMsg('Opponent found. Connecting…');
      },
      connect:async pair=>{
        if(!active())throw new Error('Search cancelled');
        if(pair.role==='guest')await link.dialRegistered(pair.hostPeer);
        const ok=await Promise.race([paired,sleep(16000).then(()=>false)]);
        if(!ok)throw new Error('Could not connect to your opponent. Please try again.');
      },
      onRelay:servers=>{if(queueSearch===finder&&link)link.setRelayServers(servers);},
      onStatus:t=>{if(queueSearch===finder){if(searching)menuMsg(t);else netBadge(t);}},
    });
    if(!active())return;
    hostWaiter=null;matchWaiter=null;setSearching(false);enterLobby();
  } catch(e) {
    if(id!==searchId)return;
    resetAll();menuMsg(e.message||'Multiplayer could not connect. Please try again.',true);
  }
}

$('randomBtn').onclick = async () => {
  sfx.unlock();
  if(service.enabled)return findQueuedOpponent();
  if (hideIp && !hasRelay()) {      // relay-only needs a TURN relay (see ice.js); without one a random match could never connect
    menuMsg('Random matches always hide your IP behind a relay server, and none is set up. Invite a friend with a private match instead.', true);
    return;
  }
  resetAll();
  matchKind = 'random';
  const id = ++searchId;
  setSearching(true);
  const active = () => searching && id === searchId;
  const myRandom = myName();                       // random opponents see the profile name too (filtered; clashes are numbered by the host)
  const started = Date.now(), deadline = started + 120_000;
  menuMsg('Looking for an opponent…');
  let matched = false;
  while (!matched && active() && Date.now() < deadline) {
    if (active()) matched = await tryJoinRandom(myRandom, active);
    for (let i = 0; i < RANDOM_SLOTS && active() && !matched; i++) {
      const r = await tryHostRandom(i, myRandom, active, started);
      if (r === 'matched') matched = true;
      else if (r !== 'taken') break;               // timed out or failed: go back to looking
    }
    if (!matched && active()) await sleep(150 + Math.random() * 450);      // jitter so two searchers don't move in lockstep
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
const allowPhotos = () => matchKind === 'private' || matchKind === 'computer';          // random opponents never send, and are never shown, photos
const pictureOf = m => ({ ...genWire(m.skin,m),cb:m.cb, photo: m.photo, view: m.view, skin: m.skin, lay: m.lay, bc: m.bc, sk: m.sk, ss: m.ss, bk: m.bk, cos: m.cos, hands: m.hands, lm: m.lm, ar: m.ar });

function onLinkOpen() {
  if (me === 'guest') send({ t: 'hello', v: PROTOCOL, kind: matchKind, name: names.guest, flag: myFlag(), token: link?.token || undefined, pair: link?.pairProof?.() });
  if (me === 'host') {                                     // a connection that never says hello must not hog the room
    clearTimeout(helloTimer);
    helloTimer = setTimeout(() => { if (me === 'host' && !names.guest && !pendingGuest) link?.dropGuest(); }, 8000);
  }
}

function onLinkClosed(reason) {
  if (!me || searching) return;
  if (game?.over) {                                  // the fight is decided: the other phone closing now is normal, keep the result screen
    opponentGone = true;
    $('againBtn').disabled = true; $('settingsBtn').disabled = true;
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
  endOfMatch(true);
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
  if (matchKind !== 'private' || !me || (me === 'guest' && !link?.token)) return;
  store.set(SESSION_KEY, JSON.stringify({ role: me, code: roomCodeRaw, token: link?.token || null, names, t: Date.now() }));
}
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } updateRejoin(); }
function loadSession() {
  try {
    const x = JSON.parse(store.get(SESSION_KEY) || 'null');
    if (!x || (x.role !== 'host' && x.role !== 'guest') || x.code?.length !== CODE_LEN || (x.token ? !validToken(x.token) : x.role !== 'host') || Date.now() - x.t > SESSION_MAX_AGE) return null;
    return { role: x.role, code: cleanCode(x.code), token: x.token || null, names: { host: sanitizeName(x.names?.host, 20), guest: sanitizeName(x.names?.guest, 20) } };
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

/** Private room, host side: the guest left or vanished. The room stays open with a free seat instead of being thrown away. */
function hostSeatFreed(reason) {
  if (me !== 'host' || matchKind !== 'private' || !link) return;
  const who = names.guest || 'Your opponent';
  names.guest = ''; ready = { host: false, guest: false }; pendingGuest = null; guestToken = null; netBadge('');
  const why = reason === 'left' ? who + ' left.' : who + ' disconnected.';
  if (game?.over) {                                  // keep the result screen; the host chooses when to reopen the room
    opponentGone = true;
    $('againBtn').disabled = false; $('againBtn').textContent = 'Open the room again';
    $('overMsg').textContent = why + ' Your room is still open.';
    return;
  }
  backToLobby(why + ' Your room is still open: the same code works for a new or returning player.');
}

function backToLobby(msg, keepGuest = false, keepReady = false) {
  token++;
  releaseCamera();
  editingMatch=false;customiseReturn='menu';
  round = null; inGame = false; game = null; autoStarted = false; opponentGone = false;
  fightLog = []; streak = { side: null, n: 0 };
  idle = newIdle();
  if (!keepGuest) { names.guest = ''; pendingGuest = null; guestToken = null; }
  if (!keepReady) ready = { host: false, guest: false };      // keepReady: both cameras are already enabled, so nobody could ready up again
  fx.clearFx(); $('banner').replaceChildren(); netBadge('');
  setScene();
  show('lobby');
  renderLobby();
  $('lobbyMsg').textContent = msg || '';
  saveSession();
}

function onReconnected() {
  netBadge('');
  showBanner('RECONNECTED', '', 1200);
  send({ t: 'ready', ready: ready[me] });
  if (me !== 'host') return;
  send({ t: 'settings', settings });
  if (!inGame && !game) send({ t: 'abort' });                 // we just reloaded: a fight the guest still shows is gone
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
    else { link.setToken(x.token); await link.rehost(privateId(x.code)); if (x.names.guest && x.token) link.expectResume(); else names.guest = ''; }
  } catch (e) {
    menuMsg(x.role === 'guest' ? 'Could not rejoin. The match may be over.' : 'Could not reopen the match (' + e.message + '). Try again in a minute.', true);
    resetAll(); clearSession();
    return;
  }
  $('roomCode').textContent = formatCode(x.code);
  enterLobby();
  if (x.role === 'guest') { send({ t: 'rejoined' }); send({ t: 'ready', ready: ready.guest }); }
  else menuMsg('');
  saveSession();
};

/** A player's name with their flag, if they chose to show one. */
function labelOf(side) { return (flags[side] ? flagEmoji(flags[side]) + ' ' : '') + (names[side] || ''); }

function acceptGuest(name) {
  pendingGuest = null;
  name = uniqueName(name, [names.host]);                 // two players called "Pano": the second becomes "Pano (2)"
  names.guest = name;
  flags.guest = countryCode(pendingFlag);
  link?.setToken(guestToken);
  saveSession();
  send({ t: 'welcome', v: PROTOCOL, kind: matchKind, name: names.host, yourName: name, flag: myFlag(), settings, ready: ready.host, pair: link?.pairProof?.() });
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
      if (me === 'host' && matchKind === 'private' && link) { link.freeSeat(); hostSeatFreed('left'); }     // the guest left on purpose: free the seat at once
      else onLinkClosed('left');
      break;
    case 'lobby':                                   // the opponent went back to the lobby to change settings (never in the middle of a fight)
      if (!me || matchKind !== 'private' || !names.host || !names.guest || (inGame && game && !game.over)) break;
      backToLobby(names[other(me)] + ' went back to the lobby. Change anything you like, then press ready.', true, true);
      break;
    case 'rejoined':                                // host: the guest reloaded their page, so their side of any fight is gone
      if (me === 'host' && inGame && !game?.over) { send({ t: 'abort' }); backToLobby('The fight was cancelled because ' + (names.guest || 'your opponent') + ' reloaded their page. Press ready to start again.', true); }
      break;
    case 'abort':                                   // guest: the host reloaded (or cancelled): back to the lobby, seats kept
      if (me === 'guest' && (inGame || !$('over').hidden)) backToLobby('The fight was cancelled (the host reloaded the page). Press ready to start again.', true);
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
      pendingFlag = m.flag;
      if (matchKind === 'private') { pendingGuest = cleanName(m.name); renderLobby(); }
      else acceptGuest(cleanName(m.name));
      break;
    case 'welcome':                                 // guest: accepted; here are the host's details
      if (me !== 'guest' || m.kind !== matchKind) break;
      names.host = cleanName(m.name);
      if (typeof m.yourName === 'string') names.guest = cleanName(m.yourName, 20);       // the host may have numbered us ("Pano (2)")
      flags.host = countryCode(m.flag);
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
      if (me !== 'guest' || !names.host || editingMatch) break;
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
  if (me) flags[me] = myFlag() || '';
  setScene();
  buildBgPicker();
  buildStyleCard();
  show('lobby');
  renderLobby();
  if (autoCameraWanted({ ready: camReady, busy: camBusy, failed: camAutoFailed })) enableCamera();   // no separate tap; never blocks the lobby
}

/** Host-only changes to the arena: [change] is {background?, music?}; remembered on this phone and sent to the guest with the other settings (validated on arrival). */
function setArena(change) {
  if (me !== 'host') return;
  settings = normalizeSettings({ ...settings, ...change });                  // this match only: the favourites are changed in the Profile
  setScene(); send({ t: 'settings', settings }); renderLobby();
}
function buildBgPicker() {
  const box = $('bgPicker'), music = $('musicPicker');
  box.replaceChildren(); music.replaceChildren();
  BACKGROUNDS.forEach((name, i) => {
    const b = el('button', 'thumb-' + i, name);
    b.type = 'button'; b.dataset.value = String(i);
    b.onclick = () => setArena({ background: i });                 // the background alone: the music is not touched
    box.append(b);
    const m = el('button', '', TRACK_NAMES[i]); m.type = 'button'; m.dataset.value = String(i);
    m.onclick = () => setArena({ music: i });                      // the music alone
    music.append(m);
  });
}

// ---- what my opponent sees of my hand
// The whole matrix: friends (private) may get any of VIEWS; strangers (random) only the drawn ones. A photo choice is KEPT while a
// random match is on screen (only displayed as its drawn twin), so it is back for the next private match.
const matchTypeNow = () => (matchKind === 'random' ? 'random' : 'private');
const effectiveStyle = () => (matchKind === 'random' && !isSafeView(style.mode) ? { ...style, mode: safeViewOf(style.mode) } : style);
/** The camera view's overlay follows the choice (puppet views draw the puppet over my own camera picture). */
/** The STORE's try-on has no view choice: a photo view shows my live camera picture behind the puppet, any other view the puppet alone (the items are what is tried on).
 *  The Profile's top window shows the selected view itself (skeleton, puppet, with or without the live photo); its puppet fitting lives in the customise controls. Preview only, never sent. */
const tryOnView = () => (effectiveStyle().mode.startsWith('photo-') ? 'photo-puppet' : 'puppet');
const inProfileCust = () => cust.on && !$('profile').hidden;
const applyOverlay = () => cam?.setOverlay?.(tryOn.on ? (inProfileCust() ? effectiveStyle().mode : tryOnView()) : effectiveStyle().mode, style.skin, style.stack, style.baseColor, style.skel, style.skelStyle);   // a try-on shows the puppet alone on a dark background, or over my own live picture when Photo is on (preview only, never sent)

function buildStyleCard() {
  const modes = $('modePicker');
  modes.replaceChildren();
  for (const v of VIEWS) {
    const b = el('button', isSafeView(v) ? '' : 'real', MODE_LABELS[v]);
        b.type = 'button';
    b.dataset.mode = v;
    b.onclick = () => {
      if (!viewsFor(matchTypeNow()).includes(v)) return;
      style.mode = v; store.set('ff-mode', v);
      profileView.layer = v.endsWith('skeleton') ? 'skeleton' : 'base'; profileView.reset = true;     // the category below follows the view (the chips can still be tapped after)
      renderStyle(); if (!$('profile').hidden) renderProfileItems();
    };
    modes.append(b);
  }
  $('photoBtn').onclick = () => { showPhotos = !showPhotos; renderStyle(); };
  $('rudeBtn').onclick = () => { hideRude = !hideRude; store.set('ff-rude', hideRude ? '1' : '0'); renderStyle(); };
  renderStyle();
}

/** The Profile/lobby preview of the current choice, drawn with the selected skin (a stand-in picture, never the real camera). */
function renderViewPreview(mode) {
  const c = $('viewPreview');
  try { const rec = resolveLoadout(style.skin, style.stack, style.baseColor); drawViewPreview(c.getContext('2d'), c.width, c.height, mode, rec.skin, { ...rec, backs: [true] }, style.skel || SKELETON_COLOR, style.skelStyle || undefined); } catch { /* the preview is decoration */ }   // previews show the back of the hand: that is where the nail polish is
  $('viewPreviewLabel').textContent = 'Preview: ' + ({ skeleton: 'skeleton of your hand', puppet: 'your puppet', 'photo-skeleton': 'camera picture + skeleton', 'photo-puppet': 'camera picture + puppet' }[mode] || '');
}

function renderStyle() {
  const random = matchKind === 'random';
  const mode = effectiveStyle().mode;
  const offered = viewsFor(matchTypeNow());
  for (const b of $('modePicker').children) {
    b.hidden = !offered.includes(b.dataset.mode);                 // strangers never even see a photo option
    b.classList.toggle('sel', b.dataset.mode === mode);
  }
  $('photoRow').hidden = random || matchKind === 'computer';
  $('photoBtn').textContent = showPhotos ? 'On' : 'Off';
  $('photoBtn').classList.toggle('on', showPhotos);
  $('rudeBtn').textContent = hideRude ? 'On' : 'Off';
  $('rudeBtn').classList.toggle('on', hideRude);
  $('styleNote').textContent = 'In random matches, no camera photo is stored or sent to your opponent. Only a puppet or skeleton is shared.';
  $('styleNote').classList.remove('err');
  renderViewPreview(mode);
  applyOverlay();
  layoutPreview();
}

// the skin files load in the background; the picker and the saved choice are checked against what actually loaded
loadCatalog().then(() => { loadUserSkins({ getItem: store_get }, id => !!entryOf(id)); inv.load(); syncStyle(); }).catch(() => {});   // your own hands (ff-userhands) join the built-in ones in the picker

/** The equipment changed (Store, picker, or the catalogue just loaded): refresh what depends on it. */
function syncStyle() {
  takeLoadout();
  if ($('modePicker').children.length) renderStyle(); else applyOverlay();
  if (cust.on) { renderProfileItems(); renderLooks(); }           // the Profile's Hand cards / Skeleton styles follow the choice; the saved-look marker follows the getup
  if (!$('store').hidden) renderStore();
  if (!$('profile').hidden) renderProfileItems();
}

function renderLobby() {
  const random = matchKind === 'random';
  $('privateBox').hidden = !(matchKind === 'private' && me === 'host');
  $('randomNote').hidden = !random;
  $('nameHost').textContent = labelOf('host') || '-';
  $('nameGuest').textContent = labelOf('guest') || 'Waiting…';
  $('dotHost').classList.toggle('on', !!names.host);
  $('dotGuest').classList.toggle('on', !!names.guest);
  $('stHost').textContent = names.host ? (ready.host ? 'ready' : 'camera off') : '';
  $('stGuest').textContent = matchKind==='computer'?'computer ready':names.guest ? (ready.guest ? 'ready' : 'camera off') : '';
  $('valSeconds').textContent = settings.seconds;
  $('valHits').textContent = settings.hits;
  $('valMax').textContent = settings.maxFingers;
  $('shrinkBtn').textContent = settings.shrink ? 'On' : 'Off';
  $('shrinkBtn').classList.toggle('on', !!settings.shrink);
  [...$('bgPicker').children].forEach((b, i) => b.classList.toggle('sel', i === settings.background));
  [...$('musicPicker').children].forEach((b, i) => b.classList.toggle('sel', i === settings.music));
  setScene();
  $('settingsCard').hidden = random;
  $('settingsCard').classList.toggle('locked', me !== 'host');
  $('joinPrompt').hidden = !pendingGuest;
  if (pendingGuest) $('joinPrompt').scrollIntoView?.({ block: 'nearest' });
  if (pendingGuest) $('joinText').textContent = pendingGuest + ' wants to join your match.';
  $('camBtn').hidden = camReady || camBusy;
  const canStart = !editingMatch && me === 'host' && link?.open && !!names.guest && ready.host && ready.guest;
  $('startBtn').hidden = me !== 'host' || random;           // a random match starts by itself
  $('startBtn').disabled = !canStart;
  if(!$('over').hidden)$('againBtn').disabled=!canStart;
  $('lobbyMsg').textContent = me === 'guest' ? (names.host ? (random ? 'Starts when you both have your camera on.' : 'The host starts the fight.') : 'Waiting for the host to accept you…')
    : pendingGuest ? 'Accept or decline the player above.'
    : !names.guest ? (random ? 'Waiting…' : 'Send the code to your friend. Waiting for them to join…')
    : !(ready.host && ready.guest) ? (matchKind==='computer'?'Enable your camera to play against the computer.':'Both players need to enable their camera.') : '';
  if(random&&!canStart)autoStarted=false;
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
$('shrinkBtn').onclick = () => { if (me === 'host') { settings = normalizeSettings({ ...settings, shrink: !settings.shrink }); send({ t: 'settings', settings }); renderLobby(); } };

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
$('leaveBtn').onclick = () => { if (askLeave(currentScreen)) leave(); };
$('overLeave').onclick = () => { if (askLeave(currentScreen)) leave(); };
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
  if (camReady || camBusy) return;
  camBusy = true;
  if (me) renderLobby();                                // hides the button while the attempt runs
  try { await enableCameraNow(); } finally { camBusy = false; if (me) renderLobby();updateTryOnButtons(); }   // ... and brings it back if it failed
}

async function enableCameraNow() {
  const failed = () => { camAutoFailed = true; $('camBtn').disabled = false; $('camBtn').textContent = 'Try the camera again'; };
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
    failed();
    return;
  }
  clearTimeout(slow);
  if (!cam) return;                                  // the player left while the model was loading
  let err;
  try { err = await cam.startCamera(); } catch (e) { err = 'Could not start the camera (' + (e.message || e) + ').'; }
  if (!cam) return;
  if (err === 'cancelled') { $('camBtn').disabled = false; return; }
  if (err) { status(err); failed(); return; }
  cam.stopCamera();                              // permission and model are checked; the camera stays OFF until a guess window opens
  camReady = true;
  ready[me] = !editingMatch;
  status('Camera ready. It switches on only while you guess, and off at the snap.');
  send({ t: 'ready', ready: !editingMatch });
  renderLobby();
}

$('startBtn').onclick = () => {
  if (me !== 'host'||editingMatch||!ready.host||!ready.guest||!link?.open) return;
  send({ t: 'start', settings });
  startGame();
};

// ---------------------------------------------------------------------------------------------
// Store and Profile items (cosmetics). TAP an item to wear it, tap it again to take it off. What is worn is an ordered stack
// (the order you tapped; the last is drawn on top) that can be re-ordered in the "Wearing" card, where each colourable item also
// has a colour picker. Unlocking goes through js/unlock.js, which is a STUB for now (no ads, no payments): see the boundary comment there.
// ---------------------------------------------------------------------------------------------
const storeView = { category: 'all', layer: 'all', reset: false };
const profileView = { category: 'all', layer: 'base', reset: false };
let storeAnim = { raf: 0, ps: null, last: 0, rec: null, hd: [], comic: new ComicMotion() };
const wearVisible = () => !$('store').hidden || !$('profile').hidden;
const storeMsg = t => { $('storeMsg').textContent = t; };

function sampleLandmarks() { return [statesToLandmarks({ thumb: true, index: true, middle: true, ring: true, pinky: true })]; }

/** A small still of the puppet wearing [load] ({base, baseColor, stack}): used on every item card. */
function drawCard(canvas, load) {
  try {
    const rec = resolveLoadout(load.base, load.stack, load.baseColor);
    drawPuppetPicture(canvas.getContext('2d'), canvas.width, canvas.height, sampleLandmarks(), [], 1, rec.skin, false, { ...rec, backs: [true], seed: load.base + JSON.stringify(load.stack) });
  } catch { /* previews are decoration */ }
}

function chip(box, value, label, current, onPick, rerender) {
  const b = el('button', value === current ? 'sel' : '', label);
  b.type = 'button'; b.dataset.value = value;
  b.onclick = () => { onPick(value); rerender(); };
  box.append(b);
}

/** One tile: tap = wear / take off. A locked tile has an unlock button instead (a STUB today) and does nothing when tapped. */
function itemCard(e) {
  const owned = inv.owns(e.id), worn = inv.isEquipped(e.id);
  const card = el('div', 'item-card' + (worn ? ' eq' : '') + (owned ? '' : ' locked'));
  card.dataset.id = e.id;
  card.setAttribute('role', 'button'); card.setAttribute('tabindex', '0');
  card.setAttribute('aria-pressed', worn ? 'true' : 'false');
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 96;
  drawCard(cv, inv.loadoutWith(e.id));                            // the item on the puppet, with what is already worn
  const where = worn && e.layer !== 'base' ? 'Worn · #' + inv.position(e.id) : worn ? 'In use' : owned ? 'Owned' : 'Locked';
  card.append(cv, el('b', '', e.name), el('div', 'tags', CATEGORY_LABELS[e.category] + ' · ' + LAYER_LABELS[e.layer] + (e.whole ? ' · whole hand' : '') + (e.tint ? ' · colour' : '')),
    el('span', 'badge ' + (owned ? 'own' : 'lock'), where));
  if (owned) {
    card.onclick = () => {
      if (e.id === 'painting') rerollPainting();
      const r = inv.toggle(e.id);
      if (r.full) storeMsg('You can wear up to ' + MAX_STACK + ' items. Take one off first.'); else storeMsg('');
      sfx.ui(); syncStyle();
    };
    card.onkeydown = ev => { if (ev?.key === 'Enter' || ev?.key === ' ') { ev.preventDefault?.(); card.onclick(); } };
  } else {
    const btn = el('button', 'btn small ghost', unlockLabel(e));
    btn.type = 'button'; btn.dataset.act = 'unlock';
    btn.onclick = async ev => {
      ev?.stopPropagation?.();
      btn.disabled = true;
      const r = await unlockItem(inv, e);                         // STUB today (js/unlock.js); a native build swaps the provider
      storeMsg(r.granted ? e.name + ' unlocked. Find it in Customise.' : 'Not unlocked' + (r.error ? ' (' + r.error + ')' : '') + '.');
      if (r.granted) sfx.ui();
      syncStyle();
    };
    card.append(btn);
  }
  return card;
}

// ---- saved looks: the whole getup under a name, in a sideways row under the preview (inside the pinned block)
/** My getup right now as plain data: hand, its colour, worn items in order, category colours, skeleton style and colour. */
const currentGetup = () => ({ ...inv.getup(), sk: style.skel || undefined, ss: style.skelStyle || undefined });
function applyLook(look) {
  if (!look || !inv.applyGetup(look)) return;
  style.skel = cleanColor(look.sk); store.set('ff-skel', style.skel || '');
  style.skelStyle = cleanSkelStyle(look.ss); store.set('ff-skelstyle', style.skelStyle || '');
  looks.markApplied(look.id);
  sfx.ui(); syncStyle();
}
let lookNoticeTimer=null;
function lookNotice(text=''){
  clearTimeout(lookNoticeTimer);$('cMsg').textContent=text;
  if(text){lookNoticeTimer=setTimeout(()=>{if($('cMsg').textContent===text)$('cMsg').textContent='';},3000);lookNoticeTimer.unref?.();}
}
$('saveLookBtn').onclick=saveLook;
function saveLook() {
  if (looks.full) { lookNotice('You can keep ' + MAX_LOOKS + ' looks. Delete one first.'); return; }
  let name = 'Look ' + (looks.list.length + 1);
  if (typeof globalThis.prompt === 'function') { const a = globalThis.prompt('Name this look', name); if (a === null) return; name = a; }
  const look = looks.add(name, currentGetup());
  lookNotice(look ? 'Saved "' + look.name + '".' : 'Could not save this look.');
  renderLooks();
}
let editingLook = null;                                            // the look whose edit strip is open (rename / update / delete)
function renameLook(l) {
  let name = l.name;
  if (typeof globalThis.prompt === 'function') { const a = globalThis.prompt('Rename this look', l.name); if (a === null) return; name = a; }
  lookNotice(looks.rename(l.id, name) ? 'Renamed.' : 'That name is empty.');
  renderLooks();
}
function updateLook(l) {
  if (typeof globalThis.confirm === 'function' && !globalThis.confirm('Replace the look "' + l.name + '" with what you wear now?')) return;
  lookNotice(looks.update(l.id, currentGetup()) ? 'Updated "' + l.name + '".' : 'Could not update this look.');
  renderLooks();
}
function deleteLook(l) {
  if (typeof globalThis.confirm === 'function' && !globalThis.confirm('Delete the look "' + l.name + '"?')) return;
  lookNotice();looks.remove(l.id); if (editingLook === l.id) editingLook = null;
  renderLooks();
}
function renderLooks() {
  const row = $('looksRow'), strip = $('lookEdit');
  row.replaceChildren();
  if (editingLook && !looks.get(editingLook)) editingLook = null;
  $('saveLookBtn').disabled=looks.full;
  $('looksEmpty').hidden=looks.list.length>0;
  const now = currentGetup();
  for (const l of looks.list) {
    const on = looks.appliedId === l.id && sameGetup(l, now);
    const box = el('div', 'look' + (on ? ' sel' : '') + (editingLook === l.id ? ' editing' : '')); box.dataset.id = l.id;
    const use = el('button', 'look-use', l.name); use.type = 'button'; use.dataset.act = 'apply'; use.setAttribute('aria-pressed', on ? 'true' : 'false');
    use.onclick = () => applyLook(l);
    const more = el('button', 'look-x', '✎'); more.type = 'button'; more.dataset.act = 'edit'; more.setAttribute('aria-label', 'Edit look ' + l.name); more.setAttribute('aria-expanded', editingLook === l.id ? 'true' : 'false');
    more.onclick = () => { editingLook = editingLook === l.id ? null : l.id; renderLooks(); };
    box.append(use, more);
    row.append(box);
  }
  strip.replaceChildren();
  const cur = editingLook && looks.get(editingLook);
  strip.hidden = !cur;
  if (cur) {
    strip.append(el('span', 'le-name', cur.name));
    for (const [act, label, fn] of [['rename', 'Rename', () => renameLook(cur)], ['update', 'Update to what I wear now', () => updateLook(cur)], ['delete', 'Delete', () => deleteLook(cur)], ['close', 'Close', () => { editingLook = null; renderLooks(); }]]) {
      const bt = el('button', 'btn tiny' + (act === 'delete' ? ' danger' : ' ghost'), label); bt.type = 'button'; bt.dataset.act = act; bt.onclick = fn;
      strip.append(bt);
    }
  }
}

/** The other direction of the view <-> category sync: tapping the Hand / Skeleton chip switches the opponent view to the puppet / skeleton kind (a photo choice stays a photo choice). */
function viewKind(kind) {
  const next = (style.mode.startsWith('photo-') ? 'photo-' : '') + kind;
  if (next === style.mode || !viewsFor(matchTypeNow()).includes(next)) return;
  style.mode = next; store.set('ff-mode', next);
  renderStyle();
}

/** Puts a sideways-scrolling row back at its first item. Done AFTER the cards were replaced, and with scroll-snap off for a moment: otherwise the browser
 *  re-snaps the new content to the old position (or keeps a smooth scroll in flight), which is why setting scrollLeft before the rebuild did nothing on the phone. */
function scrollRowToStart(row) {
  row.style.scrollSnapType = 'none';
  try { row.scrollTo?.({ left: 0, behavior: 'instant' }); } catch { /* old browsers: the assignment below does it */ }
  row.scrollLeft = 0;
  if (globalThis.requestAnimationFrame) globalThis.requestAnimationFrame(() => { row.scrollLeft = 0; row.style.scrollSnapType = ''; }); else row.style.scrollSnapType = '';
}

/** Reset the new cards after layout, including the enclosing vertical screen. */
function resetCategoryItems(grid, screen, controls, sticky = null) {
  scrollRowToStart(grid); grid.scrollTop = 0;
  const align = () => {
    if (screen.hidden) return;
    const viewport = screen.getBoundingClientRect();
    const current = screen.scrollTop || 0;
    const header = sticky?.classList.contains('stuck') ? sticky.getBoundingClientRect() : null;
    const target = header
      ? current + grid.getBoundingClientRect().top - (header.bottom ?? header.top + header.height) - 8
      : current + controls.getBoundingClientRect().top - viewport.top - (screen.querySelector('.topbar')?.getBoundingClientRect().height || 0) - 12;
    const top = Math.max(0, target);
    try { screen.scrollTo?.({ top, behavior: 'instant' }); } catch { /* scrollTop works on older browsers */ }
    screen.scrollTop = top;
  };
  if (globalThis.requestAnimationFrame) globalThis.requestAnimationFrame(align); else align();
}

/** A Skeleton style card: the sample hand drawn in that style and the current skeleton colour; tap = use it (sent to the opponent as `ss`). */
function skeletonCard(id, name) {
  const on = (style.skelStyle || 'classic') === id;
  const card = el('div', 'item-card' + (on ? ' eq' : '')); card.dataset.id = id; card.dataset.skelstyle = id;
  card.setAttribute('role', 'button'); card.setAttribute('tabindex', '0'); card.setAttribute('aria-pressed', on ? 'true' : 'false');
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 96;
  try { drawSkeletonPicture(cv.getContext('2d'), 96, 96, sampleLandmarks(), [], 1, false, style.skel || SKELETON_COLOR, id); } catch { /* previews are decoration */ }
  card.append(cv, el('b', '', name), el('span', 'badge ' + (on ? 'own' : 'lock'), on ? 'In use' : 'Tap to use'));
  card.onclick = () => { style.skelStyle = id; store.set('ff-skelstyle', id); sfx.ui(); renderStyle(); renderProfileItems(); };
  card.onkeydown = ev => { if (ev?.key === 'Enter' || ev?.key === ' ') { ev.preventDefault?.(); card.onclick(); } };
  return card;
}

function fillGrid(grid, list) {
  grid.replaceChildren();
  if (!list.length) grid.append(el('p', 'fine', 'Nothing here yet.'));
  for (const e of list) grid.append(itemCard(e));
}

function renderStoreGrid() {
  const available = filterCatalog(catalog(), storeView).filter(e => !inv.owns(e.id));
  fillGrid($('storeGrid'), available);
  if (!available.length) $('storeGrid').children[0].textContent = 'You own everything in this category. Find your items in Customise.';
}

function renderStore() {
  const cats = $('storeCats'), lays = $('storeLayers');
  cats.replaceChildren(); lays.replaceChildren();
  chip(cats, 'all', 'All', storeView.category, v => { storeView.category = v; storeView.reset = true; }, renderStore);
  for (const c of CATEGORIES) chip(cats, c, CATEGORY_LABELS[c], storeView.category, v => { storeView.category = v; storeView.reset = true; }, renderStore);
  chip(lays, 'all', 'Everything', storeView.layer, v => { storeView.layer = v; storeView.reset = true; }, renderStore);
  for (const l of LAYERS) chip(lays, l, LAYER_LABELS[l], storeView.layer, v => { storeView.layer = v; storeView.reset = true; }, renderStore);
  renderStoreGrid();
  renderWear();
  if (storeView.reset) { storeView.reset = false; resetCategoryItems($('storeGrid'), $('store'), $('storeCats'), $('storeSticky')); }
}

/** The Profile's customise list: one type at a time (Hand, Tattoo / scar, Nail polish, Ring, Glove, Effect) in a sideways-scrolling row, only what you own (the Store shows only items not yet owned). */
function renderProfileItems() {
  const lays = $('profileLayers');
  lays.replaceChildren();
  for (const l of PROFILE_LAYERS) chip(lays, l, LAYER_LABELS[l], profileView.layer, v => { profileView.layer = v; profileView.reset = true; if (v === 'base') viewKind('puppet'); else if (v === 'skeleton') viewKind('skeleton'); }, renderProfileItems);
  const grid = $('profileGrid');
  if (profileView.layer === 'skeleton') { grid.replaceChildren(); for (const [id, name] of SKELETON_STYLES) grid.append(skeletonCard(id, name)); }
  else fillGrid(grid, filterCatalog(catalog(), { layer: profileView.layer }).filter(e => inv.owns(e.id)));
  const reset = profileView.reset; profileView.reset = false;
  renderWear();
  if (reset) resetCategoryItems(grid, $('profile'), $('profileLayers'), $('stickyTop'));
}

/** Where the shared pieces (preview / camera, category colour panel, worn list) sit: inside the Store's Wearing card, or in the Profile's customise area. */
function layoutWear(where) {
  const a = where === 'profile' ? ['cWearTop', 'cCat', 'cWearList', 'cMsg'] : ['sWearTop', 'sCat', 'sWearList', 'sMsg'];
  ['wearTop', 'catColor', 'wearListBox', 'wearMsg'].forEach((id, i) => $(a[i]).append($(id)));
  $('wearTop').classList.toggle('pmode', where === 'profile');       // Profile: the only camera control is Photo on / off
}

// ---- customise mode (Profile): the camera goes on with it and off when it ends (state: `cust`, declared at the top)
/** What the Profile's preview zone shows: EXACTLY ONE picture for the selected view, never a leftover pane.
 *  Normal: the opponent-view picture. Customise: the live camera showing the selected view itself (the skeleton, or the puppet, over the photo for the photo
 *  views); while the camera is not on, a puppet view shows the stationary puppet wearing everything, a skeleton view its static picture.
 *  The whole top block (preview, hand row, colour, type chips) is pinned while customising. */
function layoutPreview() {
  const c = inProfileCust(), live = c && tryOn.on, puppetView = effectiveStyle().mode.endsWith('puppet');
  const photoView = effectiveStyle().mode.startsWith('photo-');
  const which = !c ? 'static' : live ? 'live' : puppetView && !photoView ? 'fit' : 'static';      // a photo view without the camera keeps its placeholder (person + hand)
  $('viewPreviewBox').hidden = which !== 'static';
  $('liveBox').hidden = which !== 'live';
  $('cWearTop').hidden = which !== 'fit';
  $('wearBox').hidden = false;
  $('stickyTop').classList.toggle('stuck', c);
  $('saveLookBtn').hidden = !c;
  $('custBtn').hidden = c; $('tryBtn').hidden = c; $('custDone').hidden = !c;
  $('tryNow').hidden = !c;           // customising without the camera: the corner offers to turn it on
  $('profileLayers').hidden = !c; $('cCat').hidden = !c; $('looksRow').hidden = !c; if (!c) { $('lookEdit').hidden = true; picker.layer = null; }
  updateTryOnButtons();
  if (c) renderLooks();
  if (which === 'fit') startStoreAnim();
}
function leaveCust() {
  savedLooksOpen=false;savedLooksPanel.hidden=true;
  lookNotice();
  cust.on = false;
  $('custArea').hidden = true;
  layoutPreview();
}
$('custDone').onclick = () => { if(editingMatch){closeMatchCustomise();return;} if (cust.on) { leaveCust(); stopTryOn(); } };      // the small Done in the preview's corner: camera off
/** Opens the customise area WITHOUT the camera (the camera only starts through a Try-on button). */
function enterCust() {
  if (cust.on) return;
  cust.on = true;
  $('custArea').hidden = false;
  layoutWear('profile'); renderProfileItems(); layoutPreview();
}
$('custBtn').onclick = ()=>$('lobby').hidden?enterCust():openMatchCustomise();                                    // "Customise": pick and arrange, no camera
$('tryBtn').onclick = () => { if(!$('lobby').hidden)openMatchCustomise();else enterCust();startTryOn(); };          // "Try on (camera)": the same area with the camera ON (says why when it cannot)
$('tryNow').onclick = () => { if(cust.on){if(tryOn.on)stopTryOn();else return startTryOn();} };          // customising without the camera and now wanting it

/** The first colour a category starts from when nothing was picked: the default of its first colourable item (the hand: the worn hand). */
function categoryDefault(layer) {
  if (layer === 'base') return entryOf(inv.baseId)?.tint?.default || null;
  return catalog().find(e => e.layer === layer && e.tint)?.tint.default || null;
}

/**
 * ONE line: [full-colour button][basic presets][Original]. The rainbow button opens OUR picker in one tap (no browser dialog): a panel under the row with a
 * hue slider, a saturation/brightness square, the colour shown and a Done button. [live] runs while dragging (nothing is rebuilt under the finger), [apply] on a
 * preset / Original / Done. Every value is a plain #rrggbb made by colorpick.js. Row and panel are appended to [box].
 */
const picker = { layer: null };                                    // which category's picker panel is open (it closes when the category changes)
function colorRow(box, layer, cur, apply, live) {
  const row = el('div', 'cprow'); row.dataset.picker = 'any'; row.dataset.layer = layer;
  const open = picker.layer === layer;
  const any = el('button', 'any-color' + (open ? ' open' : '')); any.type = 'button'; any.dataset.act = 'any'; any.setAttribute('aria-expanded', open ? 'true' : 'false');
  any.setAttribute('aria-label', LAYER_LABELS[layer] + ': pick any colour');
  any.onclick = () => { picker.layer = open ? null : layer; renderCatColor(); if(!open)revealStickyControl($('catColor').querySelector('.cp-panel')); };       // opens / closes our panel; what was dragged is already applied
  row.append(any);
  box.append(row);
  mountSavedLooks(box,row);
  if (open) box.append(colorPanel(layer, cur, apply, live));
}
/** The in-app colour panel: hue slider + saturation/brightness square. Dragging applies live; Done applies for good and closes. */
function colorPanel(layer, cur, apply, live) {
  const hsv = hexToHsv(cleanColor(cur) || '#ffffff');
  const panel = el('div', 'cp-panel'); panel.dataset.act = 'panel';
  const sv = document.createElement('canvas'); sv.className = 'cp-sv'; sv.width = 240; sv.height = 100; sv.dataset.act = 'sv'; sv.setAttribute('aria-label', 'Saturation and brightness');
  const hue = document.createElement('input'); hue.type = 'range'; hue.min = '0'; hue.max = '360'; hue.step = '1'; hue.value = String(Math.round(hsv.h)); hue.className = 'cp-hue'; hue.dataset.act = 'hue'; hue.setAttribute('aria-label', 'Hue');
  const swatch = el('span', 'cp-swatch'), code = el('code', 'cp-hex');
  const done = el('button', 'btn small', 'Done'); done.type = 'button'; done.dataset.act = 'done';
  const hex = () => hsvToHex(hsv.h, hsv.s, hsv.v);
  const paint = () => {
    const c = hex(); swatch.style.background = c; code.textContent = c;
    try { const g = sv.getContext('2d'); drawSV(g, sv.width, sv.height, hsv.h); const x = hsv.s * sv.width, y = (1 - hsv.v) * sv.height;
      g.lineWidth = 2; g.strokeStyle = '#fff'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.stroke(); g.strokeStyle = '#000'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.stroke(); } catch { /* decoration */ }
  };
  const emit = () => { touched = true; paint(); live(hex()); };
  const fromPoint = e => { const r = sv.getBoundingClientRect?.() || { left: 0, top: 0, width: sv.width, height: sv.height }; Object.assign(hsv, svAt(e.clientX - r.left, e.clientY - r.top, r.width, r.height)); emit(); };
  let dragging = false, touched = false;
  sv.onpointerdown = e => { dragging = true; try { sv.setPointerCapture?.(e.pointerId); } catch { /* ignore */ } fromPoint(e); };
  sv.onpointermove = e => { if (dragging) fromPoint(e); };
  sv.onpointerup = sv.onpointercancel = () => { dragging = false; };
  hue.oninput = () => { hsv.h = Number(hue.value) || 0; emit(); };
  done.onclick = () => { picker.layer = null; if (touched) apply(hex()); else renderCatColor(); };       // Done without touching anything changes nothing
  const original=el('button','btn small ghost','Original');original.type='button';original.dataset.act='default';original.onclick=()=>{picker.layer=null;apply(null);};
  const foot = el('div', 'cp-foot'); foot.append(swatch, code, done, original);
  panel.append(sv, hue, foot);
  paint();
  return panel;
}
/** The Skeleton category's colour: the colour of the selected skeleton style's lines (plain #rrggbb, `sk`), remembered on this phone. */
function skeletonColorRow(box) {
  const set = c => { style.skel = cleanColor(c); store.set('ff-skel', style.skel || ''); };
  colorRow(box, 'skeleton', style.skel || SKELETON_COLOR, c => { set(c); renderStyle(); renderProfileItems(); }, c => { set(c); renderViewPreview(effectiveStyle().mode); applyOverlay(); });
}

/**
 * The colour picker of the CURRENT category (the Profile's type chip / the Store's type chip), ONE line: the full colour picker (any colour), a handful of
 * well-spread basic presets, and "Original". It recolours everything of that type (the Hand: the worn hand, when that hand supports it). One plain colour; no gradients.
 */
let fitControlsOpen = false;
/** Keep the list in a full-width collapsible panel, with its button between colour and sizing. */
function mountSavedLooks(box,row){
  if(!inProfileCust())return;
  if(Array.from(row.children).some(n=>n.dataset?.act==='saved-looks'))return;
  row.classList.add('has-looks');
  const button=el('button','saved-looks-toggle','Saved looks');button.type='button';button.dataset.act='saved-looks';
  button.setAttribute('aria-controls','savedLooksPanel');button.setAttribute('aria-expanded',String(savedLooksOpen));
  button.onclick=()=>{savedLooksOpen=!savedLooksOpen;savedLooksPanel.hidden=!savedLooksOpen;button.setAttribute('aria-expanded',String(savedLooksOpen));if(savedLooksOpen)revealStickyControl(savedLooksPanel);};
  row.append(button);box.append(savedLooksPanel);savedLooksPanel.hidden=!savedLooksOpen;renderLooks();
}
function renderFitControls(box){
  const section=el('details','fit-settings'),content=el('div','fit-settings-content');
  section.open=fitControlsOpen;
  section.ontoggle=()=>{fitControlsOpen=section.open;};
  section.append(el('summary','','Adjust Hand Size'),content);
  let row=box.querySelector('.cprow');
  if(!row){row=el('div','cprow');row.append(el('span','colour-spacer'));box.append(row);}
  mountSavedLooks(box,row);row.append(section);
  for(const [key,label]of [['f','Finger width'],['p','Palm width'],['c','Coverage']]){
    const ctl=el('div','ctl fit-control'),val=el('b','',gen.fit[key]+'%'),sl=document.createElement('input');
    sl.type='range';sl.min=String(FIT_LIMITS[key][0]);sl.max=String(FIT_LIMITS[key][1]);sl.step=key==='c'?'1':'5';sl.value=String(gen.fit[key]);sl.dataset.act='fit-'+key;sl.setAttribute('aria-label',label);
    sl.oninput=()=>{setGen({fit:{...gen.fit,[key]:Number(sl.value)}});val.textContent=gen.fit[key]+'%';liveColor();};
    sl.onchange=()=>{store.set('ff-fit',JSON.stringify(gen.fit));syncStyle();};
    ctl.append(el('span','fine',label),sl,val);content.append(ctl);
  }
  const reset=el('button','btn small','Reset fit');reset.dataset.act='fit-reset';reset.onclick=()=>{setGen({fit:{...FIT_DEFAULT}});store.set('ff-fit',JSON.stringify(gen.fit));syncStyle();};content.append(reset);
}

function renderCatColor() {
  const box = $('catColor'), layer = inProfileCust() ? profileView.layer : storeView.layer;
  if (picker.layer && picker.layer !== layer) picker.layer = null;        // the panel belongs to one category
  $('looksDock').append(savedLooksPanel);savedLooksPanel.hidden=true;
  box.replaceChildren();
  box.hidden = layer === 'all';
  if (layer === 'all') return;
  if (layer === 'skeleton') { skeletonColorRow(box); return; }
  if (layer === 'base' && !inv.handTintable) {
    box.append(el('p', 'fine', 'This hand keeps its own colours. Pick Cartoon, Neon or Dragon to recolour it.'));
  }
  const st = inv.categoryStyle(layer), cur = st.c || categoryDefault(layer);
  const apply = c => { inv.setCategoryColor(layer, c); syncStyle(); };
  if(layer!=='base'||inv.handTintable)colorRow(box, layer, cur, apply, c => { inv.setCategoryColor(layer, c); liveColor(); });
  if (layer === 'nails') {
    const ctl = el('div', 'ctl'), val = el('b', '', String(gen.nl));
    const sl = document.createElement('input'); sl.type = 'range'; sl.min = '0'; sl.max = '10'; sl.step = '1'; sl.value = String(gen.nl); sl.dataset.act = 'naillength'; sl.setAttribute('aria-label', 'Nail length');
    sl.oninput = () => { setGen({ nl: Number(sl.value) }); val.textContent = String(gen.nl); liveColor(); };
    sl.onchange = () => { store.set('ff-naillength', String(gen.nl)); syncStyle(); };
    ctl.append(el('span', 'fine', 'Nail length'), sl, val); box.append(ctl);
  }
  renderFitControls(box);
  if (layer === 'base' && inv.baseId === 'elemental') {
    const elements = el('div', 'chips'); elements.setAttribute('aria-label', 'Element');
    for (const value of ELEMENTS) chip(elements, value, value[0].toUpperCase() + value.slice(1), gen.el, v => { setGen({ el: v }); store.set('ff-element', v); }, syncStyle);
    box.append(elements);
  }
  if (layer === 'base' && inv.baseId === 'lowpoly') {
    const ctl = el('div', 'ctl'), val = el('b', '', String(gen.gc));
    const sl = document.createElement('input'); sl.type = 'range'; sl.min = String(GC_MIN); sl.max = String(GC_MAX); sl.step = '1'; sl.value = String(gen.gc); sl.dataset.act = 'polylevel'; sl.setAttribute('aria-label', 'Geometric detail: few big blocks to many small facets');
    sl.oninput = () => { setGen({ gc: Number(sl.value) }); val.textContent = sl.value; liveColor(); };
    sl.onchange = () => { try { localStorage.setItem('ff-polylevel', String(cleanGc(Number(sl.value)) || gen.gc)); } catch { /* a setting */ } syncStyle(); };
    ctl.append(el('span', 'fine', 'Detail'), sl, val); box.append(ctl);
  }
  if (layer === 'base' && (['flaming', 'burnbone'].includes(inv.baseId) || (inv.baseId === 'elemental' && gen.el === 'fire'))) {
    const ctl = el('div', 'ctl'), val = el('b', '', String(gen.fi));
    const sl = document.createElement('input'); sl.type = 'range'; sl.min = '1'; sl.max = '10'; sl.step = '1'; sl.value = String(gen.fi); sl.dataset.act = 'fire'; sl.setAttribute('aria-label', 'Fire intensity');
    sl.oninput = () => { setGen({ fi: Number(sl.value) }); val.textContent = String(gen.fi); liveColor(); };
    sl.onchange = () => { store.set('ff-fire', String(gen.fi)); syncStyle(); };
    ctl.append(el('span', 'fine', 'Fire intensity'), sl, val); box.append(ctl);
  }
  if (layer === 'effect') {
    const k = st.k || INTENSITY_DEFAULT, ctl = el('div', 'ctl'), val = el('b', '', String(k));
    const sl = document.createElement('input'); sl.type = 'range'; sl.min = String(INTENSITY_MIN); sl.max = String(INTENSITY_MAX); sl.step = '1'; sl.value = String(k); sl.dataset.act = 'intensity'; sl.setAttribute('aria-label', 'Effect intensity');
    sl.oninput = () => { if (inv.setIntensity(Number(sl.value))) { val.textContent = sl.value; liveColor(); } };   // more / bigger particles, always inside the particle caps
    sl.onchange = () => syncStyle();
    ctl.append(el('span', 'fine', 'Intensity'), sl, val); box.append(ctl);
  }
}

/** The worn list (top first, then the base hand) with reorder and remove, the category colour panel, and the preview. */
function renderWear() {
  const L = inv.loadout(), list = $('wearList');
  list.replaceChildren();
  const nameOf = id => entryOf(id)?.name || id;
  $('storeLoadout').textContent = 'Wearing: ' + [nameOf(L.base), ...L.stack.map(s => nameOf(s.id))].join(', ');
  for (let i = L.stack.length - 1; i >= 0; i--) {                       // top of the stack first
    const s = L.stack[i], e = entryOf(s.id);
    const li = el('li', ''); li.dataset.id = s.id;
    const nm = el('span', 'nm', nameOf(s.id)); nm.append(el('small', '', LAYER_LABELS[e?.layer] + ' · ' + (L.stack.length - i) + ' from the top'));
    li.append(nm);
    const up = el('button', '', '▲'); up.type = 'button'; up.dataset.act = 'up'; up.disabled = i === L.stack.length - 1; up.setAttribute('aria-label', 'Move ' + nameOf(s.id) + ' up (drawn later, on top)');
    up.onclick = () => { inv.move(s.id, +1); syncStyle(); };
    const down = el('button', '', '▼'); down.type = 'button'; down.dataset.act = 'down'; down.disabled = i === 0; down.setAttribute('aria-label', 'Move ' + nameOf(s.id) + ' down (drawn earlier, under)');
    down.onclick = () => { inv.move(s.id, -1); syncStyle(); };
    const rm = el('button', '', '✕'); rm.type = 'button'; rm.dataset.act = 'remove'; rm.setAttribute('aria-label', 'Take off ' + nameOf(s.id));
    rm.onclick = () => { inv.remove(s.id); syncStyle(); };
    li.append(up, down, rm);
    list.append(li);
  }
  const bl = el('li', 'base'); bl.dataset.id = L.base;
  const bn = el('span', 'nm', nameOf(L.base)); bn.append(el('small', '', 'Hand · always the bottom'));
  bl.append(bn);
  list.append(bl);
  renderCatColor();
  refreshPreview();
  updateTryOnButtons();
}

/** The big preview: the puppet with everything worn and its particle effects running (the same capped particle system the camera uses). */
function refreshPreview() {
  const rec = resolveLoadout(style.skin, style.stack, style.baseColor);
  storeAnim.rec = rec;
  if (!storeAnim.ps) storeAnim.ps = new ParticleSystem();
  storeAnim.ps.setEmitters(rec.emitters);
  storeAnim.ps.setHandStyle(rec.skin.id);
  storeAnim.ps.setElement(rec.skin.id==='sand'?'sand':rec.skin.id === 'elemental' ? gen.el : null);
  if (rec.skin.id !== 'comic') storeAnim.comic.clear();
  storeAnim.ps.setFit(rec.skin.fit);
  storeAnim.ps.setSand(rec.skin.sand);
  startStoreAnim();
}
/** The still preview has no real hand to shake, so a sand hand is jolted for a moment every few seconds to show its collapse (decoration only). */
function demoJolt(rec, now) {
  if(rec.skin.id==='elemental'){const t=now/1000;return {x:Math.sin(t*2.1)*22,y:Math.sin(t*3.2)*9};}
  if (!rec.skin.sand && !rec.skin.extend?.physics && rec.skin.id !== 'comic') return null;
  const phase = (now / 1000) % 6;
  return phase > 1.2 ? null : { x: Math.sin(now / 26) * 26, y: 0 };
}
function startStoreAnim() {
  const c = $('storePreview'), ctx = c.getContext?.('2d');
  if (!ctx || typeof globalThis.requestAnimationFrame !== 'function' || storeAnim.raf || tryOn.on) return;
  storeAnim.last = 0;
  const paint = now => {
    const dt = storeAnim.last ? (now - storeAnim.last) / 1000 : 0;
    storeAnim.last = now;
    try {
      const rec = storeAnim.rec, hands = previewHandPx(c.width, c.height, rec.skin, rec.layers);
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.save();
      const jolt = demoJolt(rec, now);
      storeAnim.ps.update(dt, jolt ? hands.map(lm => lm.map(p => ({ x: p.x + jolt.x, y: p.y + jolt.y }))) : hands);
      if (rec.skin.id === 'comic') storeAnim.comic.update(jolt ? hands.map(lm => lm.map(p => ({x:p.x+jolt.x,y:p.y+jolt.y}))) : hands, 5, dt, c.width, c.height);
      storeAnim.ps.drawBackdrop(ctx);
      drawPuppetPicture(ctx, c.width, c.height, sampleLandmarks(), [], 1, rec.skin, false, { ...rec, ps: storeAnim.ps, backs: [true], live: true, noBg: true, alphas: storeAnim.ps.bodyAlphas(), partAlphas: storeAnim.ps.partAlphas(), hd: storeAnim.hd, comic: storeAnim.comic, dt, jolt });
      ctx.restore();
      storeAnim.ps.draw(ctx);
    } catch { /* decoration */ }
  };
  const frame = now => {
    storeAnim.raf = 0;
    if (!wearVisible() || tryOn.on) return;                          // left the screen (or the camera took over): the loop ends by itself
    if (!storeAnim.last || now - storeAnim.last >= 33) paint(now);   // about 30 fps is plenty for a preview
    storeAnim.raf = globalThis.requestAnimationFrame(frame);
  };
  if (fx.reducedMotion?.()) { paint(0); return; }                    // reduced motion: one still picture, no loop
  storeAnim.raf = globalThis.requestAnimationFrame(frame);
}

/** A colour is being dragged: update what shows the colour, but do not rebuild the lists (that would close the picker). */
let liveTimer = 0;
function liveColor() {
  takeLoadout();
  refreshPreview(); applyOverlay();
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    if (!$('store').hidden) renderStoreGrid();
    if (!$('profile').hidden && cust.on && profileView.layer !== 'base') fillGrid($('profileGrid'), filterCatalog(catalog(), { layer: profileView.layer }).filter(e => inv.owns(e.id)));
    renderViewPreview(effectiveStyle().mode);
  }, 250);
}

// ---- live try-on: the camera on MY hand, wearing everything (Store and Profile). Local only: nothing is sent anywhere.
async function startTryOn() {
  if (tryOn.on || tryOn.busy) return false;
  const msg = t => { $('wearMsg').textContent = t; };
  if (SIM) { msg('The simulator has no camera: the preview above shows your puppet.'); return false; }
  const my = ++tryOn.token;
  const stale = () => my !== tryOn.token || !wearVisible();
  tryOn.busy = true; updateTryOnButtons();
  msg('Loading the hand model (about 17 MB, once)…');
  try {
    cam = cam || new HandCam($('video'), $('overlayCanvas'));
    hookCamera();
    try { await cam.load(); } catch (e) { msg('Could not load the hand model (' + (e.message || e) + '). Check your internet connection, then try again.'); return false; }
    if (stale()) return false;
    const err = await cam.startCamera();
    if (err === 'cancelled' || stale()) { if (err !== 'cancelled') { cam.release(); } return false; }
    if (err) { msg(err); return false; }
    tryOn.on = true;
    cam.onError = e => msg('Hand tracking error: ' + e);
    cam.onLost = () => { stopTryOn(); msg('The camera stopped. Check the browser camera permission, then tap the camera button to try again.'); };
    applyOverlay();                                                    // tryOn.on: the puppet with everything worn, over the live picture
    const box = $('camBox');
    if (inProfileCust()) $('liveBox').append(box); else { $('wearBox').append(box); $('storePreview').hidden = true; }     // Profile: the top window; Store: the Wearing card
    box.hidden = false;
    layoutPreview();
    camIndicator(true);
    let frames = 0;
    cam.onFrame = () => { frames++; };
    cam.run();
    msg('Camera on: hold up your hand.');
    setTimeout(() => { if (!frames && tryOn.on && my === tryOn.token) msg('The camera is on but the hand model produced no frames. Tap Stop camera and try again; if it repeats, reload the page.'); }, 6000);
    return true;
  } catch (e) {
    msg('Could not start the camera (' + (e?.message || e) + ').');
    return false;
  } finally { tryOn.busy = false; if (!tryOn.on) { try { cam?.release?.(); } catch { /* ignore */ } camIndicator(false); } updateTryOnButtons(); }
}
/** Camera off, preview back. Safe to call any time (also from show() when the screen is left). */
function stopTryOn() {
  tryOn.token++;                                                       // cancels a start that is still pending
  const was = tryOn.on || tryOn.busy;
  tryOn.on = false;
  if (was && cam && !SIM) { cam.release(); cam.onFrame = null; }
  if (was) camIndicator(false);
  const box = $('camBox');
  box.hidden = true; if (box.parentElement !== document.body) document.body.append(box);
  $('storePreview').hidden = false;
  if (was) { layoutPreview(); applyOverlay(); $('wearMsg').textContent = ''; updateTryOnButtons(); if (wearVisible()) startStoreAnim(); }
}
function updateTryOnButtons() {
  $('wearCamOff').hidden = !(tryOn.on || tryOn.busy);
  $('tryNow').hidden = !cust.on;
  $('tryNow').textContent=tryOn.busy?'…':tryOn.on?'■':'📷';
  const label=tryOn.busy?'Starting camera…':tryOn.on?'Stop camera':'Try on with camera';
  for(const id of ['tryNow','storeSnap']){$(id).title=label;$(id).setAttribute('aria-label',label);}
  $('tryNow').disabled=tryOn.busy||camBusy;
  $('tryBtn').disabled=tryOn.busy||camBusy;
  $('tryNow').setAttribute('aria-pressed',String(tryOn.on));
  $('storeSnap').textContent=tryOn.busy?'…':tryOn.on?'■':'📷';
  $('storeSnap').disabled = tryOn.busy;
}

function renderStats() {
  $('practiceStats').textContent='Against computer: '+practiceStats.wins+' wins · '+practiceStats.losses+' losses.';
  const m = stats.matches, fav = f => (f ? f.n + '  (' + f.times + '×)' : '-');
  $('stMatches').textContent = String(m); $('stWins').textContent = String(stats.wins); $('stLosses').textContent = String(stats.losses);
  $('stRate').textContent = m ? Math.round(100 * stats.wins / m) + '%' : '-';
  $('stFavShown').textContent = fav(stats.favouriteShown); $('stFavGuess').textContent = fav(stats.favouriteGuess);
}
$('statsBtn').onclick = () => { renderStats(); show('stats'); };
$('statsBack').onclick = () => show('menu');
$('statsReset').onclick = () => { if (typeof globalThis.confirm !== 'function' || globalThis.confirm('Reset all your stats?')) { stats.reset();practiceStats.reset(); renderStats(); } };
$('storePreview').onclick = () => { if (inv.baseId === 'painting') { rerollPainting(); liveColor(); } };
$('storeBtn').onclick = () => { show('store'); renderStore(); };
$('profileStore').onclick = () => { show('store'); renderStore(); };
$('storeBack').onclick = () => show('menu');
$('storeCustomise').onclick = () => { show('profile'); buildStyleCard(); renderProfile(); enterCust(); };
$('storeSnap').onclick = async () => { if(tryOn.on)stopTryOn();else return startTryOn(); };
$('wearCamOff').onclick = () => stopTryOn();
$('storeClear').onclick = () => { inv.clear(); syncStyle(); };

// ---------------------------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------------------------
function startGame() {
  setGen({ sd: newSeed() });                          // a new painting for every match: my seed, sent with each picture, so the opponent draws the same one
  saveSession();
  token++;
  inGame = true;
  game = newGame(settings);
  if(matchKind==='computer')computer?.start();
  round = null;
  fightLog = []; streak = { side: null, n: 0 };
  setScene();
  for (const side of ['host', 'guest']) {
    const f = fighterEl(side);
    f.innerHTML = fighterSVG(side);
    f.className = 'fighter idle';
  }
  $('topName').textContent = labelOf(other(me));
  $('botName').textContent = labelOf(me);
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
  if(matchKind==='computer')computer?.begin(n,settings);
  const pointer = pointerFor(n);
  round = { n, pointer, phase: 'intro', reveal: null, guessMsg: null, resolved: false };
  $('roundLabel').textContent = 'ROUND ' + n;
  const pointing = pointer === me;
  $('mid').className = pointing ? 'point' : 'guess';
  $('roleLabel').replaceChildren(el('b', '', turnMessage(pointing)), el('small', '', (pointing ? 'hold up fingers; they guess' : 'guess how many they hold') + (shrinkNotice(settings, n) ? ' · ' + shrinkNotice(settings, n).toLowerCase() : '')));
  $('timerNum').textContent = settings.seconds;
  $('timerWrap').classList.remove('urgent');
  $('timerBar').firstElementChild.style.transform = 'scaleX(1)';
  for (const side of ['host', 'guest']) { contentEl(side).replaceChildren(); fighterEl(side).className = 'fighter idle'; }
  releaseCamera();
  fx.wipe();
  const reduction=shrinkNotice(settings,n);
  showBanner(reduction || 'ROUND ' + n, reduction ? 'ROUND ' + n : '', 1000);   // a lower finger ceiling is announced here and stays in the middle bar
  later(1100, () => { showBanner(turnMessage(pointer === me), pointer === me ? 'Hold up your fingers! They will guess the number.' : 'Show your guess with your fingers!', 1000); sfx.roundStart(); });
  later(1900, startGuessPhase);
}

async function startGuessPhase() {
  const t = token;
  round.phase = 'guess';
  contentEl(other(me)).replaceChildren(el('div', 'thinking', '✋ ???'));   // their hand stays hidden until the reveal
  if (!SIM) {
    hookCamera(); // Restore match error/loss handlers after a local try-on.
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
  const lim = curMin() ? ' (show 1 or 2 fingers)' : curMax() < 10 ? ' (max ' + curMax() + ')' : '';
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
    for (let c = curMin(); c <= curMax(); c++) { const b = btn(String(c), () => { cam.set({ count: c }); refresh(); }); b.dataset.count = c; wrap.append(b); }
    if (pointing) for (const g of ['', 'middle', 'sideways']) { const b = btn(g || 'no gesture', () => { cam.set({ gesture: g || null }); refresh(); }); b.dataset.g = g; wrap.append(b); }
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
    $('liveCount').textContent = s.count<curMin()?'Show 1 or 2':Math.min(s.count,curMax());
    // gestures never score; the label is shown only to the pointer and only if the rude-gesture filter is off
    $('liveGesture').textContent = pointing && s.gesture && !hideRude ? GESTURE_NAMES[s.gesture] : '';
  };
  cam.run();
}

/** Front/back camera. Errors are written on the camera box itself (the lobby status line is not on screen during a match). */
$('flipBtn').onclick = async () => {
  if (!cam || SIM) return;
  const b = $('flipBtn'); b.disabled = true;
  const cap = $('camCaption'), old = cap.textContent;
  try {
    const e = await cam.flip();
    if (e) { cap.textContent = e; setTimeout(() => { if (cap.textContent === e) cap.textContent = old; }, 3500); }
  } catch (e) { cap.textContent = 'Could not switch camera (' + (e.message || e) + ')'; }
  finally { b.disabled = false; camIndicator(cam.cameraOn); }
};

// ---------------------------------------------------------------------------------------------
// Debug panel + camera test (calibration) + camera safety hooks
// ---------------------------------------------------------------------------------------------
loadTuning();                                   // thresholds the player adjusted earlier (saved on this phone)
let dbg = null;                                 // the debug panel, built on first use
const debugPanel = () => (dbg = dbg || createDebugPanel(document.body));

/** If the camera stops by itself (permission taken away, another app, unplugged) the badge must go out and the player is told. */
function hookCamera() {
  if (!cam || SIM) return;
  applyOverlay();
  cam.onError = e => {                              // the tracking loop threw: say so on the screen instead of freezing silently
    const t = 'Hand tracking error: ' + e;
    if (!$('calib').hidden) $('calibMsg').textContent = t; else $('camCaption').textContent = t;
  };
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
  try { await cam.load(); } catch (e) { msg('Could not load the hand model (' + (e.message || e) + '). Check your internet connection (or a VPN / ad-blocker blocking cdn.jsdelivr.net or storage.googleapis.com), then tap Done and try again.'); return; }
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
  let frames = 0;
  cam.onFrame = s => { frames++; p.update(s); $('liveCount').textContent = s.count; $('liveGesture').textContent = s.gesture && !hideRude ? GESTURE_NAMES[s.gesture] : ''; };
  msg('Camera on (it switches off when you tap Done). Try each finger and watch the ratios.');
  cam.run();
  setTimeout(() => { if (!frames && !$('calib').hidden && cam?.cameraOn) msg('The camera is on but the hand model produced no frames. Tap Done and try again; if it repeats, reload the page.'); }, 6000);
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
  let snap = cam.snap(effectiveStyle());
  if(!snap.noHand&&snap.count<curMin())snap={...snap,noHand:true,count:0};         // both phones snap at 0, in the style I chose (puppet/skeleton only in random matches)
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
  if(matchKind==='computer'){const reply=computer?.message();if(reply)onMessage(reply);}
  later(9000, () => { if (round && !round.resolved) { showBanner('LOST CONNECTION?', 'Waiting for your opponent…', 2500); } });
  tryResolve();
}

/** A finished match, counted once: a win or a loss for me. */
function endOfMatch(won) {
  if (!game || game.statsDone) return;
  game.statsDone = true;
  matchStats().recordMatch(won);
}

/** The finger limit for the round on screen (the host's setting, lower later in the match when "fewer fingers" is on). */
const curMax = () => effectiveMax(settings, round?.n || 1);
const curMin = () => effectiveMin(settings, round?.n || 1);

function tryResolve() {
  if (!round || round.resolved || !round.reveal || !round.guessMsg) return;
  round.resolved = true;
  round.phase = 'result';
  const { pointer } = round;
  // quicker matches: anything above the limit counts as the limit (and is drawn as a plain hand of that many fingers)
  const max = curMax();
  const plain = (m, n) => ({ ...m, view: 'puppet', photo: '', lm: null, gesture: null, hands: statesFromCount(n) });
  let reveal = round.reveal.count > max ? { ...plain(round.reveal, max), count: max } : round.reveal;
  let guessMsg = round.guessMsg.guess !== null && round.guessMsg.guess > max ? { ...plain(round.guessMsg, max), guess: max } : round.guessMsg;
  if(reveal.count<curMin())reveal={...reveal,noHand:true};
  if(guessMsg.guess!==null&&guessMsg.guess<curMin())guessMsg={...guessMsg,guess:null};
  const result = resolveRound({ pointer, count: reveal.count, guess: guessMsg.guess, noHand: reveal.noHand });
  if (pointer === me) { if (!reveal.noHand) matchStats().recordShown(reveal.count); }          // what I held up
  else if (guessMsg.guess !== null) matchStats().recordGuess(guessMsg.guess);                  // what I guessed
  fightLog.push({ n: round.n, pointer, reveal, guessMsg, reason: result.reason });
  const before = { ...game.health };
  game = applyResult(game, result);
  // anti-grief: both phones see the same two messages, so both reach the same verdict
  const away = { host: false, guest: false };
  away[pointer] = !!reveal.noHand;
  away[other(pointer)] = guessMsg.guess === null;
  const verdict = trackIdle(idle, away);
  idle = verdict.idle;
  if (verdict.forfeit && !game.over) game = { ...game, over: true, winner: other(verdict.forfeit), forfeit: verdict.forfeit };
  if (verdict.warn.includes(me)) later(2200, () => showBanner('NO HAND SEEN', 'Show your hand next round or you forfeit the match.', 2200, 'crit'));
  showReveal(pointer, reveal, guessMsg, result);
  playResult(result, reveal, before);
}

/**
 * The picture of a hand for the reveal. Real photos are shown in private matches or local computer practice (and only if I allow it);
 * everything else, and every fallback, is DRAWN here from the finger data, so a stranger can't push an image at me.
 */
function buildPicture(msg) {
  const photoView = !isSafeView(msg.view);
  if (photoView && msg.photo && allowPhotos() && (matchKind === 'computer' || showPhotos)) {
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

/** With the filter on, a rude picture is replaced by a plain drawn hand with the same number of fingers. */
function filtered(msg) {
  if (!hideRude || !looksRude(msg)) return msg;
  const n = Array.isArray(msg.hands) ? msg.hands.reduce((a, h) => a + Object.values(h).filter(Boolean).length, 0) : 0;
  return { ...msg, gesture: null, view: 'puppet', photo: '', lm: null, hands: statesFromCount(Math.min(10, Number.isInteger(msg.count) ? msg.count : n)) };
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
  if (RUDE_GESTURES.includes(reveal.gesture) && !hideRude) card.append(el('span', 'badge', GESTURE_NAMES[reveal.gesture]));   // shown, never scored
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
    showBanner('HIT!', text, HIT_MS, 'good');
  });
  later(1700, () => { for (const s of ['host', 'guest']) fighterEl(s).classList.remove('punch', 'hit', 'taunt', 'crit-fx'); });
  finishRound(2600 + (HIT_MS - 1300));      // the pause before the next round grows with the longer HIT! banner
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
  endOfMatch(winner === me);
  fighterEl(loser).classList.remove('idle'); fighterEl(loser).classList.add('ko');
  fighterEl(winner).classList.remove('idle'); fighterEl(winner).classList.add('win');
  sfx.ko();
  { const p = centerOf(loser); fx.burst(p.x, p.y, { color: '#f43f5e', power: 2 }); fx.shake(2.2); fx.flash(2); }
  showBanner('K.O.', '', 2200, 'crit');
  later(2600, () => {
    inGame = false;
    const won = winner === me;
    $('overTitle').textContent = won ? 'YOU WIN!' : 'YOU LOSE';
    $('overText').textContent = game.forfeit ? names[game.forfeit] + ' showed no hand for ' + IDLE_ROUNDS + ' rounds in a row, so ' + names[winner] + ' wins by forfeit.' : names[winner] + ' wins ' + (game.health[winner]) + ' hit' + (game.health[winner] === 1 ? '' : 's') + ' to ' + game.health[loser] + '.';
    clearSession();                                    // the match is over: nothing to rejoin
    if (game.forfeit) {                                // anti-grief forfeit: no result screen, the match is simply over
      const why = names[game.forfeit] + ' showed no hand for ' + IDLE_ROUNDS + ' rounds in a row, so ' + names[winner] + ' wins by forfeit.';
      if (matchKind === 'random') {                    // strangers: nothing is held, back to the menu to find someone else
        resetAll();
        show('menu');
        menuMsg(why + ' Find another opponent when you are ready.', won ? false : true);
        return;
      }
      if (['private','computer'].includes(matchKind) && link && !(me === 'guest' && opponentGone)) {   // friends: both go back to the lobby, the room is kept
        backToLobby(why + ' The host can start another fight.', !opponentGone, !opponentGone);
        return;
      }
    }
    if (matchKind === 'random') {                      // strangers: the connection ends with the match, no rematch
      try { link?.close(); } catch { /* ignore */ }
      link = null;
      $('againBtn').hidden = true; $('settingsBtn').hidden = true;
      $('overMsg').textContent = 'Random matches end here. Find another opponent from the menu.';
    } else {
      $('againBtn').hidden = false; $('settingsBtn').hidden = false;
      $('settingsBtn').disabled = me === 'guest' && opponentGone;
      $('againBtn').disabled = me !== 'host';
      $('againBtn').textContent = me === 'host' ? (opponentGone ? 'Open the room again' : 'Play again') : 'Waiting for host…';
      $('overMsg').textContent = opponentGone ? 'Your opponent has left.' : '';
    }
    renderCollage();
    show('over');
    if (won) { sfx.win(); fx.confetti(); } else { sfx.lose(); fx.rain(); }
  });
}

/** After a fight: back to the lobby WITH the opponent still connected, to change arena / hands / sound before the next one. */
$('settingsBtn').onclick = () => {
  if (!['private','computer'].includes(matchKind) || !link || (inGame && game && !game.over)) return;
  if (me === 'host' && opponentGone) { backToLobby(''); return; }
  if (!link.open) return;
  send({ t: 'lobby' });
  backToLobby('Back in the lobby: change anything you like, then press ready.', true, true);
};

$('againBtn').onclick = () => {
  if (me === 'host' && opponentGone && matchKind === 'private' && link) { backToLobby(''); return; }     // the guest left: reopen the room
  if (me !== 'host' || !link?.open||editingMatch||!ready.host||!ready.guest) return;
  send({ t: 'start', settings });
  startGame();
};

// ---------------------------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------------------------
function resetAll() {
  const oldQueue=queueSearch;queueSearch=null;if(oldQueue)queueCleanup=Promise.all([queueCleanup,oldQueue.cancel()]).then(()=>{});
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
  names = { host: '', guest: '' }; flags = { host: '', guest: '' };
  ready = { host: false, guest: false };
  settings = freshSettings();
  if (cam && !SIM) { try { cam.stream?.getTracks().forEach(t => t.stop()); } catch { /* ignore */ } }
  cam = null; camReady = false; camBusy = false; camAutoFailed = false;
  computer?.clear();computer=null;editingMatch=false;customiseReturn='menu';
  matchKind = null; roomCodeRaw = ''; pendingGuest = null; autoStarted = false;
  clearTimeout(helloTimer);
  guestToken = null; opponentGone = false; netBadge(''); camIndicator(false);
  matchWaiter = null; hostWaiter = null;
  if (searching) { searchId++; setSearching(false); }
  $('camBtn').disabled = false; $('camBtn').textContent = 'Enable camera';
  $('camStatus').textContent = '';
  $('banner').replaceChildren();
  setBackground(fav.bg);
}

setBackground(fav.bg);
show('menu');
updateRejoin();
// A reload (or the browser killing the tab) must not end a private match: pick the session up again by itself.
if (loadSession() && !SIM) setTimeout(() => { if (!link && !searching) $('rejoinBtn').onclick(); }, 0);
// keep the saved session fresh for as long as a private match lasts, so it only expires after the page has really been gone
setInterval(() => { if (link && me && matchKind === 'private' && !game?.over) saveSession(); }, 20000)?.unref?.();

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
const camOff = () => { if (tryOn.on) stopTryOn(); if (cam && !SIM) { cam.release(); camIndicator(false); const b = $('camBox'); b.hidden = true; if (!$('calib').hidden) { $('calibMsg').textContent = 'Camera switched off (the page was hidden). Tap Camera test again.'; dbg?.show(false); } } };
document.addEventListener?.('visibilitychange', () => { if (document.hidden) camOff(); else link?.nudge?.(); });
globalThis.addEventListener?.('pagehide', camOff);
bindPageFocus(document, globalThis);                          // sound stops with the page (hidden tab, another app in front, window blurred) and resumes when it is visible AND focused
globalThis.addEventListener?.('online', () => link?.nudge?.());       // wifi / 4G came back: re-open the match link now, not at the next timer

if (missingIds.length) setTimeout(() => showFatal('This page is out of date (missing: ' + [...new Set(missingIds)].join(', ') + '). Reload it, or clear this site\'s data in the browser settings.'), 0);

bindStickyScroll($('stickyTop'),$('profile'));
bindStickyScroll($('storeSticky'),$('store'));
