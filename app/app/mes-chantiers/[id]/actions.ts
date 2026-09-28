"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleActif } from "@/lib/auth";
import { enregistrerEvenement } from "@/lib/evenements";
import { notifierBackOffice } from "@/lib/notifications";
import { dossiersBadgesTag, statsTag } from "@/lib/cache-tags";
import { ErreurMetier, messageFromError } from "@/lib/erreurs";

// Marquer terminé DEPUIS LE TERRAIN : même transaction que le marquage
// back-office (chantier.termineLe horodaté serveur + dossier TERMINE), mais
// l'acteur au journal est l'ouvrier (CHANTIER_TERMINE_TERRAIN) et le bureau
// est notifié. Si plusieurs ouvriers sont affectés : tous ont le droit, le
// premier qui clôt gagne — comme la feuille papier aujourd'hui. Le règlement
// (payeLe) reste évidemment côté bureau, découplé par design.
export async function marquerChantierTermineTerrain(
  formData: FormData,
): Promise<{ error: string | null }> {
  const garde = await requireRoleActif(["OUVRIER"]);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Chantier introuvable." };

  // Fiche terrain liée et ACTIVE — même contrat que requireOuvrier, en
  // version ActionState (jamais de redirect dans une Server Action de POST).
  const ouvrier = await prisma.ouvrier.findFirst({
    where: { userId: user.id, organisationId: user.organisationId, actif: true },
    select: { id: true, nom: true },
  });
  if (!ouvrier) return { error: "Votre accès terrain est désactivé." };

  let dossierId = "";
  try {
    await prisma.$transaction(async (tx) => {
      // Triple verrou : id + org + AFFECTATION de cet ouvrier à CE chantier.
      const chantier = await tx.chantier.findFirst({
        where: {
          id,
          organisationId: user.organisationId,
          affectations: { some: { ouvrierId: ouvrier.id } },
        },
        select: {
          id: true,
          dossierId: true,
          termineLe: true,
          dossier: { select: { nomClient: true, adresse: true } },
        },
      });
      if (!chantier) throw new ErreurMetier("Chantier introuvable.");
      if (chantier.termineLe) {
        throw new ErreurMetier("Ce chantier est déjà terminé.");
      }
      dossierId = chantier.dossierId;

      // Garde CONDITIONNELLE (concurrence) : deux clôtures simultanées (deux
      // ouvriers, ou terrain + bureau) ne terminent qu'une seule fois.
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
        type: "CHANTIER_TERMINE_TERRAIN",
        acteurId: user.id,
      });

      await notifierBackOffice(tx, {
        organisationId: user.organisationId,
        acteurId: user.id,
        type: "CHANTIER_TERMINE_TERRAIN",
        dossierId: chantier.dossierId,
        meta: {
          chantierId: chantier.id,
          nomClient: chantier.dossier.nomClient,
          adresse: chantier.dossier.adresse,
          parNom: ouvrier.nom,
        },
      });
    });
  } catch (e) {
    return { error: messageFromError(e) };
  }

  // Mêmes revalidations que le marquage back-office (revaliderChantiers) +
  // l'espace ouvrier.
  revalidatePath("/app/chantiers");
  revalidatePath(`/app/chantiers/${id}`);
  revalidatePath("/app/dossiers");
  revalidatePath(`/app/dossiers/${dossierId}`);
  revalidatePath("/app/historique");
  revalidatePath("/app/mes-chantiers");
  revalidatePath(`/app/mes-chantiers/${id}`);
  revalidateTag(dossiersBadgesTag(user.organisationId));
  revalidateTag(statsTag(user.organisationId));
  return { error: null };
}
