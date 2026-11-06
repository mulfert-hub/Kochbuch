/// <reference lib="webworker" />
// Service Worker: App-Dateien offline vorhalten, OCR-Dateien cachen und geteilte Bilder (Share Target) annehmen.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

export const SHARE_CACHE = 'kochbuch-share';

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Alle Navigationen → index.html (Single-Page-App mit Hash-Routing)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Tesseract-Worker, WASM-Kern und Sprachdaten: beim ersten Gebrauch laden, danach dauerhaft offline.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.includes('/tesseract/'),
  new CacheFirst({ cacheName: 'kochbuch-ocr' }),
);

// Web Share Target: Android teilt Screenshots per POST an ./share-target
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share-target')) return;
  event.respondWith(
    (async () => {
      const form = await event.request.formData();
      const files = form.getAll('images').filter((f): f is File => f instanceof File);
      const cache = await caches.open(SHARE_CACHE);
      // alte, nicht abgeholte Dateien entfernen
      for (const k of await cache.keys()) await cache.delete(k);
      let i = 0;
      for (const f of files) {
        await cache.put(
          new Request(`${self.registration.scope}__shared/${Date.now()}-${i++}`),
          new Response(f, { headers: { 'content-type': f.type || 'image/png', 'x-filename': encodeURIComponent(f.name) } }),
        );
      }
      return Response.redirect(`${self.registration.scope}#/import?shared=${files.length}`, 303);
    })(),
  );
});
