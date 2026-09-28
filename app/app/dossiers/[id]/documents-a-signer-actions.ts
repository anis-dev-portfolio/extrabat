"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleActif, BACK_OFFICE_ROLES } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { BUCKET_SINISTRES } from "@/lib/supabase/bucket";
import { enregistrerEvenement } from "@/lib/evenements";
import { creerNotification } from "@/lib/notifications";
import { ErreurMetier, messageFromError } from "@/lib/erreurs";
import { champRequis, LIMITES } from "@/lib/validation";
import {
  MIME_DOCUMENT_A_SIGNER,
  MAX_DOCUMENTS_PAR_DOSSIER,
  MAX_TAILLE_DOCUMENT_OCTETS,
  prefixeDocumentsASigner,
  cheminDocumentOriginalValide,
} from "@/lib/documents-a-signer";

// Documents à faire signer (PV de fin de travaux…), back-office uniquement.
// Même flux en deux temps que les pièces jointes : (1) URL signée d'upload,
// (2) upload direct navigateur → Storage, (3) enregistrement de la ligne —
// avec en plus le calcul serveur du hash SHA-256 de l'original (valeur
// probante, re-vérifié avant le tamponnage de la signature).

export type UploadDocumentASigner =
  | { path: string; token: string }
  | { error: string };

export type DocumentASignerResultat = { error: string | null };

// Étape 1 — URL signée d'upload. PDF STRICT (le tamponnage pdf-lib ne
// traite que ça), plafond et appartenance org vérifiés AVANT de signer.
export async function creerUploadDocumentASigner(
  dossierId: string,
  mimeType: string,
): Promise<UploadDocumentASigner> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;

  if (mimeType !== MIME_DOCUMENT_A_SIGNER) {
    return { error: "Seuls les PDF peuvent être envoyés à la signature." };
  }

  const dossier = await prisma.dossier.findFirst({
    where: { id: dossierId, organisationId: user.organisationId },
    select: { id: true },
  });
  if (!dossier) return { error: "Dossier introuvable." };

  const nb = await prisma.documentASigner.count({ where: { dossierId } });
  if (nb >= MAX_DOCUMENTS_PAR_DOSSIER) {
    return {
      error: `Nombre maximal de documents à signer atteint (${MAX_DOCUMENTS_PAR_DOSSIER}).`,
    };
  }

  const path = `${prefixeDocumentsASigner(user.organisationId, dossierId)}${crypto.randomUUID()}.pdf`;

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (e) {
    console.error("Document à signer : config Supabase admin manquante :", e);
    return { error: "Préparation de l'upload impossible." };
  }

  const { data, error } = await admin.storage
    .from(BUCKET_SINISTRES)
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error(
      `Document à signer : échec createSignedUploadUrl (bucket « ${BUCKET_SINISTRES} ») :`,
      error ?? "réponse vide",
    );
    return { error: "Préparation de l'upload impossible." };
  }
  return { path: data.path, token: data.token };
}

