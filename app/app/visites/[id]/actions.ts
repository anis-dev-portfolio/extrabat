"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRoleActif } from "@/lib/auth";
import { enregistrerEvenement } from "@/lib/evenements";
import { MOTIFS_EMPECHEMENT, statutApresAnnulation } from "@/lib/metier";
import { purgerPhotosStorageVisite } from "@/lib/photos-storage";
import { dossiersBadgesTag, statsTag } from "@/lib/cache-tags";
import { avecSucces } from "@/lib/succes";
import { ErreurMetier, messageFromError } from "@/lib/erreurs";
import { LIMITES, champOptionnel, texte } from "@/lib/validation";

export type ActionState = { error: string | null };

// Le conducteur signale qu'il n'a pas pu effectuer sa visite (client absent,
// accès impossible…). Miroir d'annulerVisite (app/app/dossiers/actions.ts),
// côté terrain : la visite PLANIFIEE est supprimée, le statut du dossier
// re-dérivé des visites restantes, et l'empêchement horodaté sur le dossier
// (empechementLe/empechementMotif — nullés à la prochaine planification) pour
// que le bureau le voie dans la file « À traiter ». L'historique complet
// (numéro, date prévue, motif) part dans le journal EvenementDossier, écrit
// DANS la même transaction.
export async function signalerEmpechement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const garde = await requireRoleActif(["CONDUCTEUR"]);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;

  const visiteId = String(formData.get("visiteId") ?? "");
  if (!visiteId) return { error: "Visite introuvable." };

  const motifChoisi = String(formData.get("motif") ?? "");
  const precision = texte(formData, "precision");

  if (!MOTIFS_EMPECHEMENT.includes(motifChoisi)) {
    return { error: "Choisissez un motif d'empêchement." };
  }
  if (motifChoisi === "Autre" && !precision) {
    return { error: "Précisez le motif de l'empêchement." };
  }

  // Motif final stocké/journalisé : le préset, complété de la précision libre.
  // « Autre » = la précision EST le motif.
  const motif =
    motifChoisi === "Autre"
      ? precision
      : precision
        ? `${motifChoisi} — ${precision}`
        : motifChoisi;
  const invalide = champOptionnel(motif, LIMITES.MOTIF_EMPECHEMENT, "Le motif");
  if (invalide) return { error: invalide };

  let dossierId = "";
  try {
    await prisma.$transaction(async (tx) => {
      // Double scoping : la visite doit appartenir à l'organisation ET être
      // assignée au conducteur connecté (un conducteur ne signale que SES
      // visites) — même invariant que chargerVisiteConducteur (lib/visites.ts).
      const visite = await tx.visite.findFirst({
        where: {
          id: visiteId,
          conducteurId: user.id,
          dossier: { organisationId: user.organisationId },
        },
        select: {
          id: true,
          statut: true,
          dossierId: true,
          numero: true,
          datePlanifiee: true,
          dureeMinutes: true, // amplitude prévue → meta « prévue »
          // classeHumiditeLe : nécessaire au bloc horodaterAttente ci-dessous.
          dossier: { select: { classeHumiditeLe: true } },
        },
      });
      if (!visite) throw new ErreurMetier("Visite introuvable.");
      if (visite.statut !== "PLANIFIEE") {
        throw new ErreurMetier(
          "Cette visite n'est plus planifiée — rien à signaler.",
        );
      }
      dossierId = visite.dossierId;

      // Journal AVANT le delete : l'événement porte le contexte de la visite
      // supprimée (numéro, date prévue) — introuvable après coup.
      await enregistrerEvenement(tx, {
        dossierId: visite.dossierId,
        type: "EMPECHEMENT",
        acteurId: user.id,
        meta: {
          numero: visite.numero,
          datePrevue: visite.datePlanifiee.toISOString(),
          dureePrevue: visite.dureeMinutes,
          motif,
        },
      });

      // Garde CONDITIONNELLE (concurrence) : le statut PLANIFIEE est re-vérifié
      // DANS la suppression elle-même — un empêchement concurrent d'une
      // annulation bureau (ou d'un envoi de compte-rendu) ne supprime qu'une
      // fois ; l'autre sort avec une erreur métier claire, et le rollback
      // retire l'événement journalisé ci-dessus (atomique).
      const { count } = await tx.visite.deleteMany({
        where: { id: visite.id, statut: "PLANIFIEE" },
      });
      if (count === 0) {
        throw new ErreurMetier(
          "Cette visite n'est plus planifiée — rien à signaler.",
        );
      }

      // Statut re-dérivé des visites restantes — même logique qu'annulerVisite,
      // seuil d'humidité de l'ORG (pas le seuil usine).
      const restantes = await tx.visite.findMany({
        where: { dossierId: visite.dossierId },
        select: { statut: true, numero: true, tauxHumidite: true },
      });
      const nouveauStatut = statutApresAnnulation(
        restantes,
        user.organisation.seuilHumidite,
      );
      // Invariant : EN_ATTENTE_HUMIDITE doit horodater classeHumiditeLe (départ
      // du délai de séchage), sinon le dossier reste sans échéance ni badge
      // « À re-planifier ». On ne pose la date que si elle MANQUE : une attente
      // déjà horodatée conserve son délai (survit au cycle planifier→annuler).
      const horodaterAttente =
        nouveauStatut === "EN_ATTENTE_HUMIDITE" &&
        !visite.dossier.classeHumiditeLe;
      await tx.dossier.update({
        where: { id: visite.dossierId },
        data: {
          statut: nouveauStatut,
          ...(horodaterAttente ? { classeHumiditeLe: new Date() } : {}),
          empechementLe: new Date(),
          empechementMotif: motif,
        },
      });
    });
  } catch (e) {
    return { error: messageFromError(e) };
  }

  // Les uploads par URL signée écrivent dans le bucket AVANT l'envoi du
  // compte-rendu : une visite encore PLANIFIEE peut donc avoir des objets
  // Storage alors qu'elle n'a AUCUNE ligne Photo en base (les lignes ne sont
  // créées qu'à l'envoi du CR) — l'ancien refus sur `_count.photos > 0` ne se
  // déclenchait jamais. À la place : purge best-effort du préfixe
  // org/visiteId APRÈS le commit (ne lève jamais, pas de try/catch).
  await purgerPhotosStorageVisite(user.organisationId, visiteId);

  // Mêmes chemins qu'annulerVisite + la file « À traiter » (3ᵉ population).
  revalidatePath("/app/mes-visites");
  revalidatePath("/app/dossiers");
  revalidatePath(`/app/dossiers/${dossierId}`);
  revalidatePath("/app/planning");
  revalidatePath("/app/a-traiter");
  revalidateTag(dossiersBadgesTag(user.organisationId));
  revalidateTag(statsTag(user.organisationId));

  // redirect() HORS du try/catch (il lève en interne). Code toasté par
  // app/app/toast-succes.tsx.
  redirect(avecSucces("/app/mes-visites", "empechement-signale"));
}
