// Statistiques — helpers PURS (zéro import Prisma, zéro I/O), pendant de
// lib/finances.ts pour la page de pilotage. Toute la logique de période, de
// regroupement mensuel et de calcul de délais vit ici ; le loader
// (lib/statistiques-data.ts) et la page ne font qu'appeler ces fonctions.
// Fuseau Europe/Paris PARTOUT (clés de mois, bornes) via les helpers de
// lib/planning.ts — jamais de + n*86_400_000 pour des jours civils, jamais le
// fuseau du serveur (UTC sur Vercel).

import {
  ajouterJoursLocal,
  dateDepuisLocal,
  debutJourLocal,
  debutMoisLocal,
  decalerMois,
  instantLocal,
} from "@/lib/planning";

// ── Période d'étude ──────────────────────────────────────────────────────────
// Distinction assumée : les indicateurs « Sur la période » (flux — CA encaissé,
// nouveaux dossiers, visites, délais) sont filtrés par cette borne ; les
// indicateurs « À ce jour » (snapshot — backlog, pipeline, à encaisser, carnet)
// l'IGNORENT (état courant).

export const PERIODES = ["12m", "annee", "30j", "tout"] as const;
export type Periode = (typeof PERIODES)[number];

export function estPeriode(valeur: string): valeur is Periode {
  return (PERIODES as readonly string[]).includes(valeur);
}

export const PERIODE_DEFAUT: Periode = "12m";

// Libellés courts des pastilles du sélecteur (navigation).
export const PERIODE_LABELS: Record<Periode, string> = {
  "12m": "12 mois",
  annee: "Année",
  "30j": "30 jours",
  tout: "Tout",
};

// Borne basse (incluse) du filtrage des flux, plus un libellé descriptif pour
// le badge « Sur la période ». `debut === null` = pas de borne (depuis le début).
export function bornePeriode(
  periode: Periode,
  maintenant: Date,
): { debut: Date | null; label: string } {
  switch (periode) {
    case "30j":
      // 30 jours glissants, aujourd'hui inclus (minuit Paris il y a 29 jours).
      return {
        debut: ajouterJoursLocal(debutJourLocal(maintenant), -29),
        label: "30 derniers jours",
      };
    case "12m":
      // 12 mois pleins : du 1er du mois il y a 11 mois à maintenant.
      return {
        debut: decalerMois(debutMoisLocal(maintenant), -11),
        label: "12 derniers mois",
      };
    case "annee": {
      const { annee } = instantLocal(maintenant);
      return { debut: dateDepuisLocal(annee, 1, 1, 0), label: `Année ${annee}` };
    }
    case "tout":
      return { debut: null, label: "Depuis le début" };
  }
}

// ── Regroupement mensuel (Europe/Paris) ──────────────────────────────────────
// Même approche que lib/finances-data.ts : clé « en-CA » triable
// lexicographiquement, libellé « fr-FR » dérivé du même Date.

const cleMoisFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  timeZone: "Europe/Paris",
});
const labelMoisFmt = new Intl.DateTimeFormat("fr-FR", {
  month: "short",
  year: "2-digit",
  timeZone: "Europe/Paris",
});

// « 2026-07 » — clé de mois stable pour bucketer un instant en fuseau Paris
// (un règlement du 1er à 00h30 Paris tombe dans le bon mois, pas le précédent
// en UTC).
export function cleMois(d: Date): string {
  return cleMoisFmt.format(d);
}

// « juil. 26 » — libellé compact d'un mois (étiquette sous une barre).
export function labelMois(d: Date): string {
  return labelMoisFmt.format(d);
}

export type MoisAxe = { cle: string; label: string };

// Filet contre un axe démesuré (organisation très ancienne) : on plafonne le
// nombre de barres mensuelles et on ne garde que les plus récentes.
export const MOIS_MAX = 36;

