// Camera + hand tracking, and a camera-free simulator with the same interface (?sim=1) for testing.
// The MediaPipe runtime and hand model are loaded from the CDN, as in the original fingers app (about 17 MB, once).
import { countHands, classifyHands, fingerStates } from './gestures.js';
import { skinById, statesFromCount, annotate, FINGERS, TIP_ID } from './avatars.js';
import { VIEWS } from './logic.js';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const CONN = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const SAMPLES = 9;          // frames kept for the snap
const PHOTO_WIDTH = 240;

/** Most common value; ties go to the most recent. */
function mode_(values) {
  const n = new Map();
  let best = null, bestN = 0;
  for (const v of values) {
    const c = (n.get(v) || 0) + 1;
    n.set(v, c);
    if (c >= bestN) { best = v; bestN = c; }
  }
  return { value: best, n: bestN };
}

function drawSkeleton(ctx, hands, w, h, lineWidth) {
  ctx.lineWidth = lineWidth;
  for (const lm of hands) {
    ctx.strokeStyle = '#22d3ee';
    for (const [a, b] of CONN) {
      ctx.beginPath(); ctx.moveTo(lm[a].x * w, lm[a].y * h); ctx.lineTo(lm[b].x * w, lm[b].y * h); ctx.stroke();
    }
    ctx.fillStyle = '#fbbf24';
    for (const p of lm) { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, lineWidth * 1.3, 0, 7); ctx.fill(); }
  }
}

export class HandCam {
  constructor(video, canvas) {
    this.video = video; this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.facing = 'user';
    this.landmarker = null; this.stream = null;
    this.samples = []; this.running = false; this.lastTime = -1;
    this.onFrame = null;
  }

