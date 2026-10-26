// Finger Fight: the controller. Screens (menu, lobby, game, over), the room link, and the round state machine.
//
// A round: the POINTER holds up fingers while the GUESSER guesses the total. When the timer ends the pointer's phone
// snaps a photo + the count + any gesture and sends it; the guesser's phone sends the guess. Each side then runs
// resolveRound() on the same inputs, so both screens show the same result. The host starts every round.
import { sfx } from './audio.js';
import { Link, newCode, cleanCode } from './net.js';
import { HandCam, SimCam } from './hands.js';
import {
  DEFAULTS, normalizeSettings, newGame, pointerFor, other, resolveRound, applyResult, describe,
  sanitizeName, validGuessMsg, validReveal,
} from './logic.js';
import { fighterSVG, backgroundHTML, BACKGROUNDS, GESTURE_NAMES } from './fighters.js';

const $ = id => document.getElementById(id);
const SIM = new URLSearchParams(location.search).has('sim');   // ?sim=1: no camera, set the hand by tapping (for testing)
const PROTOCOL = 1;

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

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
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
  const room = cleanCode(new URLSearchParams(location.search).get('room'));
  if (room) $('codeInput').value = room;
}
$('codeInput').addEventListener('input', e => { e.target.value = cleanCode(e.target.value); });
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

function makeLink() {
  return new Link({
    onOpen: onLinkOpen,
    onMessage: onMessage,
    onClose: reason => onLinkClosed(reason),
    onStatus: t => menuMsg(t),
  });
}

$('createBtn').onclick = async () => {
  sfx.unlock();
  resetAll();
  me = 'host';
  names.host = myName();
  menuMsg('Opening a room…');
  link = makeLink();
  let code = null;
  for (let i = 0; i < 6 && !code; i++) {
    try { code = await link.host(newCode()); } catch (e) {
      if (e.message === 'taken') { link.close(); link = makeLink(); continue; }
      menuMsg('Could not open a room (' + e.message + '). Check your internet connection.', true);
      resetAll();
      return;
    }
  }
  if (!code) { menuMsg('Could not find a free room code. Try again.', true); resetAll(); return; }
  $('roomCode').textContent = code;
  enterLobby();
};

$('joinBtn').onclick = async () => {
  sfx.unlock();
  const code = cleanCode($('codeInput').value);
  if (code.length !== 4) { menuMsg('The room code has 4 characters.', true); return; }
  resetAll();
  me = 'guest';
  names.guest = myName();
  menuMsg('Connecting…');
  link = makeLink();
  try {
    await link.join(code);
  } catch (e) {
    const why = { 'no-room': 'There is no room with that code.', timeout: 'Could not connect. The other phone may be on a network that blocks direct connections.' }[e.message];
    menuMsg(why || 'Could not connect (' + e.message + ').', true);
    resetAll();
    return;
  }
  $('roomCode').textContent = code;
  enterLobby();
};

// ---------------------------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------------------------
function onLinkOpen() {
  if (me === 'guest') send({ t: 'hello', v: PROTOCOL, name: names.guest });
}

function onLinkClosed(reason) {
  if (!me) return;
  const wasPlaying = inGame;
  resetAll();
  show('menu');
  menuMsg(wasPlaying ? 'Your opponent left the fight.' : 'The connection to the room closed (' + reason + ').', true);
}

