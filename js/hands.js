// Camera + hand tracking, and a camera-free simulator with the same interface (?sim=1) for testing.
// The MediaPipe runtime and hand model are loaded from the CDN, as in the original fingers app (about 17 MB, once).
import { countHands, classifyHands } from './gestures.js';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const CONN = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const SAMPLES = 9;          // frames kept for the snap
const PHOTO_WIDTH = 240;

/** Most common value; ties go to the most recent. */
function mode(values) {
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

  /** The pointer's answer: number, gesture, and a small photo as proof. */
  snap() {
    const recent = this.samples.slice(-7);
    const seen = recent.filter(s => s.has);
    const noHand = recent.length === 0 || seen.length * 2 < recent.length;
    const count = noHand ? 0 : mode(seen.map(s => s.count)).value;
    const g = mode(seen.map(s => s.gesture).filter(Boolean));
    const gesture = !noHand && g.n >= 3 ? g.value : null;
    return { count, gesture, noHand, photo: this.#photo(seen.length ? seen[seen.length - 1].hands : []) };
  }

  #photo(hands) {
    const v = this.video;
    if (!v.videoWidth) return '';
    const w = PHOTO_WIDTH, h = Math.round((w * v.videoHeight) / v.videoWidth);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (this.facing === 'user') { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0, w, h);
    drawSkeleton(ctx, hands, w, h, 2);
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
  set(patch) { Object.assign(this.sim, patch); this.run(); }
  snap() {
    const { count, gesture, noHand } = this.sim;
    const c = document.createElement('canvas');
    c.width = 240; c.height = 180;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, 240, 180);
    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 90px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(noHand ? '-' : String(count), 120, 110);
    ctx.fillStyle = '#94a3b8'; ctx.font = '18px sans-serif';
    ctx.fillText('simulated hand' + (gesture ? ' · ' + gesture : ''), 120, 150);
    return { count, gesture, noHand, photo: c.toDataURL('image/jpeg', 0.6) };
  }
}