// Axe mensuel [debut, fin] inclus (1er du mois de `debut` au 1er du mois de
// `fin`), mois vides compris — l'appelant remplit ensuite chaque clé. Si
// l'étendue dépasse MOIS_MAX, on ne garde que les MOIS_MAX derniers mois.
export function moisEntre(
  debut: Date,
  fin: Date,
): { mois: MoisAxe[]; plafonne: boolean } {
  const finMois = debutMoisLocal(fin);
  let courant = debutMoisLocal(debut);
  const tous: MoisAxe[] = [];
  // Garde-fou dur (jamais de boucle infinie même sur données aberrantes).
  for (let garde = 0; garde < 1200; garde++) {
    if (courant.getTime() > finMois.getTime()) break;
    tous.push({ cle: cleMois(courant), label: labelMois(courant) });
    courant = decalerMois(courant, 1);
  }
  if (tous.length > MOIS_MAX) {
    return { mois: tous.slice(-MOIS_MAX), plafonne: true };
  }
  return { mois: tous, plafonne: false };
}

// ── Délais (en jours) ────────────────────────────────────────────────────────
// Calculés uniquement depuis des colonnes fiables (dateRealisee, payeLe,
// termineLe, createdAt). Fractionnaires en interne pour ne pas perdre de
// précision à la moyenne ; arrondis seulement à l'affichage (formatJours).

export function diffJours(debut: Date, fin: Date): number {
  return (fin.getTime() - debut.getTime()) / 86_400_000;
}

// Moyenne d'un ensemble de nombres, ou null si vide (aucune division par zéro).
export function moyenne(valeurs: readonly number[]): number | null {
  if (valeurs.length === 0) return null;
  return valeurs.reduce((somme, v) => somme + v, 0) / valeurs.length;
}

// Jours arrondis prêts à afficher ; null → « — » (jamais « NaN j »).
export function formatJours(jours: number | null): string {
  if (jours === null || !Number.isFinite(jours)) return "—";
  return `${Math.round(jours)} j`;
}

// Pourcentage arrondi prêt à afficher ; null → « — ».
export function formatPourcent(pourcent: number | null): string {
  if (pourcent === null || !Number.isFinite(pourcent)) return "—";
  return `${Math.round(pourcent)} %`;
}

// Ratio a/b en pourcentage, ou null si b === 0 (taux non défini).
export function tauxPourcent(a: number, b: number): number | null {
  if (b === 0) return null;
  return (a / b) * 100;
}

// ── Buckets d'humidité (histogramme relatif au seuil) ────────────────────────
// Le seuil de l'organisation est la frontière de décision (> seuil → attente de
// séchage, sinon prêt travaux). Les buckets sont posés autour de lui pour que
// la distribution se lise par rapport à CETTE frontière. Bornes clampées à
// [0, 100] et buckets vides éliminés → robuste pour tout seuil (0…100).

export type TonHumidite = "vert" | "ambre" | "rouge";

export type BucketHumidite = {
  min: number; // borne basse incluse
  max: number; // borne haute exclue (sauf dernier bucket : 100 inclus)
  label: string;
  ton: TonHumidite;
};

export function bucketsHumidite(seuil: number): BucketHumidite[] {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  // Bornes relatives au seuil (± par paliers de 10), clampées.
  const bornes = [
    0,
    clamp(seuil - 10),
    clamp(seuil),
    clamp(seuil + 10),
    clamp(seuil + 20),
    100,
  ];
  const buckets: BucketHumidite[] = [];
  for (let i = 0; i < bornes.length - 1; i++) {
    const min = bornes[i];
    const max = bornes[i + 1];
    if (min >= max) continue; // bucket vide (seuil aux extrêmes) → ignoré
    // Le bucket qui contient le seuil est « ambre » (frontière) ; entièrement
    // sous le seuil → vert ; entièrement au-dessus → rouge.
    const ton: TonHumidite =
      min <= seuil && seuil < max ? "ambre" : max <= seuil ? "vert" : "rouge";
    buckets.push({ min, max, label: `${min}–${max} %`, ton });
  }
  return buckets;
}

// Index du bucket d'un taux (0…100). Buckets triés croissants, couvrant
// [0, 100] : `t < max` trouve le bon ; un 100 (aucun max strict) tombe dans le
// dernier bucket.
export function indexBucketHumidite(
  taux: number,
  buckets: readonly BucketHumidite[],
): number {
  for (let i = 0; i < buckets.length; i++) {
    if (taux < buckets[i].max) return i;
  }
  return buckets.length - 1;
}
