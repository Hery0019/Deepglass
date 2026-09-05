/*
 * Service worker: keeps the game playable offline. Everything the page
 * fetches is stored on first use; later requests are answered from the
 * network when it is reachable (refreshing the copy) and from the cache
 * when it is not. Bumping CACHE drops old copies.
 */

const CACHE = "deepglass-v1";

/** The page plus every script and stylesheet it references, so the first visit is enough. */
async function precache(cache) {
  const page = await fetch("./");
  if (!page.ok) {
    throw new Error(`precache: the page answered ${String(page.status)}`);
  }
  const html = await page.clone().text();
  const assets = [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]);
  await cache.put("./", page.clone());
  await cache.put("./index.html", page);
  await cache.addAll([...new Set(assets)]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then(precache));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() =>
        caches
          .match(request, { ignoreSearch: true, ignoreVary: true })
          .then((hit) => hit ?? caches.match("./index.html")),
      ),
  );
});