// Étape 3 — enregistre la ligne une fois l'objet uploadé. Re-télécharge
// l'original pour calculer son SHA-256 (le hash porte sur ce que le Storage
// contient VRAIMENT, pas sur ce que le client déclare), puis transaction :
// ligne + journal + notification aux ouvriers affectés au chantier (ceux qui
// ont un compte).
export async function enregistrerDocumentASigner(
  dossierId: string,
  document: { path: string; nom: string; taille: number },
): Promise<DocumentASignerResultat> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;

  const nom = document.nom.trim();
  const erreurNom = champRequis(
    nom,
    LIMITES.PIECE_JOINTE_NOM,
    "Le nom du fichier",
  );
  if (erreurNom) return { error: erreurNom };

  if (
    !cheminDocumentOriginalValide(
      document.path,
      user.organisationId,
      dossierId,
    )
  ) {
    return { error: "Chemin de document invalide." };
  }

  // Hash SHA-256 de l'objet réellement stocké (borne la taille au passage).
  let hashOriginal = "";
  let taille = 0;
  try {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(BUCKET_SINISTRES)
      .download(document.path);
    if (error || !data) throw error ?? new Error("objet introuvable");
    const octets = Buffer.from(await data.arrayBuffer());
    taille = octets.byteLength;
    if (taille === 0) return { error: "Fichier vide." };
    if (taille > MAX_TAILLE_DOCUMENT_OCTETS) {
      return { error: "Fichier trop volumineux (maximum 15 Mo)." };
    }
    // Signature d'en-tête PDF (%PDF-) : dernier filet — le vrai contrôle est
    // le chargement pdf-lib au moment de signer.
    if (!octets.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      return { error: "Ce fichier n'est pas un PDF valide." };
    }
    hashOriginal = createHash("sha256").update(octets).digest("hex");
  } catch (e) {
    console.error("Document à signer : échec du téléchargement de contrôle :", e);
    return { error: "Vérification du fichier impossible. Réessayez." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const dossier = await tx.dossier.findFirst({
        where: { id: dossierId, organisationId: user.organisationId },
        select: {
          id: true,
          nomClient: true,
          adresse: true,
          chantier: {
            select: {
              id: true,
              affectations: {
                select: { ouvrier: { select: { userId: true } } },
              },
            },
          },
        },
      });
      if (!dossier) throw new ErreurMetier("Dossier introuvable.");

      const nb = await tx.documentASigner.count({ where: { dossierId } });
      if (nb >= MAX_DOCUMENTS_PAR_DOSSIER) {
        throw new ErreurMetier(
          `Nombre maximal de documents à signer atteint (${MAX_DOCUMENTS_PAR_DOSSIER}).`,
        );
      }

      await tx.documentASigner.create({
        data: {
          dossierId,
          nom,
          taille,
          cheminOriginal: document.path,
          hashOriginal,
          ajouteParId: user.id,
        },
      });

      await enregistrerEvenement(tx, {
        dossierId,
        type: "DOCUMENT_A_SIGNER_AJOUTE",
        acteurId: user.id,
        meta: { nom },
      });

      // Les ouvriers affectés (avec compte) voient arriver le document.
      if (dossier.chantier) {
        for (const a of dossier.chantier.affectations) {
          if (!a.ouvrier.userId) continue;
          await creerNotification(tx, {
            destinataireId: a.ouvrier.userId,
            acteurId: user.id,
            type: "DOCUMENT_A_SIGNER_RECU",
            dossierId,
            meta: {
              chantierId: dossier.chantier.id,
              nomClient: dossier.nomClient,
              adresse: dossier.adresse,
              nomDocument: nom,
            },
          });
        }
      }
    });
  } catch (e) {
    return { error: messageFromError(e) };
  }

  revalidatePath(`/app/dossiers/${dossierId}`);
  return { error: null };
}

const MESSAGE_DOCUMENT_SIGNE =
  "Ce document est signé : c'est la preuve de la signature du client, il ne peut pas être supprimé. En cas d'erreur, ajoutez le document corrigé et faites-le signer à nouveau.";

// Suppression d'un document ENCORE À SIGNER : retire la ligne (+ journal) en
// transaction, puis purge l'original du Storage en best-effort après commit.
// Un document SIGNÉ n'est jamais supprimable : l'original, la version signée
// et leurs hash SHA-256 constituent la preuve SES (eIDAS) — les perdre ferait
// perdre la preuve. « Mauvais document signé » : on ajoute le document
// corrigé et on le fait signer à nouveau ; les deux restent au dossier.
export async function supprimerDocumentASigner(
  documentId: string,
): Promise<DocumentASignerResultat> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;

  if (!documentId) return { error: "Document introuvable." };

  let chemins: string[] = [];
  let dossierId = "";
  try {
    await prisma.$transaction(async (tx) => {
      const doc = await tx.documentASigner.findFirst({
        where: {
          id: documentId,
          dossier: { organisationId: user.organisationId },
        },
        select: {
          id: true,
          nom: true,
          cheminOriginal: true,
          signeLe: true,
          dossierId: true,
        },
      });
      if (!doc) throw new ErreurMetier("Document introuvable.");
      if (doc.signeLe) throw new ErreurMetier(MESSAGE_DOCUMENT_SIGNE);
      chemins = [doc.cheminOriginal];
      dossierId = doc.dossierId;

      // Garde CONDITIONNELLE (concurrence) : une signature qui aboutit entre
      // la lecture ci-dessus et ce delete (même garde `signeLe: null` côté
      // route de signature) fait échouer la suppression — la preuve gagne.
      const { count } = await tx.documentASigner.deleteMany({
        where: { id: doc.id, signeLe: null },
      });
      if (count === 0) throw new ErreurMetier(MESSAGE_DOCUMENT_SIGNE);

      await enregistrerEvenement(tx, {
        dossierId: doc.dossierId,
        type: "DOCUMENT_A_SIGNER_SUPPRIME",
        acteurId: user.id,
        meta: { nom: doc.nom },
      });
    });
  } catch (e) {
    return { error: messageFromError(e) };
  }

  try {
    await getSupabaseAdmin().storage.from(BUCKET_SINISTRES).remove(chemins);
  } catch (e) {
    console.error(
      `Purge Storage du document à signer ${documentId} : échec (objets peut-être orphelins) :`,
      e,
    );
  }

  revalidatePath(`/app/dossiers/${dossierId}`);
  return { error: null };
}
