// CRUMB — service worker minimo.
// Rete prima: se c'è connessione si usa sempre la versione più recente e la si salva;
// offline si usa l'ultima copia salvata. Così un aggiornamento non resta mai bloccato in cache.
const CACHE = 'crumb-v13';
const FILES = ['./', 'index.html', 'app.js?v=13', 'data.js?v=13', 'ricette.js?v=13', 'manifest.webmanifest', 'icon.svg',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  // cache: 'reload' salta la cache HTTP del browser, che potrebbe avere file vecchi.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match(req, { ignoreSearch: true })))
  );
});
