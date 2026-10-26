// Tiny synthesized sound effects (no audio files). Starts on the first tap, as browsers require.
let ctx = null;
let muted = false;

export const sfx = {
  get muted() { return muted; },
  setMuted(m) { muted = !!m; },
  unlock() {
    try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch { /* no audio */ }
  },
  tone(freq, dur = 0.12, type = 'square', vol = 0.12, slideTo = null, delay = 0) {
    if (muted || !ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  tick() { this.tone(880, 0.05, 'square', 0.06); },
  fight() { this.tone(220, 0.25, 'sawtooth', 0.12, 660); },
  whoosh() { this.tone(900, 0.18, 'sawtooth', 0.07, 120); },
  hit() { this.tone(160, 0.2, 'square', 0.18, 50); this.tone(90, 0.25, 'sawtooth', 0.12, 40, 0.02); },
  crit() { this.hit(); this.tone(1200, 0.35, 'square', 0.1, 300, 0.05); this.tone(600, 0.4, 'sawtooth', 0.1, 1800, 0.15); },
  miss() { this.tone(300, 0.25, 'triangle', 0.08, 120); },
  ko() { this.tone(400, 0.9, 'sawtooth', 0.15, 40); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'square', 0.1, null, i * 0.14)); },
};
