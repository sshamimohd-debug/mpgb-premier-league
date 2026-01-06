const CACHE = "mpgbpl-cache-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./matches.html",
  "./standings.html",
  "./live.html",
  "./scorecard.html",
  "./scorer.html",
  "./styles.css",
  "./data.js",
  "./storage.js",
  "./app.js",
  "./firebase.js",
  "./scoring_engine.js",
  "./realtime.js",
  "./matches_page.js",
  "./live_page.js",
  "./scorecard_page.js",
  "./scorer_page.js",
  "./standings_page.js",
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
