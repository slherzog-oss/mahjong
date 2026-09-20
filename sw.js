// Service Worker: Precache aller App-Dateien, Cache First, versionierte Caches.
// Die Dateiliste kommt aus sw-manifest.js (generiert).
importScripts('./sw-manifest.js');

const { version, files } = self.__PRECACHE;
const CACHE = `mahjong-${version}`;
const BASE = new URL('./', self.location).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([BASE, ...files.map((f) => BASE + f)])),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('mahjong-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data === 'version') event.source?.postMessage({ type: 'version', version });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Navigationsanfragen: immer die App-Seite aus dem Cache (Offline-Start)
  if (req.mode === 'navigate') {
    event.respondWith(caches.match(BASE).then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok && url.pathname.startsWith(new URL(BASE).pathname)) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
