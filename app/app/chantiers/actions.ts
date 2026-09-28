"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requireRoleActif, BACK_OFFICE_ROLES } from "@/lib/auth";
import { enregistrerEvenement } from "@/lib/evenements";
import { creerNotification } from "@/lib/notifications";
import { parseDateJour } from "@/lib/planning";
import { avecSucces } from "@/lib/succes";
import { dossiersBadgesTag, statsTag } from "@/lib/cache-tags";
import { DUREE_CHANTIER_MAX_JOURS, finDepuisDuree } from "@/lib/chantiers";
import {
  ConflitsChantierDetectes,
  verifierDispoOuvriers,
} from "@/lib/chantiers-data";
import { ErreurMetier, estContrainteUnique, messageFromError } from "@/lib/erreurs";

// État des formulaires chantier : les conflits de dispo re-détectés EN
// TRANSACTION sont renvoyés au client si `forcer` n'est pas coché — l'UI les
// affiche avec le forçage explicite (même philosophie que la planification
// des visites : avertir, jamais bloquer).
export type ChantierState = { error: string | null; conflits: string[] };

function revaliderChantiers(
  organisationId: string,
  dossierId: string,
  chantierId?: string,
) {
  revalidatePath("/app/chantiers");
  if (chantierId) revalidatePath(`/app/chantiers/${chantierId}`);
  revalidatePath("/app/dossiers");
  revalidatePath(`/app/dossiers/${dossierId}`);
  revalidatePath("/app/historique");
  // Espace ouvrier : ses listes reflètent immédiatement les affectations.
  revalidatePath("/app/mes-chantiers");
  if (chantierId) revalidatePath(`/app/mes-chantiers/${chantierId}`);
  revalidatePath("/app/mon-planning");
  // Badge « À traiter » : la population « chantiers à clôturer » (lib/a-traiter)
  // bouge à chaque changement de dateFin/termineLe (création, modif, terminer,
  // rouvrir, suppression) — on recompte immédiatement. Idem pour les caches
  // Statistiques/CA (chantiers en cours, terminés, carnet de commandes).
  revalidateTag(dossiersBadgesTag(organisationId));
  revalidateTag(statsTag(organisationId));
}

// Notifie les COMPTES ouvriers concernés par une mutation de chantier
// (affectation / replanification / retrait) — miroir exact des notifications
// de visite du conducteur : seuls les ouvriers dont la fiche est liée à un
// compte (userId) reçoivent quelque chose, dans la MÊME transaction.
async function notifierOuvriers(
  tx: Prisma.TransactionClient,
  args: {
    acteurId: string;
    type: "CHANTIER_AFFECTE" | "CHANTIER_REPLANIFIE" | "CHANTIER_RETIRE";
    ouvrierIds: readonly string[];
    chantierId: string;
    dossierId: string;
    nomClient: string;
    adresse: string;
    dateDebut: Date;
    dateFin: Date;
  },
): Promise<void> {
  if (args.ouvrierIds.length === 0) return;
  const comptes = await tx.ouvrier.findMany({
    where: { id: { in: [...args.ouvrierIds] }, userId: { not: null } },
    select: { userId: true },
  });
  for (const { userId } of comptes) {
    if (!userId) continue;
    await creerNotification(tx, {
      destinataireId: userId,
      acteurId: args.acteurId,
      type: args.type,
      dossierId: args.dossierId,
      meta: {
        chantierId: args.chantierId,
        nomClient: args.nomClient,
        adresse: args.adresse,
        dateDebut: args.dateDebut.toISOString(),
        dateFin: args.dateFin.toISOString(),
      },
    });
  }
}

