const cacheName = 'read-page-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    try {
      // GitHub Pages lets browsers keep files for 10 minutes; asking again gets an update at once.
      const response = await fetch(event.request, { cache: 'no-cache' });
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      const hit = await cache.match(event.request, { ignoreSearch: true });
      if (hit) return hit;
      throw error;
    }
  })());
});
