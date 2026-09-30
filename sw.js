// CRUMB — service worker minimo: mette in cache l'app e la serve offline.
const CACHE = 'crumb-v1';
const FILES = ['./', 'index.html', 'app.js', 'data.js', 'ricette.js', 'manifest.webmanifest', 'icon.svg',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Cache-first: l'app non ha bisogno della rete. Gli aggiornamenti arrivano cambiando CACHE.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