// Champs communs création/modification (dates, ouvriers). Pas de contenu
// libre : le détail des travaux vit sur le devis (imprimé à part pour les
// ouvriers), la fiche chantier porte la logistique.
function parseChampsChantier(formData: FormData):
  | {
      dateDebut: Date;
      dateFin: Date;
      ouvrierIds: string[];
      forcer: boolean;
    }
  | { error: string } {
  const dateDebut = parseDateJour(String(formData.get("dateDebut") ?? ""));
  if (!dateDebut) return { error: "Choisissez une date de début." };

  const nbJours = Number(formData.get("nbJours") ?? 0);
  if (
    !Number.isInteger(nbJours) ||
    nbJours < 1 ||
    nbJours > DUREE_CHANTIER_MAX_JOURS
  ) {
    return {
      error: `La durée doit être comprise entre 1 et ${DUREE_CHANTIER_MAX_JOURS} jours.`,
    };
  }

  const ouvrierIds = [
    ...new Set(formData.getAll("ouvriers").map(String)),
  ].filter(Boolean);
  if (ouvrierIds.length === 0) {
    return { error: "Affectez au moins un ouvrier." };
  }

  return {
    dateDebut,
    dateFin: finDepuisDuree(dateDebut, nbJours),
    ouvrierIds,
    forcer: formData.get("forcer") === "1",
  };
}

// Créer un chantier depuis un dossier PRET_POUR_TRAVAUX. Transaction :
// vérification org du dossier ET de chaque ouvrier, re-détection des conflits
// de dispo (bloquants sauf `forcer`), création + affectations, puis le
// dossier passe EN_CHANTIER — il sort du kanban et vit dans cette section.
export async function creerChantier(
  _prev: ChantierState,
  formData: FormData,
): Promise<ChantierState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error, conflits: [] };
  const { user } = garde;

  const dossierId = String(formData.get("dossierId") ?? "");
  if (!dossierId) return { error: "Choisissez un dossier.", conflits: [] };

  const champs = parseChampsChantier(formData);
  if ("error" in champs) return { error: champs.error, conflits: [] };

  let chantierId = "";
  try {
    await prisma.$transaction(async (tx) => {
      const dossier = await tx.dossier.findFirst({
        where: { id: dossierId, organisationId: user.organisationId },
        select: { id: true, statut: true, nomClient: true, adresse: true },
      });
      if (!dossier) throw new ErreurMetier("Dossier introuvable.");
      if (dossier.statut !== "PRET_POUR_TRAVAUX") {
        throw new ErreurMetier(
          "Seul un dossier « Prêt pour travaux » peut passer en chantier.",
        );
      }

      // Chaque ouvrier doit appartenir à l'org et être actif.
      const ouvriers = await tx.ouvrier.count({
        where: {
          id: { in: champs.ouvrierIds },
          organisationId: user.organisationId,
          actif: true,
        },
      });
      if (ouvriers !== champs.ouvrierIds.length) {
        throw new ErreurMetier("Ouvrier invalide.");
      }

      // Re-détection en transaction (les dispos ont pu bouger depuis l'affichage).
      const conflits = await verifierDispoOuvriers(
        tx,
        user.organisationId,
        champs.ouvrierIds,
        { dateDebut: champs.dateDebut, dateFin: champs.dateFin },
      );
      if (conflits.length > 0 && !champs.forcer) {
        throw new ConflitsChantierDetectes(conflits);
      }

      const chantier = await tx.chantier.create({
        data: {
          dossierId,
          organisationId: user.organisationId,
          dateDebut: champs.dateDebut,
          dateFin: champs.dateFin,
          affectations: {
            create: champs.ouvrierIds.map((ouvrierId) => ({ ouvrierId })),
          },
        },
      });
      chantierId = chantier.id;

      // Prise en charge = l'empêchement est levé (même principe que
      // planifierVisite : le signalement reste tracé au journal EMPECHEMENT).
      await tx.dossier.update({
        where: { id: dossierId },
        data: {
          statut: "EN_CHANTIER",
          empechementLe: null,
          empechementMotif: null,
        },
      });

      await enregistrerEvenement(tx, {
        dossierId,
        type: "CHANTIER_CREE",
        acteurId: user.id,
        meta: {
          dateDebut: champs.dateDebut.toISOString(),
          dateFin: champs.dateFin.toISOString(),
        },
      });

      await notifierOuvriers(tx, {
        acteurId: user.id,
        type: "CHANTIER_AFFECTE",
        ouvrierIds: champs.ouvrierIds,
        chantierId: chantier.id,
        dossierId,
        nomClient: dossier.nomClient,
        adresse: dossier.adresse,
        dateDebut: champs.dateDebut,
        dateFin: champs.dateFin,
      });
    });
  } catch (e) {
    if (e instanceof ConflitsChantierDetectes) {
      return {
        error:
          "Des conflits de disponibilité ont été détectés. Vérifiez, puis « Créer quand même » pour forcer.",
        conflits: e.conflits,
      };
    }
    if (estContrainteUnique(e)) {
      return { error: "Ce dossier a déjà un chantier.", conflits: [] };
    }
    return { error: messageFromError(e), conflits: [] };
  }

  revaliderChantiers(user.organisationId, dossierId, chantierId);
  redirect(avecSucces(`/app/chantiers/${chantierId}`, "chantier-cree"));
}

