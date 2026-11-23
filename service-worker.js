/**
 * service-worker.js
 * PWA Cache untuk aset statis TIRE FE REPORT.
 */

const CACHE_NAME = 'tire-fe-report-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/config.js',
  './js/db.js',
  './js/auth.js',
  './js/sync.js',
  './js/dailyTireCheck.js',
  './js/tireModules.js',
  './js/dashboard.js',
  './js/exporter.js'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS).catch(function(err) {
        console.warn('Sebagian aset awal gagal di-cache:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Jangan intercept panggilan API Google Apps Script atau Google Auth
  if (url.hostname.includes('script.google.com') || url.hostname.includes('accounts.google.com')) {
    return;
  }

  event.respondWith(
    caches.match(req).then(function(cached) {
      if (cached) return cached;

      return fetch(req).then(function(networkRes) {
        if (networkRes && networkRes.status === 200 && url.origin === self.location.origin) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(req, clone);
          });
        }
        return networkRes;
      }).catch(function() {
        return caches.match('./index.html');
      });
    })
  );
});