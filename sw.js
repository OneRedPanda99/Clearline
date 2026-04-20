const CACHE_NAME = 'clearline-v7';

// Only precache local assets we control. CDN resources (Tailwind, Font Awesome,
// Leaflet) are cached on-demand by the fetch handler — precaching them fails
// because addAll() is all-or-nothing and CDNs can CORS-block or 404.
const STATIC_ASSETS = [
  '/Clearline/',
  '/Clearline/index.html',
  '/Clearline/jobs.html',
  '/Clearline/calendar.html',
  '/Clearline/map.html',
  '/Clearline/estimate.html',
  '/Clearline/invoice.html',
  '/Clearline/quick-add.html',
  '/Clearline/customer-tracker.html',
  '/Clearline/settings.html',
  '/Clearline/waiver.html',
  '/Clearline/manifest.json',
  '/Clearline/utils.js',
  '/Clearline/firebase-sync.js',
  '/Clearline/maps-utils.js',
  '/Clearline/app.css',
  '/Clearline/data-migration.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') return;
  
  // For HTML pages: network-first (fresh content), fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // For all other assets: cache-first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      });
    })
  );
});
