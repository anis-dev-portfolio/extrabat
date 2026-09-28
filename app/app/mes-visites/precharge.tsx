"use client";

import { useEffect } from "react";

// Cache des photos : mêmes nom et clé (URL SANS query string) que la
// stratégie CacheFirst du service worker (app/sw.ts) — le token des URLs
// signées change à chaque re-signature, la clé stable garantit le hit
// hors-ligne.
const CACHE_PHOTOS = "photos-storage";

// Précharge les fiches des visites à faire dans le cache "pages" du service
// worker : sur chantier sans réseau, ouvrir une visite doit marcher même si
// la fiche n'a jamais été visitée. Écrit directement via l'API Cache (même
// cacheName que la stratégie NetworkFirst du SW) — déclenché après un court
// délai pour ne pas concurrencer le chargement de la page, et re-déclenché au
// retour du réseau. Best-effort : toute erreur est silencieuse.
// Précharge ensuite les photos des visites réalisées récentes (URLs signées
// minées par /api/visites/photos-hors-ligne) dans le cache "photos-storage" :
// le compte-rendu d'une visite réalisée reste consultable avec ses vignettes
// en sous-sol sans réseau.
export function PrechargeVisites({ urls }: { urls: string[] }) {
  const cle = urls.join("|");

  useEffect(() => {
    if (typeof window === "undefined" || !("caches" in window)) return;
    let annule = false;

    // Pas de garde navigator.onLine (peu fiable en PWA iOS) : hors-ligne,
    // cache.add/fetch échouent simplement en silence.
    async function prechargerPages() {
      if (urls.length === 0) return;
      try {
        const cache = await caches.open("pages");
        for (const url of urls) {
          if (annule) return;
          try {
            await cache.add(url);
          } catch {
            // réponse non-200 ou coupure : cette fiche restera réseau-only
          }
        }
      } catch {
        // API Cache indisponible (navigation privée…) : préchargement ignoré
      }
    }

    async function prechargerPhotos() {
      try {
        const res = await fetch("/api/visites/photos-hors-ligne");
        if (!res.ok) return;
        const { urls: urlsPhotos } = (await res.json()) as { urls: string[] };
        const cache = await caches.open(CACHE_PHOTOS);
        for (const urlPhoto of urlsPhotos) {
          if (annule) return;
          try {
            const cleCache = new URL(urlPhoto);
            cleCache.search = "";
            // Une photo est immuable : déjà en cache = rien à re-télécharger.
            if (await cache.match(cleCache.href)) continue;
            const photo = await fetch(urlPhoto);
            if (photo.ok) await cache.put(cleCache.href, photo);
          } catch {
            // coupure ou signature expirée : cette photo restera réseau-only
          }
        }
      } catch {
        // route ou API Cache indisponible, hors-ligne… : photos ignorées
      }
    }

    async function precharger() {
      // Les fiches d'abord (légères, indispensables sur chantier), les photos
      // ensuite — leur échec ne bloque jamais le préchargement des pages.
      await prechargerPages();
      if (!annule) await prechargerPhotos();
    }

    const t = setTimeout(() => void precharger(), 1500);
    const surRetourReseau = () => void precharger();
    window.addEventListener("online", surRetourReseau);
    return () => {
      annule = true;
      clearTimeout(t);
      window.removeEventListener("online", surRetourReseau);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  return null;
}
