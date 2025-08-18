/* ZetaConvert · sw.js */
const CACHE = "zc-static-v1";
const ASSETS = [
  "/", // home
  "/assets/css/styles.css",
  "/assets/js/main.js",
  "/assets/js/ui.js",
  "/assets/js/i18n.js",
  "/assets/js/theme.js",
  "/assets/js/forms.js",
  "/assets/js/converter.js",
  "/assets/img/logo.svg",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/manifest.webmanifest"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Nunca cachear/proxyear /api (backend)
  if (url.pathname.startsWith("/api")) return;

  // Solo GET
  if (e.request.method !== "GET") return;

  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return res;
        })
        .catch(() => {
          // Fallback básico: home si HTML
          if (e.request.headers.get("accept")?.includes("text/html")) {
            return caches.match("/");
          }
          return new Response("", { status: 502, statusText: "Offline" });
        });
    })
  );
});
