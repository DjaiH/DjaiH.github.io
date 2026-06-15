/* Service worker — caches the app shell so it runs fully offline after the first visit.
   Bump CACHE when you change index.html so clients pick up the new version. */
const CACHE = 'mini-game-hub-v14';
const ASSETS = [
  './', './index.html', './manifest.json', './icon.svg',
  './css/styles.css',
  './js/core.js', './js/game-clicker.js', './js/game-dungeon.js', './js/sw-register.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Network-first for navigations so updates appear; fall back to cache when offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  // Cache-first for other assets.
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
