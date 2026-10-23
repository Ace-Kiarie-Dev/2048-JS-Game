// Offline support: serve from cache, refresh the cache in the background.
// Bump CACHE when shipping changes so old caches get cleared.
const CACHE = "nx-2048-v1";
const ASSETS = ["./", "index.html", "style.css", "main.js", "icon.svg", "fav.png", "manifest.webmanifest"];

self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (e) => {
    if (e.request.method !== "GET") return;
    e.respondWith(
        caches.open(CACHE).then(async (cache) => {
            const cached = await cache.match(e.request, { ignoreSearch: true });
            const network = fetch(e.request)
                .then((res) => {
                    if (res.ok || res.type === "opaque") cache.put(e.request, res.clone());
                    return res;
                })
                .catch(() => cached || Response.error());
            e.waitUntil(network.catch(() => {}));
            return cached || network;
        })
    );
});
