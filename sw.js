// Invoice Studio Pro — Service Worker
// Bump this version string whenever index.html (or any cached asset) changes,
// so returning users automatically pick up the new version.
const VERSION = "v1.0.0";
const SHELL_CACHE = `invoice-studio-shell-${VERSION}`;
const RUNTIME_CACHE = `invoice-studio-runtime-${VERSION}`;

// Everything needed to run the app with zero network connection.
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-72.png",
  "./icons/icon-96.png",
  "./icons/icon-128.png",
  "./icons/icon-144.png",
  "./icons/icon-152.png",
  "./icons/icon-192.png",
  "./icons/icon-384.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // App shell (same-origin): cache-first, so the app opens instantly and works offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => caches.match("./index.html"));
      })
    );
    return;
  }

  // Third-party assets (e.g. the xlsx library, loaded only when importing an
  // .xlsx spreadsheet): stale-while-revalidate, so it still works offline after
  // the first successful import, but stays fresh whenever online.
  event.respondWith(
    caches.open(RUNTIME_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
