// Two-player link over PeerJS (WebRTC data channel). The public PeerJS server only introduces the two phones;
// after that, messages go phone to phone. `Peer` is the global from vendor/peerjs.min.js.
//
// Two kinds of room id:
//   private: 'ffight-p-' + a 16-character random code (80 bits: not guessable), shared by the host with friends
//   random:  'ffight-r-' + slot number, a few well-known slots where strangers find each other (see main.js)

const PRIVATE = 'ffight-p-';
const RANDOM = 'ffight-r-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 32 symbols, no 0/O/1/I
const MAX_MESSAGE_CHARS = 200_000;                      // a photo is ~20k; anything huge is ignored
export const CODE_LEN = 16;

export function newCode() {
  let c = '';
  const buf = new Uint32Array(CODE_LEN);
  crypto.getRandomValues(buf);
  for (const n of buf) c += ALPHABET[n % ALPHABET.length];
  return c;
}

/** Uppercase letters and digits only, at most CODE_LEN: so a pasted "ABCD-EFGH-…" or a link tail works. */
export const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
/** "ABCD-EFGH-JKLM-NPQR" for showing. */
export const formatCode = c => String(c).replace(/(.{4})(?=.)/g, '$1-');
export const privateId = code => PRIVATE + code;
export const randomId = slot => RANDOM + slot;

const PING_MS = 3000;           // heartbeat: a silent link is declared dead after DEAD_MS and re-dialled
const DEAD_MS = 10000;
const GRACE_MS = 45000;         // how long a dropped link keeps trying before the match is given up
const PEER_CONFIG = {           // PeerJS's own defaults plus one more STUN server (passing `config` replaces the defaults)
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  ],
  sdpSemantics: 'unified-plan',
};
/** [relay]: only ever talk through the relay server, so the other phone never learns this phone's IP address. */
export const newPeer = (id, relay = false) => {
  const config = relay ? { ...PEER_CONFIG, iceTransportPolicy: 'relay' } : PEER_CONFIG;
  return id ? new Peer(id, { config }) : new Peer({ config });
};
export const newToken = () => {
  const buf = new Uint32Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf, n => ALPHABET[n % ALPHABET.length]).join('');
};
export const validToken = t => typeof t === 'string' && /^[A-Z0-9]{24}$/.test(t);

export class Link {
  /** handlers: onOpen(), onMessage(obj), onClose(reason), onStatus(text), onReconnecting(), onReconnected(), canResume() */
  constructor(handlers, opts = {}) {
    this.h = handlers;
    this.relay = !!opts.relay;
    this.peer = null;
    this.conn = null;
    this.closed = false;
    this.token = null;           // shared secret of this pairing: only the player who holds it can take the seat back
    this.grace = false;
    this.role = null;            // 'host' | 'guest'
    this.roomId = null;
    this.lastSeen = 0;
    this.timers = [];
    this.candidates = new Set();
  }

  get open() { return !!this.conn && this.conn.open && !this.grace; }

  setToken(t) { this.token = validToken(t) ? t : null; }

  /** Opens a room under [peerId]. Resolves with the id, rejects ('taken') if someone already uses it. */
  host(peerId) {
    this.role = 'host'; this.roomId = peerId;
    return new Promise((resolve, reject) => {
      this.peer = newPeer(peerId, this.relay);
      this.peer.on('open', () => { this.h.onStatus?.('Room is open. Waiting for a player…'); resolve(peerId); });
      this.peer.on('error', e => {
        if (e.type === 'unavailable-id') reject(new Error('taken'));
        else if (!this.conn && !this.grace) reject(new Error(e.type || 'error'));
        else if (['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'].includes(e.type)) this.#softReconnectPeer();
        // other errors while a game is on (e.g. a failed stranger) do not end it
      });
      this.peer.on('connection', c => this.#incoming(c));
      this.peer.on('disconnected', () => this.#softReconnectPeer());
    });
  }

  /** Host after a page reload: re-claim the same room id, retrying while the signalling server frees the old one. */
  async rehost(peerId, tries = 12) {
    for (let i = 0; i < tries; i++) {
      try { await this.host(peerId); return; } catch (e) {
        try { this.peer?.destroy(); } catch { /* ignore */ }
        if (e.message !== 'taken' || this.closed) throw e;
        await new Promise(r => setTimeout(r, 2500));
      }
    }
    throw new Error('taken');
  }

  #softReconnectPeer() {
    if (this.closed || !this.peer) return;
    try { this.peer.reconnect(); } catch { /* ignore */ }
  }

  /** Joins the room [peerId]. Resolves when the data channel is open (and, with [resume], the host took us back). */
  join(peerId, timeoutMs = 15000, resume = null) {
    this.role = 'guest'; this.roomId = peerId;
    if (resume) this.setToken(resume);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      this.peer = newPeer(null, this.relay);
      this.peer.on('error', e => {
        clearTimeout(timer);
        if (!this.conn || !this.conn.open) reject(new Error(e.type === 'peer-unavailable' ? 'no-room' : e.type || 'error'));
        else if (!this.grace) this.#drop(e.type || 'error');
      });
      this.peer.on('disconnected', () => this.#softReconnectPeer());
      this.peer.on('open', () => {
        this.h.onStatus?.('Connecting…');
        this.#dial(resume ? () => { clearTimeout(timer); resolve(); } : () => { clearTimeout(timer); resolve(); }, !!resume);
      });
    });
  }

