// Logique chantiers PURE (zéro import Prisma, zéro I/O) — pendant de
// lib/planning.ts pour le planning travaux. Granularité JOUR ENTIER : une
// plage de chantier/absence est [dateDebut, dateFin] en jours civils Paris,
// bornes INCLUSES (mêmes conventions qu'Absence). Partagée par les server
// actions (juge final, re-vérification en transaction) et l'UI
// (avertissements de dispo, teintes du Gantt).

import { FUSEAU, ajouterJoursLocal } from "@/lib/planning";

// Garde-fou de saisie : les chantiers font ≤ 1 semaine en pratique, on
// tolère large (jamais un blocage métier, juste anti-fautes de frappe).
export const DUREE_CHANTIER_MAX_JOURS = 30;

// ── État dérivé ─────────────────────────────────────────────────────────────
// « À venir / en cours / à clôturer » se DÉRIVENT des dates : aucun état à
// cocher qui pourrait mentir. Seul « terminé » est un fait explicite
// (termineLe posé par l'action « Marquer terminé »). A_CLOTURER = dates
// passées sans marquage — signal visuel, jamais bloquant (pattern
// doitEtreReplanifie).

export type EtatChantier = "A_VENIR" | "EN_COURS" | "A_CLOTURER" | "TERMINE";

export const ETAT_CHANTIER_LABELS: Record<EtatChantier, string> = {
  A_VENIR: "À venir",
  EN_COURS: "En cours",
  A_CLOTURER: "À clôturer",
  TERMINE: "Terminé",
};

export type PlageJours = { dateDebut: Date; dateFin: Date };

// Fin EXCLUSIVE d'une plage en jours inclus : minuit Paris du lendemain du
// dernier jour (même rôle que finAbsenceExclusive côté visites).
export function finPlageExclusive(plage: { dateFin: Date }): Date {
  return ajouterJoursLocal(plage.dateFin, 1);
}

export function etatChantier(
  chantier: { dateDebut: Date; dateFin: Date; termineLe: Date | null },
  maintenant: Date = new Date(),
): EtatChantier {
  if (chantier.termineLe) return "TERMINE";
  const t = maintenant.getTime();
  if (t < chantier.dateDebut.getTime()) return "A_VENIR";
  if (t >= finPlageExclusive(chantier).getTime()) return "A_CLOTURER";
  return "EN_COURS";
}

// ── Durées en jours civils ──────────────────────────────────────────────────

// Nombre de jours civils d'une plage incluse (début == fin → 1). Math.round
// absorbe les jours de 23/25 h aux changements d'heure (bornes = minuit Paris).
export function dureeEnJours(plage: PlageJours): number {
  return (
    Math.round(
      (plage.dateFin.getTime() - plage.dateDebut.getTime()) / 86_400_000,
    ) + 1
  );
}

// Dernier jour (inclus) d'un chantier de nbJours démarrant à dateDebut.
export function finDepuisDuree(dateDebut: Date, nbJours: number): Date {
  return ajouterJoursLocal(dateDebut, nbJours - 1);
}

// Chevauchement de deux plages de jours inclus ([a, b] ∩ [c, d] ≠ ∅).
export function plagesJoursSeChevauchent(a: PlageJours, b: PlageJours): boolean {
  return (
    a.dateDebut.getTime() < finPlageExclusive(b).getTime() &&
    b.dateDebut.getTime() < finPlageExclusive(a).getTime()
  );
}

// ── Détection de conflits d'affectation ─────────────────────────────────────
// Même philosophie que les visites : on AVERTIT (UI + re-vérification dans la
// server action), on ne bloque jamais — flag `forcer` pour passer outre.

// Contexte d'UN ouvrier sur la fenêtre étudiée (chargé par la couche data,
// jamais par ce module). Les chantiers TERMINÉS n'occupent plus l'ouvrier.
export type ContexteOuvrier = {
  // Chantiers non terminés de l'ouvrier chevauchant la fenêtre, HORS chantier
  // en cours d'édition.
  chantiers: {
    id: string;
    nomClient: string;
    dateDebut: Date;
    dateFin: Date;
  }[];
  absences: { dateDebut: Date; dateFin: Date; motif: string | null }[];
};

export type ConflitChantier =
  | {
      type: "CHEVAUCHEMENT_CHANTIER";
      chantierId: string;
      nomClient: string;
      dateDebut: Date;
      dateFin: Date;
    }
  | {
      type: "ABSENCE_OUVRIER";
      dateDebut: Date;
      dateFin: Date;
      motif: string | null;
    };

// Tous les conflits d'une plage candidate pour un ouvrier. Ordre de gravité
// d'affichage : chevauchements d'abord, puis absences.
export function detecterConflitsOuvrier(
  plage: PlageJours,
  ctx: ContexteOuvrier,
): ConflitChantier[] {
  const conflits: ConflitChantier[] = [];
  for (const c of ctx.chantiers) {
    if (plagesJoursSeChevauchent(plage, c)) {
      conflits.push({
        type: "CHEVAUCHEMENT_CHANTIER",
        chantierId: c.id,
        nomClient: c.nomClient,
        dateDebut: c.dateDebut,
        dateFin: c.dateFin,
      });
    }
  }
  for (const a of ctx.absences) {
    if (plagesJoursSeChevauchent(plage, a)) {
      conflits.push({
        type: "ABSENCE_OUVRIER",
        dateDebut: a.dateDebut,
        dateFin: a.dateFin,
        motif: a.motif,
      });
    }
  }
  return conflits;
}

// Formatter FR partagé UI/serveur pour les libellés de périodes (même pattern
// que lib/planning.ts — jamais le fuseau du navigateur/serveur).
const jourPeriode = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU,
  day: "numeric",
  month: "long",
});

// « le 8 juillet » / « du 8 juillet au 12 juillet » — libellé d'une plage de
// jours inclus (conflits, fiche chantier, liste).
export function periodeJoursFr(dateDebut: Date, dateFin: Date): string {
  const debut = jourPeriode.format(dateDebut);
  const fin = jourPeriode.format(dateFin);
  return debut === fin ? `le ${debut}` : `du ${debut} au ${fin}`;
}

// Message FR d'un conflit, prêt à afficher (avertissement UI et erreur action).
export function libelleConflitChantier(conflit: ConflitChantier): string {
  switch (conflit.type) {
    case "CHEVAUCHEMENT_CHANTIER":
      return `Déjà sur le chantier ${conflit.nomClient} ${periodeJoursFr(conflit.dateDebut, conflit.dateFin)}`;
    case "ABSENCE_OUVRIER":
      return `Absent ${periodeJoursFr(conflit.dateDebut, conflit.dateFin)}${conflit.motif ? ` (${conflit.motif})` : ""}`;
  }
}
