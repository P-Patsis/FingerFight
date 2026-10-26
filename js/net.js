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

export class Link {
  /** handlers: onOpen(), onMessage(obj), onClose(reason), onStatus(text) */
  constructor(handlers) {
    this.h = handlers;
    this.peer = null;
    this.conn = null;
    this.closed = false;
  }

  get open() { return !!this.conn && this.conn.open; }

  /** Opens a room under [peerId]. Resolves with the id, rejects ('taken') if someone already uses it. */
  host(peerId) {
    return new Promise((resolve, reject) => {
      this.peer = new Peer(peerId);
      this.peer.on('open', () => { this.h.onStatus?.('Room is open. Waiting for a player…'); resolve(peerId); });
      this.peer.on('error', e => {
        if (e.type === 'unavailable-id') reject(new Error('taken'));
        else if (!this.conn) reject(new Error(e.type || 'error'));
        else this.#lost(e.type);
      });
      this.peer.on('connection', c => {
        if (this.conn) { c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 300); }); return; }
        this.#adopt(c);
      });
      this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch { /* ignore */ } });
    });
  }

  /** Joins the room [peerId]. Resolves when the data channel is open; rejects ('no-room', 'timeout', …). */
  join(peerId, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      this.peer = new Peer();
      this.peer.on('error', e => {
        clearTimeout(timer);
        if (!this.conn || !this.conn.open) reject(new Error(e.type === 'peer-unavailable' ? 'no-room' : e.type || 'error'));
        else this.#lost(e.type);
      });
      this.peer.on('open', () => {
        this.h.onStatus?.('Connecting…');
        this.#adopt(this.peer.connect(peerId, { reliable: true }), () => { clearTimeout(timer); resolve(); });
      });
    });
  }

  #adopt(conn, onOpen) {
    this.conn = conn;
    conn.on('open', () => { onOpen?.(); this.h.onOpen?.(); });
    conn.on('data', d => {
      if (conn !== this.conn) return;
      if (!d || typeof d !== 'object' || typeof d.t !== 'string') return;
      if (JSON.stringify(d).length > MAX_MESSAGE_CHARS) return;
      this.h.onMessage?.(d);
    });
    conn.on('close', () => { if (conn === this.conn) this.#lost('closed'); });
    conn.on('error', e => { if (conn === this.conn) this.#lost(e.type || 'error'); });
  }

  #lost(reason) {
    if (this.closed) return;
    this.closed = true;
    this.h.onClose?.(reason);
  }

  /** Host only: disconnect the current guest (declined, or never said hello) and keep the room open for another. */
  dropGuest() {
    const c = this.conn;
    this.conn = null;                 // events from the old connection are now ignored
    try { c?.close(); } catch { /* ignore */ }
  }

  send(obj) {
    if (this.open) this.conn.send(obj);
  }

  close() {
    this.closed = true;
    try { this.conn?.close(); } catch { /* ignore */ }
    try { this.peer?.destroy(); } catch { /* ignore */ }
  }
}
