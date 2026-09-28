import { defaultCache } from "@serwist/next/worker";
import type {
  PrecacheEntry,
  RuntimeCaching,
  SerwistGlobalConfig,
  SerwistPlugin,
} from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, Serwist } from "serwist";

// Service worker (Serwist) — stratégie de cache :
//   - Precache : assets statiques du build (app-shell), injectés à la
//     compilation via __SW_MANIFEST → lancement instantané, même hors-ligne.
//   - Pages & RSC : NetworkFirst avec BASCULE CACHE EN 3 s — sur iOS en mode
//     avion, une requête peut rester suspendue au lieu d'échouer ; sans ce
//     délai court, ouvrir une visite hors-ligne « charge » indéfiniment.
//     Le cache « pages » est aussi alimenté par le préchargement des fiches
//     visites (app/app/mes-visites/precharge.tsx) pour qu'elles s'ouvrent
//     hors-ligne même sans visite préalable.
//   - Photos du Storage (URLs signées de LECTURE) : CacheFirst keyé SANS la
//     query string — le token de signature change à chaque re-signature mais
//     le contenu d'un chemin de photo est immuable. Alimenté au fil de l'eau
//     (fiches consultées en ligne) et par le préchargement (precharge.tsx).
//   - Le reste (fonts, images, statiques) : defaultCache de @serwist/next.
//   - Jamais mis en cache : les mutations (POST — Server Actions, uploads) et
//     le reste du cross-origin Supabase (auth, URLs signées d'upload).
// Le téléphone du conducteur est un appareil personnel : resservir hors-ligne
// le dernier rendu authentifié est un compromis assumé.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

// Au-delà de 3 s sans réponse réseau, on sert le cache (iOS mode avion :
// la requête pendrait sinon très longtemps avant d'échouer).
const DELAI_BASCULE_CACHE_S = 3;
const SEPT_JOURS_S = 7 * 24 * 3600;
const TRENTE_JOURS_S = 30 * 24 * 3600;

// Pages HTML (navigations) et payloads RSC (navigations client Next) :
// placées AVANT defaultCache, elles gagnent le premier match. Les cacheName
// reprennent ceux de defaultCache ("pages", "pages-rsc") — le préchargement
// écrit directement dans "pages".
const pagesHorsLigne: RuntimeCaching[] = [
  {
    matcher: ({ request, url, sameOrigin }) =>
      sameOrigin &&
      request.headers.get("RSC") === "1" &&
      !url.pathname.startsWith("/api/"),
    handler: new NetworkFirst({
      cacheName: "pages-rsc",
      networkTimeoutSeconds: DELAI_BASCULE_CACHE_S,
      plugins: [
        new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: SEPT_JOURS_S }),
      ],
    }),
  },
  {
    matcher: ({ request, url, sameOrigin }) =>
      sameOrigin &&
      request.mode === "navigate" &&
      !url.pathname.startsWith("/api/"),
    handler: new NetworkFirst({
      cacheName: "pages",
      networkTimeoutSeconds: DELAI_BASCULE_CACHE_S,
      plugins: [
        new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: SEPT_JOURS_S }),
      ],
    }),
  },
];

// Clé de cache = URL SANS la query string : chaque re-signature d'une photo
// produit un token différent (?token=…), mais le chemin d'objet identifie un
// contenu immuable. Sans cette clé stable, une photo déjà téléchargée ne
// serait jamais retrouvée hors-ligne. Même clé côté préchargement
// (app/app/mes-visites/precharge.tsx).
const cleSansSignature: SerwistPlugin = {
  cacheKeyWillBeUsed: async ({ request }) => {
    const url = new URL(request.url);
    url.search = "";
    return url.href;
  },
};

// Photos de visite (bucket privé Supabase, URLs signées de lecture) :
// CacheFirst — le contenu d'un chemin est immuable, inutile de re-télécharger.
// Placée AVANT defaultCache pour gagner le premier match (sa règle images
// keyerait sur l'URL complète, token compris). Seules les réponses 200 sont
// cachées (défaut Serwist) : une signature expirée (4xx, ou réponse opaque)
// n'écrase jamais une photo déjà en cache.
const photosStorage: RuntimeCaching = {
  matcher: ({ url, sameOrigin }) =>
    !sameOrigin && url.pathname.startsWith("/storage/v1/object/sign/"),
  handler: new CacheFirst({
    cacheName: "photos-storage",
    plugins: [
      cleSansSignature,
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: TRENTE_JOURS_S }),
    ],
  }),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Nouvelle version du SW active immédiatement (pas d'onglet "en attente") :
  // le conducteur relance l'app depuis l'écran d'accueil, jamais via F5.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...pagesHorsLigne, photosStorage, ...defaultCache],
});

serwist.addEventListeners();
