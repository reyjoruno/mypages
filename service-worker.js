'use strict';
// Change the version whenever a bundled file changes. A new version activates
// after all windows of the old version close, preserving unfinished forms.
const CACHE_PREFIX = 'warikan-iphone-' + self.registration.scope + '-';
const CACHE_NAME = CACHE_PREFIX + 'v1';
const ASSETS = ['index.html', 'style.css', 'app.js', 'manifest.json',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'];
const assetURLs = ASSETS.map(path => new URL(path, self.registration.scope).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(assetURLs)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const indexURL = new URL('index.html', scope).href;
  const isEntry = event.request.mode === 'navigate' &&
    (url.pathname === scope.pathname || url.pathname === new URL(indexURL).pathname);
  const assetURL = url.origin + url.pathname;
  if (!isEntry && !assetURLs.includes(assetURL)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(isEntry ? indexURL : assetURL);
    return cached || fetch(event.request);
  })());
});
