// Liens Google Maps universels (pas de clé API, ouvrent l'app native quand
// disponible) — partagés entre composants client et serveur.

// Recherche d'une adresse unique. Repris depuis
// app/app/visites/[id]/actions-buttons.tsx (BarreVisite) pour être réutilisable
// côté serveur (mes-visites/page.tsx n'est pas "use client").
export function mapsRechercheHref(adresse: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    adresse,
  )}`;
}

// Itinéraire multi-étapes. Les adresses sont prises DANS L'ORDRE FOURNI —
// aucun calcul d'ordre : les RDV ont une heure fixe, c'est déjà l'ordre réel
// de la tournée du conducteur (cf. lib/geo.ts). Pas d'`origin` : Google Maps
// utilise la position actuelle de l'appareil.
export function mapsItineraireHref(adresses: readonly string[]): string | null {
  if (adresses.length < 2) return null;
  const destination = adresses[adresses.length - 1];
  const etapes = adresses.slice(0, -1);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destination,
  )}&waypoints=${etapes.map(encodeURIComponent).join("|")}`;
}
