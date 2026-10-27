// Sound for Finger Fight.
//  - sfx:   arcade-style effects SYNTHESISED here with the Web Audio API (no sound files).
//  - music: one looping track per arena from assets/audio/, fetched lazily (never blocks the first paint), crossfaded when the
//           arena changes. A missing or undecodable file is silently skipped: the game just has no music for that arena.
//  - mute and volume are remembered in localStorage. Audio starts on the first tap, as browsers require.
//
// Graph:  osc/noise -> sfxBus --\
//                                master -> destination
//         music source -> musicFade -> musicBus --/

let ctx = null, master = null, sfxBus = null, musicBus = null;
let muted = load('ff-muted') === '1';
let volume = clamp01(load('ff-vol') === null ? 0.7 : Number(load('ff-vol')));
let noiseBuf = null;

function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
function save(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
function clamp01(v) { return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.7; }

function applyVolume() {
  if (master) master.gain.value = muted ? 0 : volume * volume;     // squared: the slider feels even to the ear
}

export const sfx = {
  get muted() { return muted; },
  get volume() { return volume; },
  setMuted(m) { muted = !!m; save('ff-muted', muted ? '1' : '0'); applyVolume(); if (muted) music.pauseSoon(); else music.resume(); },
  setVolume(v) { volume = clamp01(v); save('ff-vol', String(volume)); applyVolume(); },
  unlock() {
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); sfxBus = ctx.createGain(); musicBus = ctx.createGain();
        sfxBus.gain.value = 1; musicBus.gain.value = 0.35;          // music sits under the effects
        sfxBus.connect(master); musicBus.connect(master); master.connect(ctx.destination);
        applyVolume();
        music.onUnlocked();
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch { /* no audio */ }
  },
  get ready() { return !!ctx && !muted; },

  /** One oscillator blip. Each note disconnects itself when it ends, so nothing piles up. */
  tone(freq, dur = 0.12, type = 'square', vol = 0.12, slideTo = null, delay = 0) {
    if (muted || !ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(sfxBus); o.start(t); o.stop(t + dur + 0.02);
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch { /* already gone */ } };
  },
  /** A burst of filtered noise (impacts, whooshes). */
  noise(dur = 0.12, vol = 0.15, freq = 1200, q = 0.8, type = 'bandpass', sweepTo = null, delay = 0) {
    if (muted || !ctx) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(sfxBus); s.start(t); s.stop(t + dur + 0.02);
    s.onended = () => { try { s.disconnect(); f.disconnect(); g.disconnect(); } catch { /* already gone */ } };
  },

  // ---- the effects the game uses
  ui() { this.tone(660, 0.05, 'square', 0.07); this.tone(990, 0.06, 'square', 0.05, null, 0.04); },       // menu / button tap
  tick() { this.tone(880, 0.05, 'square', 0.06); },                                                          // countdown
  fight() { this.tone(220, 0.25, 'sawtooth', 0.12, 660); },                                                  // round start
  roundStart() { this.tone(330, 0.12, 'square', 0.09); this.tone(494, 0.12, 'square', 0.09, null, 0.12); this.tone(660, 0.2, 'square', 0.1, null, 0.24); },
  roundEnd() { this.tone(660, 0.12, 'triangle', 0.09); this.tone(440, 0.22, 'triangle', 0.09, 330, 0.12); },
  whoosh() { this.noise(0.2, 0.1, 400, 0.7, 'bandpass', 3000); },                                            // the punch flying in
  hit(strength = 1) {                                                                                        // a landed punch
    const s = Math.min(2, Math.max(0.6, strength));
    this.noise(0.12, 0.2 * s, 900, 0.6, 'lowpass', 120);
    this.tone(160, 0.2, 'square', 0.16 * s, 50);
    this.tone(90, 0.25, 'sawtooth', 0.1 * s, 40, 0.02);
  },
  block() { this.noise(0.07, 0.12, 2400, 4, 'bandpass'); this.tone(520, 0.1, 'square', 0.06, 380); this.tone(780, 0.08, 'triangle', 0.05, null, 0.03); },
  miss() { this.tone(300, 0.25, 'triangle', 0.08, 120); },
  ko() { this.tone(400, 0.9, 'sawtooth', 0.15, 40); this.noise(0.6, 0.12, 600, 0.5, 'lowpass', 60); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'square', 0.1, null, i * 0.14)); this.tone(1047, 0.5, 'triangle', 0.08, null, 0.6); },
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.1, f * 0.9, i * 0.22)); },
};

// ---------------------------------------------------------------------------------------------------------------
// Music
// ---------------------------------------------------------------------------------------------------------------

/** One file per arena (index = the arena number in fighters.js BACKGROUNDS). A null/missing file means "no music there". */
export const TRACKS = [
  'assets/audio/dojo.ogg',
  'assets/audio/neon.ogg',
  'assets/audio/rooftop.ogg',
  'assets/audio/volcano.ogg',
  'assets/audio/space.ogg',
];
const FADE_S = 1.2;

const cache = new Map();         // index -> decoded AudioBuffer, or null when the file is missing/bad (remembered, so we never retry)
let wantIndex = null;            // the arena whose music we should be playing
let current = null;              // { index, src, gain }
let loading = 0;                 // token: a late download for an old arena must not start

async function fetchBuffer(index) {
  if (cache.has(index)) return cache.get(index);
  let buf = null;
  try {
    const url = TRACKS[index];
    if (url) {
      const r = await fetch(url);
      if (r.ok) buf = await ctx.decodeAudioData(await r.arrayBuffer());
    }
  } catch { buf = null; }
  // keep only the buffers we may need again soon (a decoded track is a lot of memory)
  for (const k of [...cache.keys()]) if (k !== index && k !== wantIndex && k !== current?.index && cache.get(k)) cache.delete(k);
  cache.set(index, buf);
  return buf;
}

function stopTrack(t, fade) {
  if (!t) return;
  const now = ctx.currentTime;
  try {
    t.gain.gain.cancelScheduledValues(now);
    t.gain.gain.setValueAtTime(t.gain.gain.value, now);
    t.gain.gain.linearRampToValueAtTime(0, now + fade);
    t.src.stop(now + fade + 0.05);
  } catch { /* already stopped */ }
  t.src.onended = () => { try { t.src.disconnect(); t.gain.disconnect(); } catch { /* gone */ } };
}

export const music = {
  /** Play the loop for arena [index], crossfading from whatever is playing. Safe to call any time, any number of times. */
  async setArena(index) {
    wantIndex = Number.isInteger(index) ? index : null;
    if (!ctx || muted) return;                      // before the first tap (onUnlocked picks it up) or while muted (resume picks it up)
    if (current && current.index === wantIndex) return;
    const my = ++loading;
    if (wantIndex === null) { stopTrack(current, FADE_S); current = null; return; }
    const buf = await fetchBuffer(wantIndex);
    if (my !== loading || muted) return;            // the player moved on while it downloaded
    if (!buf) { stopTrack(current, FADE_S); current = null; return; }
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = buf; src.loop = true;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_S);
    src.connect(gain).connect(musicBus);
    src.start();
    stopTrack(current, FADE_S);
    current = { index: wantIndex, src, gain };
  },
  stop() { wantIndex = null; loading++; if (ctx) { stopTrack(current, 0.5); current = null; } },
  onUnlocked() { if (wantIndex !== null) this.setArena(wantIndex); },
  pauseSoon() { if (ctx && current) { stopTrack(current, 0.3); current = null; loading++; } },
  resume() { if (wantIndex !== null) this.setArena(wantIndex); },
};