  async load() {
    const mod = await import(MP + '/vision_bundle.mjs');
    const fileset = await mod.FilesetResolver.forVisionTasks(MP + '/wasm');
    const make = delegate => mod.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numHands: 2 });
    try { this.landmarker = await make('GPU'); } catch { this.landmarker = await make('CPU'); }
  }

  /** @returns {Promise<string|null>} an error message, or null when the camera is running */
  async startCamera() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (!navigator.mediaDevices?.getUserMedia) return 'The camera needs a secure page (https, or localhost).';
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: this.facing }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    } catch (e) {
      return e.name === 'NotAllowedError' || e.name === 'SecurityError'
        ? 'Camera permission denied. Allow the camera in the browser site settings, then reload.'
        : 'Could not open the camera (' + e.name + ').';
    }
    this.video.srcObject = this.stream;
    await this.video.play();
    const mirror = this.facing === 'user';
    this.video.classList.toggle('mirror', mirror);
    this.canvas.classList.toggle('mirror', mirror);
    return null;
  }

  async flip() { this.facing = this.facing === 'user' ? 'environment' : 'user'; return this.startCamera(); }

  run() {
    if (this.running || !this.landmarker) return;
    this.running = true;
    this.samples = [];
    const loop = () => {
      if (!this.running) return;
      const v = this.video;
      if (v.readyState >= 2 && v.currentTime !== this.lastTime) {
        this.lastTime = v.currentTime;
        if (this.canvas.width !== v.videoWidth) { this.canvas.width = v.videoWidth; this.canvas.height = v.videoHeight; }
        const hands = this.landmarker.detectForVideo(v, performance.now()).landmarks || [];
        const aspect = v.videoWidth / v.videoHeight;
        const s = { has: hands.length > 0, count: countHands(hands, aspect), gesture: classifyHands(hands, aspect), hands };
        this.samples.push(s);
        if (this.samples.length > SAMPLES) this.samples.shift();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        drawSkeleton(this.ctx, hands, this.canvas.width, this.canvas.height, 3);
        this.onFrame?.(s);
      }
      requestAnimationFrame(loop);
    };
    loop();
  }

  pause() {
    this.running = false;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Switches the camera OFF (tracks stopped, so the phone's camera light goes out), not just the analysis. */
  stopCamera() {
    try { this.stream?.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
    this.stream = null;
    try { this.video.pause(); this.video.srcObject = null; } catch { /* ignore */ }
  }

  /** Pause + camera off + forget the frames. The camera is opened again (startCamera) only for the next guess window. */
  release() {
    this.pause();
    this.stopCamera();
    this.samples = [];
  }

  get cameraOn() { return !!this.stream && this.stream.getTracks().some(t => t.readyState === 'live'); }

  /**
   * The answer for this round: the count, any gesture, and how to show the hand. [style] = {mode, skin} where mode is
   * one of VIEWS. Always returns the structured finger data (`hands`, and `lm` landmarks) so the receiver can draw a
   * cartoon or skeleton itself; `photo` is a JPEG only for the photo-based modes, otherwise ''.
   */
  snap(style = {}) {
    const mode = VIEWS.includes(style.mode) ? style.mode : 'avatar';
    const recent = this.samples.slice(-7);
    const seen = recent.filter(s => s.has);
    const noHand = recent.length === 0 || seen.length * 2 < recent.length;
    const count = noHand ? 0 : mode_(seen.map(s => s.count)).value;
    const g = mode_(seen.map(s => s.gesture).filter(Boolean));
    const gesture = !noHand && g.n >= 3 ? g.value : null;

    const v = this.video;
    const ar = v.videoWidth && v.videoHeight ? Math.min(3, Math.max(0.3, v.videoWidth / v.videoHeight)) : 1.333;
    // the frame whose finger count matches the answer, so the picture agrees with the number
    const best = noHand ? null : ([...seen].reverse().find(s => s.count === count) || seen[seen.length - 1]);
    const hands = best ? best.hands.slice(0, 2) : [];
    const states = hands.map(lm => fingerStates(lm, ar));
    const mirror = this.facing === 'user';
    const q = x => Math.max(0, Math.min(1000, Math.round(x * 1000)));
    const lm = hands.length ? hands.map(h => h.map(p => [q(mirror ? 1 - p.x : p.x), q(p.y)])) : null;
    const photoMode = mode === 'photo' || mode === 'photo-skeleton' || mode === 'blur';
    const photo = photoMode && hands.length ? this.#photo(hands, states, mode, ar) : '';
    // photo-based views without a photo (no hand) are shown as a cartoon by the receiver
    return { count, gesture, noHand, photo, view: mode, skin: skinById(style.skin).id, hands: states, lm, ar };
  }

  #photo(hands, states, mode, ar) {
    const v = this.video;
    if (!v.videoWidth) return '';
    const w = PHOTO_WIDTH, h = Math.round((w * v.videoHeight) / v.videoWidth);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const mirror = this.facing === 'user';
    ctx.save();
    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    if (mode === 'blur') {                       // heavy blur: draw tiny, scale up (works in every browser)
      const t = document.createElement('canvas');
      t.width = 16; t.height = Math.max(1, Math.round((16 * h) / w));
      t.getContext('2d').drawImage(v, 0, 0, t.width, t.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(t, 0, 0, w, h);
    } else {
      ctx.drawImage(v, 0, 0, w, h);
    }
    if (mode !== 'photo') drawSkeleton(ctx, hands, w, h, 2);
    ctx.restore();
    const tips = [];
    hands.forEach((lm, i) => {
      for (const f of FINGERS) if (states[i] && states[i][f]) { const p = lm[TIP_ID[f]]; tips.push({ finger: f, x: (mirror ? 1 - p.x : p.x) * w, y: p.y * h }); }
    });
    annotate(ctx, tips, Math.max(8, h * 0.07));
    return c.toDataURL('image/jpeg', 0.6);
  }
}

/** Stand-in for the camera: the player sets the count and gesture by hand. Same interface as HandCam. */
export class SimCam {
  constructor() { this.sim = { count: 0, gesture: null, noHand: false }; this.onFrame = null; }
  async load() { /* nothing to download */ }
  async startCamera() { return null; }
  async flip() { return null; }
  run() { this.onFrame?.({ has: !this.sim.noHand, count: this.sim.count, gesture: this.sim.gesture }); }
  pause() {}
  release() {}
  stopCamera() {}
  get cameraOn() { return false; }
  set(patch) { Object.assign(this.sim, patch); this.run(); }
  snap(style = {}) {
    const mode = VIEWS.includes(style.mode) ? style.mode : 'avatar';
    const { count, gesture, noHand } = this.sim;
    const hands = noHand ? [] : statesFromCount(count);
    const photoMode = mode === 'photo' || mode === 'photo-skeleton' || mode === 'blur';
    let photo = '';
    if (photoMode && !noHand) {              // a stand-in "photo" so the photo path can be tested without a camera
      const c = document.createElement('canvas');
      c.width = 240; c.height = 180;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, 240, 180);
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 90px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(String(count), 120, 110);
      photo = c.toDataURL('image/jpeg', 0.6);
    }
    return { count: noHand ? 0 : count, gesture: noHand ? null : gesture, noHand, photo, view: mode, skin: skinById(style.skin).id, hands, lm: null, ar: 1.333 };
  }
}
