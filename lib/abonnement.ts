import type { Role, StatutAbonnement } from "@/lib/generated/prisma/enums";

// Abonnement SaaS — helpers PURS (importables partout, y compris côté client).
// La source de vérité est Stripe ; la base locale n'est qu'un miroir chargé par
// getCurrentUser() avec l'organisation : tout ici est un simple calcul en
// mémoire, aucun appel réseau ni requête.

// Délai de grâce après le 1er échec de paiement : le temps des Smart Retries
// de Stripe (carte expirée = cas ultra-courant, pas de la mauvaise volonté).
// Passé ce délai sans paiement, l'accès passe en lecture seule. ⚠️ Si le
// prélèvement SEPA est activé un jour, porter à ≥ 14 jours (un échec SEPA
// peut mettre 14 jours à être notifié).
export const GRACE_JOURS = 10;

// Champs d'abonnement lus par les helpers — structurel : accepte l'organisation
// de CurrentUser comme un `select` partiel.
export type AbonnementOrganisation = {
  statutAbonnement: StatutAbonnement;
  impayeDepuis: Date | null;
};

export const STATUT_ABONNEMENT_LABELS: Record<StatutAbonnement, string> = {
  EXONERE: "Exonéré",
  ACTIF: "Actif",
  IMPAYE: "Impayé",
  SUSPENDU: "Suspendu",
  RESILIE: "Résilié",
};

// Fin du délai de grâce d'un impayé. Offset en ms (pas en jours civils Paris) :
// même approche assumée que dateContreVisiteConseillee() — l'écart d'1 h aux
// changements d'heure est sans enjeu sur un délai de 10 jours.
export function finDeGrace(impayeDepuis: Date): Date {
  return new Date(impayeDepuis.getTime() + GRACE_JOURS * 86_400_000);
}

// Statut effectif, dérivé PARESSEUSEMENT à la lecture : un IMPAYE dont la
// grâce est écoulée est traité SUSPENDU sans attendre de cron ni de webhook —
// zéro infra, même pattern que doitEtreReplanifie() (lib/metier.ts).
export function statutAbonnementEffectif(
  org: AbonnementOrganisation,
  maintenant: Date = new Date(),
): StatutAbonnement {
  if (
    org.statutAbonnement === "IMPAYE" &&
    org.impayeDepuis &&
    maintenant.getTime() >= finDeGrace(org.impayeDepuis).getTime()
  ) {
    return "SUSPENDU";
  }
  return org.statutAbonnement;
}

// Lecture seule ? On ne prend jamais les données en otage : tout reste
// consultable, seules les MUTATIONS métier sont coupées (créer, planifier,
// saisir…). Le paiement (page Abonnement), la déconnexion et le changement de
// mot de passe restent toujours possibles.
export function mutationsBloquees(
  org: AbonnementOrganisation,
  maintenant: Date = new Date(),
): boolean {
  const effectif = statutAbonnementEffectif(org, maintenant);
  return effectif === "SUSPENDU" || effectif === "RESILIE";
}

// Message renvoyé par les actions bloquées (ActionState.error), adapté au
// rôle : seul l'ADMIN peut payer — les autres n'ont pas accès aux détails de
// facturation et sont renvoyés vers leur administrateur.
export function messageMutationsBloquees(role: Role): string {
  return role === "ADMIN"
    ? "Abonnement suspendu — régularisez le paiement dans Paramètres → Abonnement pour continuer."
    : "Compte suspendu — contactez votre administrateur.";
}
