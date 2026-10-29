// Finger Fight service worker: lets the game install as an app and start without a network.
//  - this site's files: network first (so an update arrives at once), the cached copy when offline
//  - the hand-tracking library and model (big, versioned URLs): cache first, so they download only once
// Match traffic is WebRTC, which a service worker never sees.
const VERSION = 'ff-09c7118c';
const HEAVY_CACHE = 'ff-heavy';           // the 17 MB hand model lives in its own cache, so a site update never makes it download again
const SHELL = ['./', 'index.html', 'css/style.css', 'vendor/peerjs.min.js', 'manifest.webmanifest', 'icons/icon-192.png',
  'js/main.js', 'js/logic.js', 'js/net.js', 'js/hands.js', 'js/avatars.js', 'js/fighters.js',
  'js/gestures.js', 'js/audio.js', 'js/fx.js', 'js/debug.js', 'js/ice.js', 'js/names.js',
  'js/wake.js', 'js/puppet.js', 'js/skins.js', 'js/layers.js', 'js/particles.js', 'js/cosmetics.js',
  'js/inventory.js', 'js/unlock.js', 'assets/skins/manifest.json', 'assets/skins/cartoon.json', 'assets/skins/robot.json', 'assets/skins/neon.json',
  'assets/skins/paw.json', 'assets/skins/dragon.json', 'assets/skins/gauntlet.json', 'assets/skins/goldhand.json', 'assets/items/manifest.json', 'assets/items/pale.json',
  'assets/items/tan.json', 'assets/items/brown.json', 'assets/items/deep.json', 'assets/items/orc.json', 'assets/items/frost.json', 'assets/items/tribal.json',
  'assets/items/scar.json', 'assets/items/runes.json', 'assets/items/rednails.json', 'assets/items/blacknails.json', 'assets/items/neonnails.json', 'assets/items/goldring.json',
  'assets/items/silverring.json', 'assets/items/ruby.json', 'assets/items/whiteglove.json', 'assets/items/leather.json', 'assets/items/fingerless.json', 'assets/items/knight.json'];
const HEAVY = ['https://cdn.jsdelivr.net/npm/@mediapipe/', 'https://storage.googleapis.com/mediapipe-models/'];

self.addEventListener('install', e => {
  // 'reload' = fetch from the server, never the browser's HTTP cache, so the precache cannot capture a stale file
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' }))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== HEAVY_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  if (HEAVY.some(p => url.startsWith(p))) {
    e.respondWith(caches.open(HEAVY_CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (new URL(url).origin !== self.location.origin) return;
  if (url.includes('/assets/audio/')) {                       // music never changes under the same name: cache first, download once
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  // 'no-cache' = ask the server whether the file changed, so the page, its scripts and its styles are never a mix of two releases
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
});
