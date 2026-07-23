'use strict';
/* Service worker — écran atelier MÉCANO (L13 étape 3)
   Rôle unique : garder la coquille /atelier disponible hors réseau.
   Ne touche JAMAIS aux appels API — ceux-ci passent en direct (réseau
   ou échec géré côté page). Le cache des dernières données (OR, briefing)
   vit dans localStorage, pas ici. */

const CACHE_NAME  = 'motokey-atelier-shell-v1';
const SHELL_URLS  = ['/atelier'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.pathname !== '/atelier') return; // uniquement la coquille, jamais l'API

  event.respondWith(
    fetch(req)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
