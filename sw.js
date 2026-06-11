const CACHE_NAME = 'arc-v3';
const ASSETS = [
  '/AdultRunningClub/',
  '/AdultRunningClub/index.html',
  '/AdultRunningClub/offline.html',
  '/AdultRunningClub/manifest.webmanifest',
  '/AdultRunningClub/privacy.html'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const { request } = e;
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).catch(() => {
        if (request.mode === 'navigate') {
          return caches.match('/AdultRunningClub/offline.html');
        }
      });
    })
  );
});
