const CACHE_VERSION = 'site-vision-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // VisionSite continúa usando la red normalmente.
});
