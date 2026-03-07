// Service Worker — Caja Chica
// ⚠️ Cambiar CACHE_VERSION en cada deploy para forzar detección de actualización
const CACHE_VERSION = "cajachica-v0.13.0";
const CACHE_NAME = `${CACHE_VERSION}`;

// Recursos a cachear al instalar
const PRECACHE = [
  "/KjXkApp/",
  "/KjXkApp/index.html",
  "/KjXkApp/manifest.json",
  "/KjXkApp/icons/icon-192x192.png",
  "/KjXkApp/icons/icon-512x512.png",
];

// ── Instalación ────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  // NO llamar skipWaiting() aquí — queremos pasar por "waiting" para que
  // el cliente detecte la actualización y muestre el banner
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
});

// ── Activación ────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first para HTML/JS/CSS, cache-first para assets ─────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // No interceptar requests a Microsoft Graph ni externos
  if (!url.hostname.includes("github.io") && url.hostname !== location.hostname) {
    return;
  }

  // Para navegación (HTML): network-first — siempre intenta la red para detectar updates
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

  // Para JS/CSS/assets: network-first con fallback a caché
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

// ── Mensaje desde la app para forzar actualización ────────────────────────
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});

// Recursos a cachear al instalar
const PRECACHE = [
  "/KjXkApp/",
  "/KjXkApp/index.html",
  "/KjXkApp/manifest.json",
  "/KjXkApp/icons/icon-192x192.png",
  "/KjXkApp/icons/icon-512x512.png",
];

// ── Instalación ────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  // Activar inmediatamente sin esperar a que se cierren las pestañas anteriores
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
});

// ── Activación ────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first para HTML/JS/CSS, cache-first para assets ─────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // No interceptar requests a Microsoft Graph ni externos
  if (!url.hostname.includes("github.io") && url.hostname !== location.hostname) {
    return;
  }

  // Para navegación (HTML): network-first — siempre intenta la red para detectar updates
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

  // Para JS/CSS/assets: network-first con fallback a caché
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

// ── Mensaje desde la app para forzar actualización ────────────────────────
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});
