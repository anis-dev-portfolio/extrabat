// Couche data du planning chantiers : requêtes Prisma au service de la
// logique pure de lib/chantiers.ts (qui, elle, ne fait jamais d'I/O).
// Toujours scopé organisationId (invariant multi-tenant).

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { debutJourLocal } from "@/lib/planning";
import {
  detecterConflitsOuvrier,
  finPlageExclusive,
  libelleConflitChantier,
  type PlageJours,
} from "@/lib/chantiers";

type Tx = Prisma.TransactionClient;

// Conflits de disponibilité re-détectés EN TRANSACTION (le serveur reste le
// juge, l'UI n'est qu'un confort) — pendant de ConflitsDetectes côté visites.
// Les messages sont déjà formatés « Ouvrier : raison », prêts à afficher.
export class ConflitsChantierDetectes extends Error {
  constructor(public readonly conflits: string[]) {
    super("Des conflits de disponibilité ont été détectés.");
  }
}

// Dispo d'un ouvrier telle que le formulaire chantier la consomme : ses
// absences et chantiers À VENIR (non terminés), pour que le client calcule
// les avertissements en direct via detecterConflitsOuvrier (fonctions pures).
export type OuvrierDispo = {
  id: string;
  nom: string;
  actif: boolean;
  absences: { dateDebut: Date; dateFin: Date; motif: string | null }[];
  chantiers: { id: string; nomClient: string; dateDebut: Date; dateFin: Date }[];
};

// Charge les ouvriers affectables avec leur contexte de dispo futur.
// `chantierEnEdition` : en modification, exclut le chantier édité des
// conflits (sinon auto-conflit) ET garde visibles ses ouvriers devenus
// inactifs (ils restent affectés tant qu'on ne les décoche pas).
export async function chargerDispoOuvriers(
  organisationId: string,
  chantierEnEdition?: string,
): Promise<OuvrierDispo[]> {
  const aujourdhui = debutJourLocal(new Date());
  const ouvriers = await prisma.ouvrier.findMany({
    where: {
      organisationId,
      ...(chantierEnEdition
        ? {
            OR: [
              { actif: true },
              { affectations: { some: { chantierId: chantierEnEdition } } },
            ],
          }
        : { actif: true }),
    },
    orderBy: { nom: "asc" },
    select: {
      id: true,
      nom: true,
      actif: true,
      absences: {
        where: { dateFin: { gte: aujourdhui } },
        select: { dateDebut: true, dateFin: true, motif: true },
      },
      affectations: {
        where: {
          chantier: {
            termineLe: null,
            dateFin: { gte: aujourdhui },
            ...(chantierEnEdition ? { id: { not: chantierEnEdition } } : {}),
          },
        },
        select: {
          chantier: {
            select: {
              id: true,
              dateDebut: true,
              dateFin: true,
              dossier: { select: { nomClient: true } },
            },
          },
        },
      },
    },
  });

  return ouvriers.map((o) => ({
    id: o.id,
    nom: o.nom,
    actif: o.actif,
    absences: o.absences,
    chantiers: o.affectations.map((a) => ({
      id: a.chantier.id,
      nomClient: a.chantier.dossier.nomClient,
      dateDebut: a.chantier.dateDebut,
      dateFin: a.chantier.dateFin,
    })),
  }));
}

// Re-détection en transaction des conflits d'affectation (absences +
// chevauchements de chantiers non terminés) pour une liste d'ouvriers sur une
// plage. Renvoie des messages « Nom : raison » prêts à afficher, dans l'ordre
// alphabétique des ouvriers.
export async function verifierDispoOuvriers(
  tx: Tx,
  organisationId: string,
  ouvrierIds: string[],
  plage: PlageJours,
  exclureChantierId?: string,
): Promise<string[]> {
  if (ouvrierIds.length === 0) return [];
  const finExclusive = finPlageExclusive(plage);

  // SÉQUENTIEL, volontairement : sur un client de TRANSACTION Prisma, les
  // requêtes partagent une seule connexion — les paralléliser n'apporte rien
  // et n'est pas idiomatique (même choix que verifierCreneau, lib/planning-data).
  const ouvriers = await tx.ouvrier.findMany({
    where: { id: { in: ouvrierIds }, organisationId },
    orderBy: { nom: "asc" },
    select: { id: true, nom: true },
  });
  // Chevauchement de jours inclus : debut < finExclusive(candidat) ET
  // fin >= debut(candidat) — toutes les bornes sont des minuits Paris.
  const absences = await tx.absenceOuvrier.findMany({
    where: {
      ouvrierId: { in: ouvrierIds },
      ouvrier: { organisationId },
      dateDebut: { lt: finExclusive },
      dateFin: { gte: plage.dateDebut },
    },
    select: { ouvrierId: true, dateDebut: true, dateFin: true, motif: true },
  });
  const affectations = await tx.affectationChantier.findMany({
    where: {
      ouvrierId: { in: ouvrierIds },
      chantier: {
        organisationId,
        termineLe: null,
        ...(exclureChantierId ? { id: { not: exclureChantierId } } : {}),
        dateDebut: { lt: finExclusive },
        dateFin: { gte: plage.dateDebut },
      },
    },
    select: {
      ouvrierId: true,
      chantier: {
        select: {
          id: true,
          dateDebut: true,
          dateFin: true,
          dossier: { select: { nomClient: true } },
        },
      },
    },
  });

  const messages: string[] = [];
  for (const ouvrier of ouvriers) {
    const conflits = detecterConflitsOuvrier(plage, {
      chantiers: affectations
        .filter((a) => a.ouvrierId === ouvrier.id)
        .map((a) => ({
          id: a.chantier.id,
          nomClient: a.chantier.dossier.nomClient,
          dateDebut: a.chantier.dateDebut,
          dateFin: a.chantier.dateFin,
        })),
      absences: absences.filter((a) => a.ouvrierId === ouvrier.id),
    });
    for (const conflit of conflits) {
      messages.push(`${ouvrier.nom} : ${libelleConflitChantier(conflit)}`);
    }
  }
  return messages;
}
