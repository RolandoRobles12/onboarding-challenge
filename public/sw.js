/*
 * Service worker de Aviva LMS.
 *
 * Objetivo: que la app instalada arranque al instante y no muestre el dinosaurio
 * del navegador cuando el vendedor se queda sin señal en el kiosko.
 *
 * Estrategia deliberadamente conservadora:
 *  - Navegaciones: red primero, con la última copia como respaldo. Así el
 *    contenido siempre está fresco (los cursos y el pulso cambian a diario) y
 *    solo se cae al caché si de plano no hay conexión.
 *  - Estáticos del build (/_next/static): caché primero. Llevan hash en el
 *    nombre, así que nunca sirven algo desactualizado.
 *  - Imágenes y media: caché primero con actualización en segundo plano.
 *  - NUNCA se cachean llamadas a Firebase/Firestore ni respuestas de auth: el
 *    progreso y las sesiones deben ir siempre a la red para no mostrar datos
 *    viejos ni dejar a alguien "dentro" cuando ya cerró sesión.
 */

const VERSION = 'v1';
const SHELL_CACHE = `aviva-shell-${VERSION}`;
const STATIC_CACHE = `aviva-static-${VERSION}`;
const MEDIA_CACHE = `aviva-media-${VERSION}`;
const OFFLINE_URL = '/offline.html';

const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  const keep = [SHELL_CACHE, STATIC_CACHE, MEDIA_CACHE];
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => !keep.includes(n)).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/** Hosts cuyas respuestas nunca deben cachearse. */
function isNeverCached(url) {
  return (
    /firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firebasestorage\.googleapis\.com\/.*\?.*token/.test(url.href) ||
    url.pathname.startsWith('/api/')
  );
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (isNeverCached(url)) return; // se deja pasar directo a la red

  // ── Navegación: red primero, respaldo en caché, y por último página offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then(c => c.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() =>
          caches.match(request).then(cached => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // ── Estáticos del build: caché primero (llevan hash, no se desactualizan)
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static')) {
    event.respondWith(
      caches.match(request).then(cached =>
        cached ||
        fetch(request).then(response => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then(c => c.put(request, copy)).catch(() => {});
          return response;
        })
      )
    );
    return;
  }

  // ── Imágenes/fuentes/iconos: caché primero, refresco en segundo plano
  if (['image', 'font'].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then(cached => {
        const network = fetch(request)
          .then(response => {
            const copy = response.clone();
            caches.open(MEDIA_CACHE).then(c => c.put(request, copy)).catch(() => {});
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

// Permite que la app pida activar una versión nueva sin esperar
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
