// Tags de cache Next.js (unstable_cache / revalidateTag), centralisés pour
// éviter toute désynchronisation entre le producteur (cache) et les
// consommateurs (revalidateTag après mutation).

// Compteur "à traiter" du shell back-office (app/app/layout.tsx), invalidé
// par toute action qui change Dossier.statut / Dossier.classeHumiditeLe, ou
// qui bouge un Chantier (dateFin/termineLe) — population « à clôturer »
// comptée par lib/a-traiter.ts, invalidée depuis les actions chantier.
export function dossiersBadgesTag(organisationId: string): string {
  return `dossiers-badges-${organisationId}`;
}

// Caches Statistiques (lib/statistiques-data.ts) + Chiffre d'affaires
// (lib/finances-data.ts) — invalidé aux MÊMES mutations que dossiersBadgesTag
// (statuts/visites/chantiers) plus les mutations financières (devis, payé) et
// les réglages métier de l'org. Filet revalidate 300 s côté producteurs.
export function statsTag(organisationId: string): string {
  return `stats-${organisationId}`;
}
