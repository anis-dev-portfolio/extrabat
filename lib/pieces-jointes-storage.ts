import "server-only";
import { getSupabaseAdmin, signatureCachee } from "@/lib/supabase/admin";
import { BUCKET_SINISTRES } from "@/lib/supabase/bucket";
import type { PieceJointeSignee } from "@/lib/pieces-jointes";

// Signature Storage des pièces jointes — SERVEUR uniquement (client admin
// service_role). Le pendant pur (constantes, validation) vit dans
// lib/pieces-jointes.ts.

// URL signée de TÉLÉCHARGEMENT d'une pièce (option download → force le
// téléchargement sous son nom d'origine plutôt qu'un affichage inline).
// Signées une par une : createSignedUrls (batch) ne permet pas un nom de
// téléchargement par fichier. null si la signature échoue.
async function urlSigneeTelechargement(
  chemin: string,
  nom: string,
  expiresIn: number,
): Promise<string | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(BUCKET_SINISTRES)
      .createSignedUrl(chemin, expiresIn, { download: nom });
    if (error || !data) return null;
    return data.signedUrl;
  } catch (err) {
    console.error("signerPiecesJointes", err);
    return null;
  }
}

// Variante CACHÉE — même mémoïsation datée que le logo et les photos
// (`signatureCachee`, lib/supabase/admin.ts) : jamais d'URL périmée resservie,
// même si Next garde l'entrée bien au-delà de son TTL. Clé = chemin d'objet
// (immuable, préfixé organisationId/dossierId à l'upload → scoping tenant par
// construction) + nom (cuit dans l'URL via `download`) + expiresIn.
export async function urlSigneeTelechargementCachee(
  chemin: string,
  nom: string,
  expiresIn: number,
): Promise<string | null> {
  return signatureCachee(
    ["url-signee-telechargement", chemin, nom, String(expiresIn)],
    expiresIn,
    () => urlSigneeTelechargement(chemin, nom, expiresIn),
  );
}

// Purge best-effort des objets pièce jointe d'un dossier qui vient d'être
// supprimé (suppression définitive) — miroir de purgerPhotosStorageVisite
// (lib/photos-storage.ts) : liste le préfixe du dossier puis supprime tout,
// y compris les objets orphelins d'uploads jamais enregistrés. Ne lève
// JAMAIS — la suppression du dossier prime ; un échec laisse au pire
// quelques objets orphelins.
export async function purgerPiecesJointesStorageDossier(
  organisationId: string,
  dossierId: string,
): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    const prefixe = `${organisationId}/dossiers/${dossierId}`;
    // list() n'est PAS récursif : les documents à signer vivent dans le
    // sous-dossier a-signer/ (lib/documents-a-signer.ts) — on liste les deux
    // niveaux pour ne laisser aucun orphelin.
    const chemins: string[] = [];
    for (const sousPrefixe of [prefixe, `${prefixe}/a-signer`]) {
      const { data, error } = await admin.storage
        .from(BUCKET_SINISTRES)
        .list(sousPrefixe);
      if (error) throw error;
      for (const objet of data ?? []) {
        // list() renvoie aussi les sous-dossiers (sans id) — on ne supprime
        // que les fichiers.
        if (objet.id) chemins.push(`${sousPrefixe}/${objet.name}`);
      }
    }
    if (chemins.length === 0) return;
    const { error: errSuppression } = await admin.storage
      .from(BUCKET_SINISTRES)
      .remove(chemins);
    if (errSuppression) throw errSuppression;
  } catch (e) {
    console.error(
      `Purge Storage des pièces jointes du dossier ${dossierId} : échec (objets peut-être orphelins) :`,
      e,
    );
  }
}

// URLs signées de TÉLÉCHARGEMENT d'un lot de pièces jointes, via le signeur
// unitaire caché ci-dessus : re-rendre la fiche dossier ne re-mine plus d'URL
// Storage tant que le TTL court. Best-effort par pièce : une signature qui
// échoue donne url null (état dégradé côté appelant) sans casser le lot.
export async function signerPiecesJointes(
  pieces: readonly {
    id: string;
    nom: string;
    taille: number;
    chemin: string;
  }[],
  expiresIn: number,
): Promise<PieceJointeSignee[]> {
  if (pieces.length === 0) return [];
  return Promise.all(
    pieces.map(async (p) => ({
      id: p.id,
      nom: p.nom,
      taille: p.taille,
      url: await urlSigneeTelechargementCachee(p.chemin, p.nom, expiresIn),
    })),
  );
}
