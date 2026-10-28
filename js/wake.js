// Keeps the screen awake while a match is on screen (nobody touches the phone during a fight, so it would dim and sleep).
// Uses the Screen Wake Lock API. Browsers drop the lock by themselves when the page is hidden, so it is released
// on hide and asked for again when the page is visible and a match is still wanted. Unsupported browser = does nothing.

/** @param {{nav?: any, doc?: any}} env  injectable for tests */
export function createWakeLock({ nav = globalThis.navigator, doc = globalThis.document } = {}) {
  let wanted = false, sentinel = null, busy = false;
  const supported = !!nav?.wakeLock?.request;

  async function acquire() {
    if (!supported || !wanted || sentinel || busy || doc?.hidden) return;
    busy = true;
    try {
      const s = await nav.wakeLock.request('screen');
      if (!wanted || doc?.hidden) { s.release?.().catch?.(() => {}); }      // the match ended (or the page hid) while the request was pending
      else {
        sentinel = s;
        s.addEventListener?.('release', () => { if (sentinel === s) sentinel = null; });
      }
    } catch { /* denied (battery saver, no permission): the screen may dim, the game still works */ }
    finally { busy = false; }
  }

  async function drop() {
    const s = sentinel; sentinel = null;
    try { await s?.release?.(); } catch { /* ignore */ }
  }

  doc?.addEventListener?.('visibilitychange', () => { if (doc.hidden) drop(); else acquire(); });

  return {
    supported,
    /** true while a match is on screen; false when it ends or the player leaves */
    want(on) { wanted = !!on; return wanted ? acquire() : drop(); },
    get active() { return !!sentinel; },
  };
}
