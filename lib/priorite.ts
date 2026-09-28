import type { Prisma } from "@/lib/generated/prisma/client";
import type { DossierStatut } from "@/lib/generated/prisma/enums";

// Ordre de PRIORITÉ d'affichage des dossiers, par statut : le plus « urgent à
// traiter » en premier. Exprimé en orderBy Prisma (tri DB-side — compatible
// avec les caps du kanban et la pagination de la liste), donc réutilisable tel
// quel par la vue kanban (une colonne = un statut) ET la vue liste filtrée par
// statut.
//
// Règle par colonne :
// - NOUVEAU : entrant le plus ancien d'abord (attend une prise en charge
//   depuis le plus longtemps → à planifier en priorité).
// - PLANIFIE : approximé par « activité récente » (updatedAt desc). Prisma ne
//   trie pas sur le min() d'une relation, donc pas de tri direct « visite la
//   plus imminente » ; la planification touchant updatedAt, l'ordre reste
//   raisonnable. Tri non critique (rien n'attend une action ici).
// - REALISE : premier arrivé, premier classé (updatedAt asc) — même ordre que
//   la file « À traiter » (lib/a-traiter.ts).
// - EN_ATTENTE_HUMIDITE : séchage le plus avancé / le plus en retard d'abord
//   (classeHumiditeLe asc → classés il y a le plus longtemps = échéance de
//   contre-visite dépassée en tête, ceux « À re-planifier » remontent). En
//   Postgres, `asc` place les NULL en dernier : un dossier sans date de
//   classement passe en fin, ce qui est le bon comportement.
// - PRET_POUR_TRAVAUX : en attente de travaux depuis le plus longtemps d'abord
//   (updatedAt asc) — cohérent avec la file « Prêts pour travaux » de la page
//   Chantiers.
// - EN_CHANTIER / TERMINE / liste sans filtre de statut : activité récente
//   (updatedAt desc), défaut neutre.
export function ordrePrioriteDossier(
  statut?: DossierStatut,
): Prisma.DossierOrderByWithRelationInput[] {
  switch (statut) {
    case "NOUVEAU":
      return [{ createdAt: "asc" }];
    case "REALISE":
      return [{ updatedAt: "asc" }];
    case "EN_ATTENTE_HUMIDITE":
      return [{ classeHumiditeLe: "asc" }, { updatedAt: "asc" }];
    case "PRET_POUR_TRAVAUX":
      return [{ updatedAt: "asc" }];
    case "PLANIFIE":
    case "EN_CHANTIER":
    case "TERMINE":
    default:
      return [{ updatedAt: "desc" }];
  }
}
