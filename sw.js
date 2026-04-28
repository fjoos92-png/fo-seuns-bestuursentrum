// ================================================================
// FO SEUNS BESTUURSENTRUM — Service Worker
// ================================================================
// Bump CACHE_NAME met elke funksionele verandering sodat gebruikers
// die nuwe weergawe kry by volgende app-oopmaak.
// ================================================================

const CACHE_NAME = 'bestuursentrum-v21';

// Kernlêers wat altyd gecache word (verpligtend vir offline)
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
];

// CDN-bates: beste poging — fail gracefully
const CDN_ASSETS = [
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdn.tailwindcss.com',
];

// ── Installeer ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Kernlêers: vereis
      await cache.addAll(CORE_ASSETS);

      // CDN-bates: opsioneel (moenie installering blokkeer nie)
      await Promise.allSettled(
        CDN_ASSETS.map(url =>
          cache.add(url).catch(() => {
            // Stilweg ignoreer — CDN dalk onbeskikbaar
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// ── Aktiveer: maak ou kaches skoon ───────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch-strategie ──────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Apps Script / Google API → Altyd netwerk; gee offline-JSON terug by mislukking
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({ success: false, offline: true }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // 2. HTML / navigasie → Netwerk-eerste (verseker updates bereik gebruikers)
  //    Val terug op gecachede index.html vir offline
  if (event.request.mode === 'navigate' ||
      event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 3. CDN-bates (React, Babel, Tailwind) → Cache-eerste
  if (url.hostname.includes('unpkg.com') ||
      url.hostname.includes('cdn.tailwindcss.com') ||
      url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // 4. Alles anders → Netwerk-eerste, val terug op cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Agtergrond-sinkronisering (toekomsgebruik) ───────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
