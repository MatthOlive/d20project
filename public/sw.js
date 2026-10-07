const CACHE_NAME = "d20-project-shell-v3";
const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Cache only the public shell and compiled assets, never authenticated pages,
  // API responses or installer redirects.
  const cacheable = SHELL_ASSETS.includes(url.pathname) || url.pathname.startsWith("/assets/");
  if (!cacheable) return;
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok && !response.redirected) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      return cached || new Response("Sem conexão. Conecte-se à internet para continuar.", { status: 503 });
    })
  );
});
