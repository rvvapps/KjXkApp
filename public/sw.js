// Service Worker — Caja Chica
// ⚠️ Cambiar CACHE_VERSION en cada deploy para forzar detección de actualización
const CACHE_VERSION = "cajachica-v0.15.32";
const CACHE_NAME = CACHE_VERSION;

const PRECACHE = [
  "/KjXkApp/",
  "/KjXkApp/index.html",
  "/KjXkApp/manifest.json",
  "/KjXkApp/icons/icon-192x192.png",
  "/KjXkApp/icons/icon-512x512.png",
];

// ── Instalación ───────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  // NO skipWaiting aquí — queremos pasar por "waiting" para que el cliente
  // detecte la actualización y muestre el banner azul
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
});

// ── Activación ────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  // Borrar cachés viejos — NO llamar clients.claim() para evitar que React
  // se reinicie en pestañas abiertas y muestre la app vacía
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
});

// ── Fetch: network-first siempre ──────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // No interceptar requests externos (Microsoft Graph, etc.)
  if (!url.hostname.includes("github.io") && url.hostname !== location.hostname) {
    return;
  }

  // Navegación HTML: network-first con fallback a caché
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match("/KjXkApp/index.html"))
    );
    return;
  }

  // JS/CSS/assets: network-first con fallback a caché
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Mensaje desde la app para activar nueva versión ───────────────────────
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting" || event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
