const CACHE_NAME = 'weather-dashboard-shell-v26';

const STATIC_PREFIXES = ['/css/', '/js/', '/img/', '/icons/'];
const STATIC_EXACT = ['/manifest.json', '/favicon.ico'];

function isStaticAsset(url) {
  return STATIC_EXACT.includes(url.pathname) || STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Only the static shell is cached here. API responses and server-rendered HTML
// are always left to the network — the dashboard polls /api/weather every 30s
// and a stale-while-revalidate response would show old readings for one cycle.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !isStaticAsset(url)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
