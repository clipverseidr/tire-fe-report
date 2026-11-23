const CACHE_NAME = 'tire-fe-report-prod-v2';

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/config.js',
  './js/db.js',
  './js/components.js',
  './js/auth.js',
  './js/sync.js',
  './js/app.js',
  './vendor/bootstrap.min.css',
  './vendor/bootstrap.bundle.min.js',
  './vendor/chart.umd.min.js',
  './vendor/xlsx.full.min.js',
  './vendor/jspdf.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((networkRes) => {
        const clone = networkRes.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return networkRes;
      });
    })
  );
});
