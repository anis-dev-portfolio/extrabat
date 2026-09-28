"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { DossierStatut } from "@/lib/generated/prisma/enums";
import { requireRoleActif, BACK_OFFICE_ROLES } from "@/lib/auth";
import { statsTag } from "@/lib/cache-tags";
import { parseCompteRendu } from "@/lib/visites";
import { enregistrerEvenement } from "@/lib/evenements";
import { DOSSIER_STATUT_LABELS, suggestStatutApresVisite } from "@/lib/metier";
import { ErreurMetier, messageFromError } from "@/lib/erreurs";

// État de la correction de compte-rendu : `ok` referme le formulaire côté
// client ; `info` porte l'avertissement de re-suggestion de classement quand
// le nouveau taux la change (jamais bloquant — le statut du dossier n'est
// JAMAIS modifié ici, l'assistante confirme via l'UI de classement).
export type CorrigerCompteRenduState = {
  error: string | null;
  ok: boolean;
  info: string | null;
};

// Statuts où le classement du dossier découle du dernier taux relevé : une
// correction du taux y mérite l'avertissement de re-suggestion.
const STATUTS_CLASSEMENT: readonly DossierStatut[] = [
  "REALISE",
  "EN_ATTENTE_HUMIDITE",
  "PRET_POUR_TRAVAUX",
];

// Corriger le compte-rendu d'une visite DÉJÀ réalisée (faute de frappe dans le
// taux, résumé à compléter…). Back-office pure — distincte de la transition
// PLANIFIEE→REALISEE (appliquerCompteRendu) : ne touche NI dateRealisee NI
// numero NI aucun statut. La correction est tracée au journal
// (COMPTE_RENDU_CORRIGE) avec la liste des champs réellement modifiés.
export async function corrigerCompteRendu(
  visiteId: string,
  _prev: CorrigerCompteRenduState,
  formData: FormData,
): Promise<CorrigerCompteRenduState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error, ok: false, info: null };
  const { user } = garde;

  // Mêmes validations que la saisie initiale (bornes, taux entier 0-100…).
  const parsed = parseCompteRendu(formData);
  if ("error" in parsed) return { error: parsed.error, ok: false, info: null };
  const { payload } = parsed;

  let dossierId = "";
  let info: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      // Scoping org via le dossier de la visite (comme replanifierVisite).
      const visite = await tx.visite.findFirst({
        where: {
          id: visiteId,
          dossier: { organisationId: user.organisationId },
        },
        select: {
          id: true,
          statut: true,
          numero: true,
          dossierId: true,
          piecesEndommagees: true,
          tauxHumidite: true,
          joursReparationEstimes: true,
          resume: true,
          conclusion: true,
          dossier: { select: { statut: true } },
        },
      });
      if (!visite) throw new ErreurMetier("Visite introuvable.");
      if (visite.statut !== "REALISEE") {
        throw new ErreurMetier(
          "Seul le compte-rendu d'une visite réalisée peut être corrigé.",
        );
      }
      dossierId = visite.dossierId;

      // Diff AVANT écriture (comme modifierDossier) : l'événement ne trace
      // que les champs réellement modifiés — noms canoniques du modèle, le
      // libellé français est dérivé à l'affichage par libelleEvenement.
      const champsModifies: string[] = [];
      if (
        payload.pieces.length !== visite.piecesEndommagees.length ||
        payload.pieces.some((p, i) => p !== visite.piecesEndommagees[i])
      ) {
        champsModifies.push("piecesEndommagees");
      }
      const tauxChange = payload.taux !== visite.tauxHumidite;
      if (tauxChange) champsModifies.push("tauxHumidite");
      if (payload.jours !== visite.joursReparationEstimes) {
        champsModifies.push("joursReparationEstimes");
      }
      if (payload.resume !== visite.resume) champsModifies.push("resume");
      if (payload.conclusion !== visite.conclusion) {
        champsModifies.push("conclusion");
      }
      if (champsModifies.length === 0) {
        throw new ErreurMetier("Aucune modification à enregistrer.");
      }

      // updateMany conditionnel au statut REALISEE : pas de fenêtre entre la
      // lecture et l'écriture. Correction pure : dateRealisee, numero et
      // statut restent intouchés.
      const { count } = await tx.visite.updateMany({
        where: { id: visite.id, statut: "REALISEE" },
        data: {
          piecesEndommagees: payload.pieces,
          tauxHumidite: payload.taux,
          joursReparationEstimes: payload.jours,
          resume: payload.resume,
          conclusion: payload.conclusion,
        },
      });
      if (count === 0) throw new ErreurMetier("Visite introuvable.");

      await enregistrerEvenement(tx, {
        dossierId: visite.dossierId,
        type: "COMPTE_RENDU_CORRIGE",
        acteurId: user.id,
        meta: {
          numero: visite.numero,
          champsModifies,
          // Ancien + nouveau taux tracés uniquement quand le taux change.
          ...(tauxChange
            ? { ancienTaux: visite.tauxHumidite, nouveauTaux: payload.taux }
            : {}),
        },
      });

      // Re-suggestion de classement : signalée SANS reclasser (jamais en
      // douce). Pertinente seulement si la visite corrigée est la dernière
      // réalisée du dossier (le classement se fonde sur son taux) et que le
      // dossier est encore dans le cycle de classement.
      if (tauxChange && STATUTS_CLASSEMENT.includes(visite.dossier.statut)) {
        const seuil = user.organisation.seuilHumidite;
        const ancienne = suggestStatutApresVisite(visite.tauxHumidite, seuil);
        const nouvelle = suggestStatutApresVisite(payload.taux, seuil);
        const derniereRealisee = await tx.visite.findFirst({
          where: { dossierId: visite.dossierId, statut: "REALISEE" },
          orderBy: { numero: "desc" },
          select: { id: true },
        });
        if (nouvelle !== ancienne && derniereRealisee?.id === visite.id) {
          info = `Avec ce taux, le classement suggéré devient « ${DOSSIER_STATUT_LABELS[nouvelle]} » — le statut du dossier n'a pas été modifié, confirmez-le depuis la fiche si besoin.`;
        }
      }
    });
  } catch (e) {
    return { error: messageFromError(e), ok: false, info: null };
  }

  revalidatePath("/app/dossiers");
  revalidatePath(`/app/dossiers/${dossierId}`);
  revalidatePath(`/app/visites/${visiteId}/compte-rendu`);
  // tauxHumidite / joursReparationEstimes alimentent la page Statistiques
  // (histogramme humidité, moyenne des relevés, % au-dessus du seuil) : la
  // correction invalide le cache stats comme toute mutation de ces colonnes.
  revalidateTag(statsTag(user.organisationId));
  return { error: null, ok: true, info };
}