function onMessage(m) {
  switch (m.t) {
    case 'bye':
      onLinkClosed('left');
      break;
    case 'full':
      resetAll(); show('menu'); menuMsg('That room already has two players.', true);
      break;
    case 'hello':                                   // host: a guest arrived
      if (me !== 'host' || names.guest) break;
      names.guest = sanitizeName(m.name);
      send({ t: 'welcome', v: PROTOCOL, name: names.host, settings, ready: ready.host });
      renderLobby();
      break;
    case 'welcome':                                 // guest: the host's details
      if (me !== 'guest') break;
      names.host = sanitizeName(m.name);
      settings = normalizeSettings(m.settings);
      ready.host = m.ready === true;
      send({ t: 'ready', ready: ready.guest });
      renderLobby();
      break;
    case 'settings':
      if (me !== 'guest') break;
      settings = normalizeSettings(m.settings);
      renderLobby();
      break;
    case 'ready':
      ready[other(me)] = m.ready === true;
      renderLobby();
      break;
    case 'start':
      if (me !== 'guest') break;
      settings = normalizeSettings(m.settings);
      startGame();
      break;
    case 'round':
      if (me === 'guest' && inGame && Number.isInteger(m.n) && m.n === game.round + 1) beginRound(m.n);
      break;
    case 'reveal':
      if (round && m.n === round.n && !round.reveal && round.pointer === other(me) && validReveal(m)) {
        round.reveal = { count: m.count, gesture: m.gesture, noHand: m.noHand, photo: m.photo };
        tryResolve();
      }
      break;
    case 'guess':
      if (round && m.n === round.n && !round.guessMsg && round.pointer === me && validGuessMsg(m)) {
        round.guessMsg = { guess: m.guess, photo: m.photo };
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

function renderLobby() {
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
  [...$('bgPicker').children].forEach((b, i) => b.classList.toggle('sel', i === settings.background));
  setBackground(settings.background);
  $('settingsCard').classList.toggle('locked', me !== 'host');
  $('camBtn').hidden = camReady;
  const canStart = me === 'host' && link?.open && !!names.guest && ready.host && ready.guest;
  $('startBtn').hidden = me !== 'host';
  $('startBtn').disabled = !canStart;
  $('lobbyMsg').textContent = me !== 'host' ? 'The host starts the fight.'
    : !names.guest ? 'Share the code. Waiting for a player to join…'
    : !(ready.host && ready.guest) ? 'Both players need to enable their camera.' : '';
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

$('shareBtn').onclick = async () => {
  const code = $('roomCode').textContent;
  const url = location.origin + location.pathname + '?room=' + code;
  try {
    if (navigator.share) { await navigator.share({ title: 'Finger Fight', text: 'Join my Finger Fight! Room ' + code, url }); return; }
    await navigator.clipboard.writeText(url);
    $('lobbyMsg').textContent = 'Link copied. Send it to your opponent.';
  } catch { $('lobbyMsg').textContent = 'Share this link: ' + url; }
};
$('copyBtn').onclick = async () => {
  try { await navigator.clipboard.writeText($('roomCode').textContent); $('lobbyMsg').textContent = 'Code copied.'; } catch { /* ignore */ }
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
  const snap = cam.snap();                         // both phones snap at 0
  releaseCamera();
  if (round.pointer === me) {
    round.reveal = { count: snap.count, gesture: snap.gesture, noHand: snap.noHand, photo: snap.photo };
    contentEl(me).replaceChildren(el('div', 'hint', 'Snap! Waiting for their guess…'));
    send({ t: 'reveal', n: round.n, ...round.reveal });
  } else {
    // the guess is the number of fingers you held up; no hand seen = no guess
    round.guessMsg = { guess: snap.noHand ? null : snap.count, photo: snap.photo };
    contentEl(me).replaceChildren(el('div', 'hint', snap.noHand ? 'Time! No hand seen, so no guess.' : 'Locked in: ' + snap.count));
    send({ t: 'guess', n: round.n, guess: round.guessMsg.guess, photo: round.guessMsg.photo });
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

function showReveal(pointer, reveal, guessMsg, result) {
  // the pointer's side: photo, number, gesture
  const card = el('div', 'reveal');
  if (reveal.photo && !reveal.noHand) { const img = el('img'); img.alt = 'Fingers'; img.src = reveal.photo; card.append(img); }
  const big = el('div', 'big', reveal.noHand ? '?' : String(reveal.count));
  big.append(el('small', '', reveal.noHand ? 'no hand seen' : 'fingers'));
  card.append(big);
  if (reveal.gesture && settings.crits) card.append(el('span', 'badge', GESTURE_NAMES[reveal.gesture]));
  contentEl(pointer).replaceChildren(card);
  // the guesser's side: the guess and whether it was right
  const g = el('div', 'reveal');
  if (guessMsg.photo && guessMsg.guess !== null) { const img = el('img'); img.alt = 'Guess'; img.src = guessMsg.photo; g.append(img); }
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
  $('camBtn').disabled = false;
  $('camStatus').textContent = '';
  $('banner').replaceChildren();
  setBackground(0);
}

setBackground(0);
show('menu');
