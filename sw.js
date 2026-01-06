const CACHE = "mpgbpl-cache-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./data.js",
  "./storage.js",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((res) =>
      res ||
      fetch(e.request)
        .then((net) => {
          // cache runtime GET requests (best effort)
          if (e.request.method === "GET" && net && net.status === 200) {
            const copy = net.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return net;
        })
        .catch(() => res)
    )
  );
});
