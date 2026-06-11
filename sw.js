// ARC V3 — Service Worker (V2 이식, CACHE_NAME 갱신 + js/ 프리캐시 — TECH_SPEC §1.2)
const CACHE_NAME = 'arc-v3-1';
const ASSETS = [
  './',
  './index.html',
  './js/config.js',
  './js/db.js',
  './js/app.js',
  './manifest.webmanifest',
  './privacy.html',
  './terms.html',
  './icons/icon-192.png',
  './icons/icon-512.png'
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
  // Supabase API 호출은 캐시하지 않음 (데이터 신선도)
  if (request.url.includes('supabase.co')) return;
  if (request.mode === 'navigate') {
    // 네비게이션: 네트워크 우선 → 오프라인 시 캐시된 앱 셸
    e.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request).catch(() => cached))
  );
});
