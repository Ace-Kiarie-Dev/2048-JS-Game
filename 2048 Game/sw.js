// Offline support: serve from cache, refresh the cache in the background.
// Bump CACHE when shipping changes so old caches get cleared.
const CACHE_PREFIX = "nx-2048-";
const CACHE = CACHE_PREFIX + "v5";
// The scope is the page URL itself (with or without a trailing slash, depending on the host),
// so the page is cached under the exact URL it's opened from rather than a redirect.
const ASSETS = [self.registration.scope, "index.html", "style.css", "main.js", "brand.js", "icon.svg", "fav.png", "manifest.webmanifest", "logo_nx_gaming.webp", "og.png"];

self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener("activate", (e) => {
    // Only clear this game's old versions: other games on nesturex.com share the same
    // Cache Storage (one per origin), so deleting every other cache would wipe theirs.
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
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