// Modifier un chantier non terminé (dates, contenu, ouvriers). Le chantier
// édité est exclu de la détection de conflits (sinon auto-conflit) ; un
// ouvrier devenu inactif reste accepté s'il était déjà affecté.
export async function modifierChantier(
  chantierId: string,
  _prev: ChantierState,
  formData: FormData,
): Promise<ChantierState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error, conflits: [] };
  const { user } = garde;

  const champs = parseChampsChantier(formData);
  if ("error" in champs) return { error: champs.error, conflits: [] };

  let dossierId = "";
  try {
    await prisma.$transaction(async (tx) => {
      const chantier = await tx.chantier.findFirst({
        where: { id: chantierId, organisationId: user.organisationId },
        select: {
          id: true,
          dossierId: true,
          termineLe: true,
          dateDebut: true,
          dateFin: true,
          affectations: { select: { ouvrierId: true } },
          dossier: { select: { nomClient: true, adresse: true } },
        },
      });
      if (!chantier) throw new ErreurMetier("Chantier introuvable.");
      if (chantier.termineLe) {
        throw new ErreurMetier(
          "Ce chantier est terminé : rouvrez-le avant de le modifier.",
        );
      }
      dossierId = chantier.dossierId;

      const dejaAffectes = new Set(
        chantier.affectations.map((a) => a.ouvrierId),
      );

      // Diff pour le journal CHANTIER_MODIFIE (noms canoniques — libellés
      // français dérivés à l'affichage). Rien de changé → pas d'événement.
      const champsModifies: string[] = [];
      if (chantier.dateDebut.getTime() !== champs.dateDebut.getTime()) {
        champsModifies.push("dateDebut");
      }
      if (chantier.dateFin.getTime() !== champs.dateFin.getTime()) {
        champsModifies.push("dateFin");
      }
      if (
        champs.ouvrierIds.length !== dejaAffectes.size ||
        champs.ouvrierIds.some((id) => !dejaAffectes.has(id))
      ) {
        champsModifies.push("ouvriers");
      }
      const ouvriers = await tx.ouvrier.findMany({
        where: {
          id: { in: champs.ouvrierIds },
          organisationId: user.organisationId,
        },
        select: { id: true, actif: true },
      });
      const valides = ouvriers.filter(
        (o) => o.actif || dejaAffectes.has(o.id),
      );
      if (valides.length !== champs.ouvrierIds.length) {
        throw new ErreurMetier("Ouvrier invalide.");
      }

      const conflits = await verifierDispoOuvriers(
        tx,
        user.organisationId,
        champs.ouvrierIds,
        { dateDebut: champs.dateDebut, dateFin: champs.dateFin },
        chantier.id,
      );
      if (conflits.length > 0 && !champs.forcer) {
        throw new ConflitsChantierDetectes(conflits);
      }

      await tx.affectationChantier.deleteMany({
        where: { chantierId: chantier.id },
      });
      await tx.chantier.update({
        where: { id: chantier.id },
        data: {
          dateDebut: champs.dateDebut,
          dateFin: champs.dateFin,
          affectations: {
            create: champs.ouvrierIds.map((ouvrierId) => ({ ouvrierId })),
          },
        },
      });

      if (champsModifies.length > 0) {
        await enregistrerEvenement(tx, {
          dossierId: chantier.dossierId,
          type: "CHANTIER_MODIFIE",
          acteurId: user.id,
          meta: { champsModifies },
        });
      }

      // Notifications ouvriers : arrivants / partants / dates qui bougent
      // pour ceux qui restent — miroir de replanifierVisite.
      const idsApres = new Set(champs.ouvrierIds);
      const ajoutes = champs.ouvrierIds.filter((oid) => !dejaAffectes.has(oid));
      const retires = [...dejaAffectes].filter((oid) => !idsApres.has(oid));
      const datesModifiees =
        champsModifies.includes("dateDebut") ||
        champsModifies.includes("dateFin");
      const restants = datesModifiees
        ? champs.ouvrierIds.filter((oid) => dejaAffectes.has(oid))
        : [];
      const contexte = {
        acteurId: user.id,
        chantierId: chantier.id,
        dossierId: chantier.dossierId,
        nomClient: chantier.dossier.nomClient,
        adresse: chantier.dossier.adresse,
        dateDebut: champs.dateDebut,
        dateFin: champs.dateFin,
      };
      await notifierOuvriers(tx, {
        ...contexte,
        type: "CHANTIER_AFFECTE",
        ouvrierIds: ajoutes,
      });
      await notifierOuvriers(tx, {
        ...contexte,
        type: "CHANTIER_RETIRE",
        ouvrierIds: retires,
      });
      await notifierOuvriers(tx, {
        ...contexte,
        type: "CHANTIER_REPLANIFIE",
        ouvrierIds: restants,
      });
    });
  } catch (e) {
    if (e instanceof ConflitsChantierDetectes) {
      return {
        error:
          "Des conflits de disponibilité ont été détectés. Vérifiez, puis « Enregistrer quand même » pour forcer.",
        conflits: e.conflits,
      };
    }
    return { error: messageFromError(e), conflits: [] };
  }

  revaliderChantiers(user.organisationId, dossierId, chantierId);
  redirect(avecSucces(`/app/chantiers/${chantierId}`, "chantier-modifie"));
}

