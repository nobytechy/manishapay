/*
 * ManishaPay service worker — minimal, dependency-free, and dev-safe.
 *
 * © 2026 Noby Tebulo (https://nobie.netlify.app). All rights reserved.
 * Author: Noby Tebulo · nobytechy@gmail.com
 *
 * Goals:
 *  - Make the app installable (a fetch handler + manifest + icons = PWA).
 *  - Give the shell an offline fallback without breaking Vite HMR in dev.
 *
 * Strategy:
 *  - Navigations  → network-first, fall back to the cached app shell.
 *  - Built assets (/assets/, /icons/, images, fonts, manifest) → stale-while-revalidate.
 *  - Everything else (Vite dev modules /@vite, /src/, HMR, the API, Supabase,
 *    non-GET, cross-origin) → passthrough. Never cached, so HMR + API stay live.
 */
const VERSION = 'manishapay-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_URL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll([SHELL_URL, '/'])).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Paths we must never intercept/cache — dev tooling and live data.
function isBypassed(url) {
  return (
    url.pathname.startsWith('/@') ||        // /@vite, /@react-refresh
    url.pathname.startsWith('/src/') ||     // Vite dev source modules
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/api/') ||     // proxied backend
    url.pathname.startsWith('/v1/') ||      // direct backend
    url.pathname.startsWith('/simulator/') ||
    url.pathname.includes('hot-update') ||
    url.search.includes('t=')               // Vite HMR cache-buster
  );
}

function isCacheableAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/logo.png' ||
    /\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API / Supabase are cross-origin
  if (isBypassed(url)) return;

  // App navigations: network-first, fall back to cached shell (offline).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(SHELL_URL, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(SHELL_URL).then((r) => r || caches.match('/')))
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res && res.status === 200) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
