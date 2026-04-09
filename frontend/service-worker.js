const CACHE_NAME = 'milk-tracker-v7';
const APP_ASSETS = [
  '/',
  '/index.html',
  '/summary.html',
  '/styles.css?v=7',
  '/app.js?v=7',
  '/summary.js?v=7',
  '/manifest.webmanifest?v=7'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  // Always fetch API calls from network so summary data is immediately fresh.
  if (requestUrl.pathname.startsWith('/api/')) {
    return;
  }

  // Always prefer fresh HTML for route navigation to avoid stale page shells.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const exact = await cache.match(event.request);
          if (exact) {
            return exact;
          }

          if (requestUrl.pathname === '/summary') {
            const summaryFallback = await cache.match('/summary.html');
            if (summaryFallback) {
              return summaryFallback;
            }
          }

          return cache.match('/index.html');
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          if (!response.ok) {
            return response;
          }

          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }

          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
    })
  );
});