// Marquer terminé : le SEUL fait explicite du cycle de vie (le reste est
// dérivé des dates). Horodaté serveur ; le dossier passe TERMINE et sort
// définitivement du flux.
export async function terminerChantier(
  formData: FormData,
): Promise<{ error: string | null }> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Chantier introuvable." };

  let dossierId = "";
  try {
    await prisma.$transaction(async (tx) => {
      const chantier = await tx.chantier.findFirst({
        where: { id, organisationId: user.organisationId },
        select: { id: true, dossierId: true, termineLe: true },
      });
      if (!chantier) throw new ErreurMetier("Chantier introuvable.");
      if (chantier.termineLe) {
        throw new ErreurMetier("Ce chantier est déjà terminé.");
      }
      dossierId = chantier.dossierId;

      // Garde CONDITIONNELLE (concurrence) : termineLe re-vérifié DANS
      // l'écriture — deux clics simultanés ne terminent (et ne journalisent
      // CHANTIER_TERMINE) qu'une seule fois.
      const { count } = await tx.chantier.updateMany({
        where: {
          id: chantier.id,
          organisationId: user.organisationId,
          termineLe: null,
        },
        data: { termineLe: new Date() },
      });
      if (count === 0) {
        throw new ErreurMetier("Ce chantier est déjà terminé.");
      }
      await tx.dossier.update({
        where: { id: chantier.dossierId },
        data: { statut: "TERMINE" },
      });

      await enregistrerEvenement(tx, {
        dossierId: chantier.dossierId,
        type: "CHANTIER_TERMINE",
        acteurId: user.id,
      });
    });
  } catch (e) {
    return { error: messageFromError(e) };
  }

  revaliderChantiers(user.organisationId, dossierId, id);
  return { error: null };
}

