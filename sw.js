/* Offline shell для меню UNIPUB */
const CACHE = "unipub-v26";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/search.js",
  "./js/i18n.js",
  "./js/menu-data.js",
  "./js/languages.js",
  "./js/translate.js",
  "./assets/favicon.svg",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isDocumentRequest(req) {
  if (req.mode === "navigate") return true;
  const accept = req.headers.get("accept") || "";
  return accept.includes("text/html");
}

function isFreshAsset(url) {
  const p = url.pathname;
  return (
    /\/js\/menu-data\.js$/i.test(p) ||
    /\/js\/app\.js$/i.test(p) ||
    /\/js\/i18n\.js$/i.test(p) ||
    /\/js\/translate\.js$/i.test(p) ||
    /\/js\/search\.js$/i.test(p) ||
    /\/js\/languages\.js$/i.test(p) ||
    /\/css\/style\.css$/i.test(p) ||
    /\/sw\.js$/i.test(p)
  );
}

function networkFirst(req, fallbackPath) {
  return fetch(req)
    .then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => {
        cache.put(req, copy);
        // также кладём без query — для offline match
        try {
          const u = new URL(req.url);
          if (u.search) {
            const clean = u.origin + u.pathname;
            cache.put(clean, res.clone()).catch(() => {});
          }
        } catch (_) {}
      }).catch(() => {});
      return res;
    })
    .catch(() =>
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return caches.match(req, { ignoreSearch: true }).then((c2) => {
          if (c2) return c2;
          return fallbackPath ? caches.match(fallbackPath) : undefined;
        });
      })
    );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isDocumentRequest(req) || isFreshAsset(url)) {
    event.respondWith(networkFirst(req, isDocumentRequest(req) ? "./index.html" : undefined));
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
