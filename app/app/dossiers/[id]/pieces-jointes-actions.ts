"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleActif, BACK_OFFICE_ROLES } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { BUCKET_SINISTRES } from "@/lib/supabase/bucket";
import { enregistrerEvenement } from "@/lib/evenements";
import { ErreurMetier, messageFromError } from "@/lib/erreurs";
import { champRequis, LIMITES } from "@/lib/validation";
import {
  extensionPieceJointe,
  MAX_PIECES_PAR_DOSSIER,
  MAX_TAILLE_PIECE_OCTETS,
  prefixePiecesJointes,
  cheminPieceJointeValide,
} from "@/lib/pieces-jointes";

// Pièces jointes du dossier (devis, courriers…), back-office uniquement. Flux
// en deux temps calqué sur les photos de visite : (1) creerUploadPieceJointe
// mine une URL signée d'upload (après avoir validé dossier + type + plafond),
// (2) le navigateur uploade en direct vers le Storage, (3) enregistrerPieceJointe
// crée la ligne. Les validations « chères » (type, plafond) sont faites à
// l'étape 1 : l'étape 3 échoue rarement, donc peu d'objets orphelins.

export type UploadPieceJointe =
  | { path: string; token: string }
  | { error: string };

export type PieceJointeResultat = { error: string | null };

// Étape 1 — URL signée d'upload. Vérifie l'appartenance org du dossier, le
// type MIME accepté et le plafond AVANT de signer.
export async function creerUploadPieceJointe(
  dossierId: string,
  mimeType: string,
): Promise<UploadPieceJointe> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;

  const extension = extensionPieceJointe(mimeType);
  if (!extension) return { error: "Type de fichier non pris en charge." };

  const dossier = await prisma.dossier.findFirst({
    where: { id: dossierId, organisationId: user.organisationId },
    select: { id: true },
  });
  if (!dossier) return { error: "Dossier introuvable." };

  const nb = await prisma.pieceJointe.count({ where: { dossierId } });
  if (nb >= MAX_PIECES_PAR_DOSSIER) {
    return {
      error: `Nombre maximal de pièces jointes atteint (${MAX_PIECES_PAR_DOSSIER}).`,
    };
  }

  const path = `${prefixePiecesJointes(user.organisationId, dossierId)}${crypto.randomUUID()}.${extension}`;

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (e) {
    console.error("Pièce jointe : config Supabase admin manquante :", e);
    return { error: "Préparation de l'upload impossible." };
  }

  const { data, error } = await admin.storage
    .from(BUCKET_SINISTRES)
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error(
      `Pièce jointe : échec createSignedUploadUrl (bucket « ${BUCKET_SINISTRES} ») :`,
      error ?? "réponse vide",
    );
    return { error: "Préparation de l'upload impossible." };
  }
  return { path: data.path, token: data.token };
}

// Étape 3 — enregistre la ligne PieceJointe une fois l'objet uploadé. Revalide
// le chemin (préfixe org/dossier + nom d'objet conforme), le type, la taille et
// le nom, re-vérifie le plafond, et trace l'ajout au journal — le tout en
// transaction.
export async function enregistrerPieceJointe(
  dossierId: string,
  piece: { path: string; nom: string; mimeType: string; taille: number },
): Promise<PieceJointeResultat> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;

  const nom = piece.nom.trim();
  const erreurNom = champRequis(
    nom,
    LIMITES.PIECE_JOINTE_NOM,
    "Le nom du fichier",
  );
  if (erreurNom) return { error: erreurNom };

  if (!extensionPieceJointe(piece.mimeType)) {
    return { error: "Type de fichier non pris en charge." };
  }
  if (!Number.isFinite(piece.taille) || piece.taille <= 0) {
    return { error: "Fichier vide ou taille invalide." };
  }
  if (piece.taille > MAX_TAILLE_PIECE_OCTETS) {
    return { error: "Fichier trop volumineux (maximum 15 Mo)." };
  }
  if (
    !cheminPieceJointeValide(piece.path, user.organisationId, dossierId)
  ) {
    return { error: "Chemin de pièce jointe invalide." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Scoping org via le dossier + re-vérification du plafond dans la
      // transaction (pas de fenêtre entre le count de l'étape 1 et l'écriture).
      const dossier = await tx.dossier.findFirst({
        where: { id: dossierId, organisationId: user.organisationId },
        select: { id: true },
      });
      if (!dossier) throw new ErreurMetier("Dossier introuvable.");

      const nb = await tx.pieceJointe.count({ where: { dossierId } });
      if (nb >= MAX_PIECES_PAR_DOSSIER) {
        throw new ErreurMetier(
          `Nombre maximal de pièces jointes atteint (${MAX_PIECES_PAR_DOSSIER}).`,
        );
      }

      await tx.pieceJointe.create({
        data: {
          dossierId,
          nom,
          chemin: piece.path,
          mimeType: piece.mimeType,
          taille: piece.taille,
          ajouteParId: user.id,
        },
      });

      await enregistrerEvenement(tx, {
        dossierId,
        type: "PIECE_JOINTE_AJOUTEE",
        acteurId: user.id,
        meta: { nom },
      });
    });
  } catch (e) {
    return { error: messageFromError(e) };
  }

  revalidatePath(`/app/dossiers/${dossierId}`);
  return { error: null };
}

// Suppression d'une pièce jointe : retire la ligne (+ événement) en
// transaction, puis purge l'objet Storage en best-effort après le commit (la
// suppression logique prime ; un échec de purge laisse au pire un orphelin).
export async function supprimerPieceJointe(
  pieceId: string,
): Promise<PieceJointeResultat> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;

  if (!pieceId) return { error: "Pièce jointe introuvable." };

  let chemin = "";
  let dossierId = "";
  try {
    await prisma.$transaction(async (tx) => {
      const piece = await tx.pieceJointe.findFirst({
        where: {
          id: pieceId,
          dossier: { organisationId: user.organisationId },
        },
        select: { id: true, nom: true, chemin: true, dossierId: true },
      });
      if (!piece) throw new ErreurMetier("Pièce jointe introuvable.");
      chemin = piece.chemin;
      dossierId = piece.dossierId;

      await tx.pieceJointe.delete({ where: { id: piece.id } });

      await enregistrerEvenement(tx, {
        dossierId: piece.dossierId,
        type: "PIECE_JOINTE_SUPPRIMEE",
        acteurId: user.id,
        meta: { nom: piece.nom },
      });
    });
  } catch (e) {
    return { error: messageFromError(e) };
  }

  // Purge Storage best-effort après le commit (ne bloque pas la suppression).
  try {
    await getSupabaseAdmin().storage.from(BUCKET_SINISTRES).remove([chemin]);
  } catch (e) {
    console.error(
      `Purge Storage de la pièce jointe ${pieceId} : échec (objet peut-être orphelin) :`,
      e,
    );
  }

  revalidatePath(`/app/dossiers/${dossierId}`);
  return { error: null };
}
