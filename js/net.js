// Two-player link over PeerJS (WebRTC data channel). The public PeerJS server only introduces the two phones;
// after that, messages go phone to phone. Room code = the host's peer id (prefixed). `Peer` is the global from
// vendor/peerjs.min.js.

const PREFIX = 'ffight-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I
const MAX_MESSAGE_CHARS = 200_000;                      // a photo is ~20k; anything huge is ignored

export function newCode() {
  let c = '';
  const buf = new Uint32Array(4);
  crypto.getRandomValues(buf);
  for (const n of buf) c += ALPHABET[n % ALPHABET.length];
  return c;
}

export const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

export class Link {
  /** handlers: onOpen(), onMessage(obj), onClose(reason), onStatus(text) */
  constructor(handlers) {
    this.h = handlers;
    this.peer = null;
    this.conn = null;
    this.closed = false;
  }

  get open() { return !!this.conn && this.conn.open; }

  /** Opens a room. Resolves with the code, rejects if the id is taken (caller can try another code). */
  host(code) {
    return new Promise((resolve, reject) => {
      this.peer = new Peer(PREFIX + code);
      this.peer.on('open', () => { this.h.onStatus?.('Room ' + code + ' is open. Waiting for a player…'); resolve(code); });
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

  /** Joins a room by code. Resolves when the data channel is open. */
  join(code) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 15000);
      this.peer = new Peer();
      this.peer.on('error', e => {
        clearTimeout(timer);
        if (!this.conn || !this.conn.open) reject(new Error(e.type === 'peer-unavailable' ? 'no-room' : e.type || 'error'));
        else this.#lost(e.type);
      });
      this.peer.on('open', () => {
        this.h.onStatus?.('Connecting to room ' + code + '…');
        this.#adopt(this.peer.connect(PREFIX + code, { reliable: true }), () => { clearTimeout(timer); resolve(); });
      });
    });
  }

  #adopt(conn, onOpen) {
    this.conn = conn;
    conn.on('open', () => { onOpen?.(); this.h.onOpen?.(); });
    conn.on('data', d => {
      if (!d || typeof d !== 'object' || typeof d.t !== 'string') return;
      if (JSON.stringify(d).length > MAX_MESSAGE_CHARS) return;
      this.h.onMessage?.(d);
    });
    conn.on('close', () => this.#lost('closed'));
    conn.on('error', e => this.#lost(e.type || 'error'));
  }

  #lost(reason) {
    if (this.closed) return;
    this.closed = true;
    this.h.onClose?.(reason);
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
