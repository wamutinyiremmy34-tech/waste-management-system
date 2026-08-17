const CACHE_NAME = "ecotrack-cache-v2";
const OFFLINE_URL = "/offline.html";

// Precache the shell for every role's landing page so the app is actually
// usable offline for whichever role is signed in — not just a generic
// "you're offline" page. /collector is the highest-value one here since
// collectors are the role most likely to lose connectivity in the field.
const PRECACHE_URLS = [
  "/",
  "/dashboard",
  "/collector",
  "/admin",
  "/company",
  "/organization",
  "/recycler",
  "/login",
  "/offline.html",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for API calls (fresh data when online), falling back to
// nothing cached (the app surfaces its own "offline" UI state for API data).
// Cache-first for static assets/pages, with an offline fallback page for
// navigation requests when there is no cached copy and no network.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: "offline", detail: "No network connection." }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Keep the cached shell fresh whenever a navigation succeeds online.
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, resClone));
          return res;
        })
        .catch(() =>
          // Offline: prefer a cached copy of the exact page requested (e.g.
          // /collector) so the app shell actually loads, not just a generic
          // message — only fall back to the offline page if nothing's cached.
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((res) => {
      const resClone = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, resClone));
      return res;
    }).catch(() => cached))
  );
});
