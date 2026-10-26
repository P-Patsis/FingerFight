// A tiny fake browser (DOM + PeerJS + storage) so js/main.js can run in plain Node. Only what the game uses.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

class El {
  constructor(tag, id = '') {
    this.tagName = tag.toUpperCase(); this.id = id;
    this.children = []; this.parentElement = null;
    this.style = {}; this.attrs = {};
    this.dataset = new Proxy({}, { set(t, k, v) { t[k] = String(v); return true; } });   // like a real DOM: values are strings
    this._cls = new Set(); this.hidden = false; this.disabled = false;
    this._text = ''; this.innerHTML = ''; this.value = ''; this.src = ''; this.alt = ''; this.type = '';
    this.listeners = {};
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }   // like a real DOM: always a string
  get className() { return [...this._cls].join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get classList() {
    const s = this._cls;
    return { add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)),
      contains: c => s.has(c), toggle: (c, force) => { const on = force === undefined ? !s.has(c) : !!force; on ? s.add(c) : s.delete(c); return on; } };
  }
  get firstElementChild() { return this.children[0] || null; }
  get offsetWidth() { return 0; }
  append(...nodes) { for (const n of nodes) { if (typeof n === 'string') continue; n.parentElement?.removeChild(n); n.parentElement = this; this.children.push(n); } }
  replaceChildren(...nodes) { for (const c of this.children) c.parentElement = null; this.children = []; this.append(...nodes); }
  removeChild(n) { this.children = this.children.filter(c => c !== n); n.parentElement = null; }
  remove() { this.parentElement?.removeChild(this); }
  setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  matches(sel) {
    if (sel.startsWith('.')) return this._cls.has(sel.slice(1));
    const m = sel.match(/^\[data-([a-z]+)\]$/);
    return !!m && Object.prototype.hasOwnProperty.call(this.dataset, m[1]);
  }
  closest(sel) { for (let n = this; n; n = n.parentElement) if (n.matches(sel)) return n; return null; }
  querySelectorAll(sel) { const out = []; const walk = n => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  getContext() { return new Proxy({}, { get: () => () => {}, set: () => true }); }
  toDataURL() { return 'data:image/jpeg;base64,AAAA'; }
  /** Test helper: fire a registered listener. */
  fire(type, ev = {}) { for (const f of this.listeners[type] || []) f({ target: this, ...ev }); }
}

export class Conn {
  constructor() { this.open = false; this.sent = []; this.h = {}; }
  on(e, f) { (this.h[e] ||= []).push(f); }
  emit(e, ...a) { if (e === 'open') this.open = true; for (const f of this.h[e] || []) f(...a); }
  send(o) { this.sent.push(JSON.parse(JSON.stringify(o))); }
  close() { this.open = false; }
}

export const peers = [];
class FakePeer {
  constructor(id) { this.id = id; this.h = {}; this.conn = null; peers.push(this); setTimeout(() => this.emit('open', id), 0); }
  on(e, f) { (this.h[e] ||= []).push(f); }
  emit(e, ...a) { for (const f of this.h[e] || []) f(...a); }
  connect() { this.conn = new Conn(); setTimeout(() => this.conn.emit('open'), 0); return this.conn; }
  destroy() {} reconnect() {}
}

/** Installs the fake browser globals. [search] is the page's query string, e.g. '?sim=1'. */
export function installBrowser(search) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const byId = new Map();
  for (const m of html.matchAll(/<(\w+)([^>]*?)\sid="([^"]+)"([^>]*)>/g)) {
    const e = new El(m[1], m[3]);
    const attrs = m[2] + ' ' + m[4];
    const cls = attrs.match(/class="([^"]*)"/);
    if (cls) e.className = cls[1];
    if (/\shidden(\s|$)/.test(attrs)) e.hidden = true;
    byId.set(m[3], e);
  }
  // the "data-step" buttons and the timer bar's inner <i>
  byId.get('timerBar').append(new El('i'));
  const body = new El('body');
  const screens = [...byId.values()].filter(e => e.matches('.screen'));
  for (const e of byId.values()) if (!e.parentElement) body.append(e);
  globalThis.document = {
    body,
    getElementById: id => { const e = byId.get(id); if (!e) throw new Error('getElementById: no element #' + id); return e; },
    querySelectorAll: sel => (sel === '.screen' ? screens : []),
    createElement: tag => new El(tag),
  };
  globalThis.location = { search, origin: 'https://example.test', pathname: '/fingerfight/' };
  const mem = new Map();
  globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => {} } }, configurable: true });
  globalThis.Peer = FakePeer;
  return { byId, screens, visible: () => screens.filter(s => !s.hidden).map(s => s.id) };
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function until(cond, what, ms = 20000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting for: ' + what);
    await sleep(25);
  }
}
