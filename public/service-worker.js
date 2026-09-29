const CACHE = 'nourish-shell-v2';
const SHELL = [
  './','./index.html','./app.css','./config.js','./manifest.webmanifest','./icon.svg',
  './vendor/react.production.min.js','./vendor/react-dom.production.min.js',
  './src/main.js','./src/types.js',
  './src/domain/id.js','./src/domain/nutrition.js','./src/domain/confidence.js','./src/domain/recipes.js','./src/domain/personalization.js',
  './src/data/db.js','./src/data/store.js',
  './src/services/config.js','./src/services/auth.js','./src/services/backend.js','./src/services/openFoodFacts.js','./src/services/usda.js','./src/services/ai.js','./src/services/images.js','./src/services/barcode.js','./src/services/speech.js','./src/services/sync.js',
  './src/ui/common.js','./src/ui/screens.js','./src/ui/editors.js','./src/ui/composer.js','./src/ui/settings.js'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return; // External food/API data stays network-controlled.
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});
