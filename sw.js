/* Offline cache for ByeBoer. Bump VERSION when you change any app file. */
var VERSION = 'byeboer-v11';
var SHELL = ['./', 'index.html', 'app.js', 'i18n.js', 'export.js', 'ocr-worker.js', 'manifest.webmanifest',
             'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];

var OCR_CACHE = 'byeboer-ocr-v1';   // the odometer photo reader (from jsDelivr), kept across app updates

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== OCR_CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // Odometer photo reader (Tesseract) from jsDelivr: cache first, downloaded once
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(OCR_CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; });
      });
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // App files: serve from cache instantly, refresh the cache in the background.
  e.respondWith(caches.open(VERSION).then(function (c) {
    var key = req.mode === 'navigate' ? 'index.html' : req;
    return c.match(key, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res.ok) c.put(key, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});
