// How a locked cosmetic becomes owned. THIS FILE IS THE STUB BOUNDARY.
//
// Today every unlock is a placeholder: "Watch ad" and "Buy" just grant the item at once. No ad network, no payment processor, no
// network request of any kind exists in the web app. The Store (main.js) knows only two things from here:
//   unlockItem(inventory, entry)  - ask the current provider; grant the item only if the provider says granted
//   unlockLabel(entry)            - the button text
//
// FOR THE NATIVE APP: call setUnlockProvider() once at start-up with a provider that does the real thing, and nothing else changes:
//   { name: 'admob',  request: async entry => ({ granted: <the rewarded ad was completed>, receipt: <ad reward id> }) }
//   { name: 'play',   request: async entry => ({ granted: <Google Play purchase verified>, receipt: <purchase token> }) }
// A real provider must verify the purchase/reward itself (server-side receipt check for payments) before it answers granted: true.
// The inventory only records "owned"; it does not check anything, by design.

/** The placeholder provider: grants everything instantly. Replace it in the native build. */
export const stubProvider = Object.freeze({
  name: 'stub',
  async request(entry) { return { granted: true, receipt: 'stub:' + entry.id }; },
});

let provider = stubProvider;
/** Installs the provider the Store will use (native build). Anything without a request() function is refused. */
export function setUnlockProvider(p) {
  if (!p || typeof p.request !== 'function') throw new Error('unlock provider needs a request(entry) function');
  provider = p;
}
export const unlockProviderName = () => provider.name || 'custom';
export function resetUnlockProvider() { provider = stubProvider; }

/** Asks the provider to unlock [entry] and grants it on success. Resolves {granted, receipt, error?}; never throws. */
export async function unlockItem(inventory, entry) {
  if (!entry) return { granted: false, error: 'unknown item' };
  if (inventory.owns(entry.id)) return { granted: true, receipt: 'owned' };
  try {
    const res = await provider.request(entry);
    if (res && res.granted === true && inventory.grant(entry.id, entry.unlock?.method || 'stub')) return { granted: true, receipt: res.receipt ?? null };
    return { granted: false, error: (res && res.error) || 'not unlocked' };
  } catch (e) {
    return { granted: false, error: String((e && e.message) || e) };
  }
}

/** The button text for a locked item. While the stub is installed these say "demo" so nobody thinks money or an ad is involved. */
export function unlockLabel(entry) {
  const demo = provider === stubProvider ? ' (demo)' : '';
  const m = entry.unlock?.method;
  if (m === 'purchase') return 'Buy' + (entry.unlock.price ? ' ' + entry.unlock.price : '') + demo;
  if (m === 'ad') return 'Watch ad to unlock' + demo;
  return 'Unlock';
}
