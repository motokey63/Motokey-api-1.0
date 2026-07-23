'use strict';
/* Service worker — écran atelier MÉCANO (L13)
   Rôle unique : garder la coquille /atelier disponible hors réseau.
   Ne touche JAMAIS aux appels API — ceux-ci passent en direct (réseau
   ou échec géré côté page), jamais mis en cache ici. Le cache des
   dernières données (OR, briefing) vit dans localStorage, pas ici.

   Versionning : CACHE_VERSION doit changer à CHAQUE évolution du shell
   (HTML/CSS/JS inline de MotoKey_Atelier.html). 'activate' purge tout
   cache préfixé CACHE_PREFIX dont le nom ne correspond pas à la version
   courante — sinon les anciennes versions s'accumulent indéfiniment et
   Jordan peut se retrouver bloqué sur une coquille fantôme en atelier. */

const CACHE_PREFIX  = 'motokey-atelier-shell-';
const CACHE_VERSION = 'v2';
const CACHE_NAME    = CACHE_PREFIX + CACHE_VERSION;
const SHELL_URLS    = ['/atelier'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting(); // force l'activation immédiate du nouveau SW, sans attendre la fermeture des onglets ouverts
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME) // purge toute version fantôme de CE SW — jamais un cache étranger à ce préfixe
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // prend le contrôle des pages déjà ouvertes, une fois la purge terminée
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // network-only pour tout non-GET (jamais de cache sur POST/PATCH/DELETE)

  const url = new URL(req.url);
  // Network-only STRICT pour tout ce qui n'est pas la coquille statique /atelier —
  // OR, motos, plan-entretien, consommables, fraude, auth : jamais interceptés ni
  // mis en cache ici. Un retour sans respondWith() laisse le navigateur traiter la
  // requête normalement, comme s'il n'y avait aucun service worker.
  if (url.pathname !== '/atelier') return;

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