// Rouvrir un chantier terminé (marqué par erreur, travaux à reprendre…) :
// termineLe repart à null, le dossier revient EN_CHANTIER.
export async function rouvrirChantier(
  formData: FormData,
): Promise<{ error: string | null }> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Chantier introuvable." };

  let dossierId = "";
  try {
    await prisma.$transaction(async (tx) => {
      const chantier = await tx.chantier.findFirst({
        where: { id, organisationId: user.organisationId },
        select: { id: true, dossierId: true, termineLe: true },
      });
      if (!chantier) throw new ErreurMetier("Chantier introuvable.");
      if (!chantier.termineLe) {
        throw new ErreurMetier("Ce chantier n'est pas terminé.");
      }
      dossierId = chantier.dossierId;

      // Garde CONDITIONNELLE (concurrence) : termineLe re-vérifié DANS
      // l'écriture — deux clics simultanés ne rouvrent (et ne journalisent
      // CHANTIER_ROUVERT) qu'une seule fois.
      const { count } = await tx.chantier.updateMany({
        where: {
          id: chantier.id,
          organisationId: user.organisationId,
          termineLe: { not: null },
        },
        data: { termineLe: null },
      });
      if (count === 0) {
        throw new ErreurMetier("Ce chantier n'est pas terminé.");
      }
      await tx.dossier.update({
        where: { id: chantier.dossierId },
        data: { statut: "EN_CHANTIER" },
      });

      await enregistrerEvenement(tx, {
        dossierId: chantier.dossierId,
        type: "CHANTIER_ROUVERT",
        acteurId: user.id,
      });
    });
  } catch (e) {
    return { error: messageFromError(e) };
  }

  revaliderChantiers(user.organisationId, dossierId, id);
  return { error: null };
}

// Supprimer un chantier NON terminé (erreur de création, travaux reportés
// sine die…) : le dossier redevient PRET_POUR_TRAVAUX et retrouve sa place
// dans la file — même logique de re-dérivation que l'annulation de visite.
// Un chantier terminé ne se supprime pas : rouvrir d'abord (l'historique du
// dossier reste cohérent). redirect() vers la liste en cas de succès.
export async function supprimerChantier(
  formData: FormData,
): Promise<{ error: string | null }> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Chantier introuvable." };

  let dossierId = "";
  try {
    await prisma.$transaction(async (tx) => {
      const chantier = await tx.chantier.findFirst({
        where: { id, organisationId: user.organisationId },
        select: {
          id: true,
          dossierId: true,
          termineLe: true,
          dateDebut: true,
          dateFin: true,
          affectations: { select: { ouvrierId: true } },
          dossier: { select: { nomClient: true, adresse: true } },
        },
      });
      if (!chantier) throw new ErreurMetier("Chantier introuvable.");
      if (chantier.termineLe) {
        throw new ErreurMetier(
          "Ce chantier est terminé : rouvrez-le d'abord si vous devez vraiment le supprimer.",
        );
      }
      dossierId = chantier.dossierId;

      // Les affectations partent en cascade.
      await tx.chantier.delete({ where: { id: chantier.id } });
      await tx.dossier.update({
        where: { id: chantier.dossierId },
        data: { statut: "PRET_POUR_TRAVAUX" },
      });

      await enregistrerEvenement(tx, {
        dossierId: chantier.dossierId,
        type: "CHANTIER_SUPPRIME",
        acteurId: user.id,
      });

      // Les comptes ouvriers affectés apprennent que le chantier disparaît
      // de leur planning (le lien de la notification devient simplement mort).
      await notifierOuvriers(tx, {
        acteurId: user.id,
        type: "CHANTIER_RETIRE",
        ouvrierIds: chantier.affectations.map((a) => a.ouvrierId),
        chantierId: chantier.id,
        dossierId: chantier.dossierId,
        nomClient: chantier.dossier.nomClient,
        adresse: chantier.dossier.adresse,
        dateDebut: chantier.dateDebut,
        dateFin: chantier.dateFin,
      });
    });
  } catch (e) {
    return { error: messageFromError(e) };
  }

  revaliderChantiers(user.organisationId, dossierId);
  redirect(avecSucces("/app/chantiers", "chantier-supprime"));
}