  #dial(onUp, resuming) {
    const c = this.peer.connect(this.roomId, { reliable: true });
    this.#adopt(c, () => {
      if (resuming) c.send({ t: 'resume', token: this.token });
      else onUp();
    }, resuming ? onUp : null);
  }

  #adopt(conn, onOpen, onResumed) {
    this.conn = conn;
    this.lastSeen = Date.now();
    this.resumedCb = onResumed || null;
    conn.on('open', () => { this.lastSeen = Date.now(); this.#heartbeat(); onOpen?.(); if (!onResumed) this.h.onOpen?.(); });
    if (conn.open && !onOpen && !onResumed) this.#heartbeat();      // adopted after it was already open
    conn.on('data', d => {
      if (conn !== this.conn) return;
      this.lastSeen = Date.now();
      if (!d || typeof d !== 'object' || typeof d.t !== 'string') return;
      if (JSON.stringify(d).length > MAX_MESSAGE_CHARS) return;
      if (d.t === 'ping') { this.peerPings = true; return; }
      if (d.t === 'resumed') { this.#resumedOk(); return; }
      if (d.t === 'resume') return;                       // only meaningful on a fresh connection (see #incoming)
      this.h.onMessage?.(d);
    });
    conn.on('close', () => { if (conn === this.conn) this.#drop('closed'); });
    conn.on('error', e => { if (conn === this.conn) this.#drop(e.type || 'error'); });
  }

  #heartbeat() {
    if (this.hb) return;
    this.hb = setInterval(() => {
      if (this.closed) return;
      if (this.grace) return;
      if (this.conn?.open) { try { this.conn.send({ t: 'ping' }); } catch { /* ignore */ } }
      if (this.conn && this.peerPings && Date.now() - this.lastSeen > DEAD_MS) this.#drop('silent');
    }, PING_MS);
    this.hb.unref?.();
  }

  /** Host: a new connection. If a seat is taken it must prove it holds the token; otherwise it is "full". */
  #incoming(c) {
    if (!this.conn && !this.grace) { this.#adopt(c); return; }                  // a fresh guest
    if (!this.token && !this.grace) {                                           // seat taken, nobody could be resuming
      c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 300); });
      return;
    }
    this.candidates.add(c);
    const kill = reply => { this.candidates.delete(c); if (reply) { try { c.send(reply); } catch { /* ignore */ } } setTimeout(() => { try { c.close(); } catch { /* ignore */ } }, 300); };
    const timer = setTimeout(() => kill(), 4000);
    timer.unref?.();
    c.on('data', d => {
      if (!this.candidates.has(c)) return;
      clearTimeout(timer);
      if (d && d.t === 'resume' && this.token && d.token === this.token && !this.closed) {
        this.candidates.delete(c);
        const old = this.conn;
        this.conn = null;
        try { old?.close(); } catch { /* ignore */ }
        this.#adopt(c);
        this.resumedCb = null;
        c.send({ t: 'resumed' });
        this.#resumedOk(true);
      } else if (!this.conn && !this.grace) {
        // the seat is empty and this is a normal first message: treat as a fresh guest
        this.candidates.delete(c);
        this.#adopt(c);
        this.h.onMessage?.(d);
      } else kill({ t: 'full' });
    });
    c.on('close', () => this.candidates.delete(c));
  }

  #resumedOk(asHost = false) {
    if (!this.grace && !this.rejoining && !asHost) { this.resumedCb?.(); this.resumedCb = null; return; }
    this.grace = false; this.rejoining = false;
    this.timers.forEach(clearTimeout); this.timers = [];
    this.lastSeen = Date.now();
    this.resumedCb?.(); this.resumedCb = null;
    this.h.onReconnected?.();
  }

  #drop(reason) {
    if (this.closed || this.grace) return;
    if (this.token && this.h.canResume?.()) {
      this.grace = true;
      this.h.onReconnecting?.();
      this.timers.push(setTimeout(() => { this.grace = false; this.#lost('timeout'); }, GRACE_MS));
      try { this.conn?.close(); } catch { /* ignore */ }
      if (this.role === 'guest') this.#redial();
      return;
    }
    this.#lost(reason);
  }

  #redial() {
    if (this.closed || !this.grace) return;
    const again = () => { if (this.grace && !this.closed) this.timers.push(setTimeout(() => this.#redial(), 3000)); };
    try {
      if (!this.peer || this.peer.destroyed || this.peer.disconnected) {
        try { this.peer?.destroy(); } catch { /* ignore */ }
        this.peer = newPeer(null, this.relay);
        this.peer.on('error', () => again());
        this.peer.on('open', () => this.#redial());
        return;
      }
      const c = this.peer.connect(this.roomId, { reliable: true });
      this.conn = c;
      let upTimer = setTimeout(() => { try { c.close(); } catch { /* ignore */ } again(); }, 7000);
      this.#adopt(c, () => c.send({ t: 'resume', token: this.token }), () => clearTimeout(upTimer));
      this.rejoining = true;
      c.on('close', () => { clearTimeout(upTimer); if (this.grace) again(); });
    } catch { again(); }
  }

  #lost(reason) {
    if (this.closed) return;
    this.closed = true;
    this.timers.forEach(clearTimeout);
    clearInterval(this.hb);
    this.h.onClose?.(reason);
  }

  /** Host only: disconnect the current guest (declined, or never said hello) and keep the room open for another. */
  dropGuest() {
    const c = this.conn;
    this.conn = null;                 // events from the old connection are now ignored
    this.token = null;
    try { c?.close(); } catch { /* ignore */ }
  }

  send(obj) {
    if (this.open) this.conn.send(obj);
  }

  close() {
    this.closed = true;
    this.timers.forEach(clearTimeout);
    clearInterval(this.hb);
    try { this.conn?.close(); } catch { /* ignore */ }
    try { this.peer?.destroy(); } catch { /* ignore */ }
  }
}
