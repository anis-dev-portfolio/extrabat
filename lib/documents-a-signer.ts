// Documents de fin de chantier à faire signer (PV de fin de travaux…) —
// stockés dans le bucket privé "sinistres" sous
// organisationId/dossiers/dossierId/a-signer/<uuid>.pdf (original) et
// <uuid>-signe.pdf (version tamponnée, produite par le serveur uniquement).
//
// Module PUR (zéro I/O) : importable côté client (attribut `accept`,
// pré-contrôle de taille) comme côté serveur (le juge final). La signature
// des URLs (client admin) vit dans documents-a-signer-storage.

// PDF STRICT : le tamponnage pdf-lib ne sait traiter que ça — contrairement
// aux pièces jointes multi-formats.
export const MIME_DOCUMENT_A_SIGNER = "application/pdf";

// Plafonds : même taille max que les pièces jointes (bucket configuré à
// 15 Mo), moins de documents (un chantier a UN PV, rarement plus).
export const MAX_DOCUMENTS_PAR_DOSSIER = 10;
export const MAX_TAILLE_DOCUMENT_OCTETS = 15 * 1024 * 1024; // 15 Mo

// Bornes du payload de signature (Route Handler) : nom du signataire et PNG
// du tracé (un pad plein écran compressé pèse quelques dizaines de Ko).
export const MAX_TAILLE_SIGNATURE_OCTETS = 1024 * 1024; // 1 Mo

// Ratio hauteur/largeur du cadre de signature (en points de page). Partagé
// par l'aperçu (signer-client.tsx) et le tamponnage serveur, qui ajuste le
// tracé DANS ce cadre en conservant son aspect : ce qui est tamponné ne
// déborde jamais de ce que l'ouvrier a vu.
export const RATIO_CADRE_SIGNATURE = 0.35;

// Nom d'objet ORIGINAL attendu sous org/dossiers/dossierId/a-signer/ :
// <uuid v4>.pdf (élimine toute traversée « .. » et tout format inattendu).
const NOM_OBJET_ORIGINAL_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/;

// Préfixe d'objet des documents à signer d'un dossier donné.
export function prefixeDocumentsASigner(
  organisationId: string,
  dossierId: string,
): string {
  return `${organisationId}/dossiers/${dossierId}/a-signer/`;
}

// Un chemin d'objet est-il bien un document original légitime de CE dossier ?
// (préfixe org/dossier exact + nom d'objet conforme). Défense contre un chemin
// forgé pointant ailleurs dans le bucket. La version signée n'a pas de
// validation équivalente : son chemin est TOUJOURS produit par le serveur.
export function cheminDocumentOriginalValide(
  chemin: string,
  organisationId: string,
  dossierId: string,
): boolean {
  const prefixe = prefixeDocumentsASigner(organisationId, dossierId);
  return (
    chemin.startsWith(prefixe) &&
    NOM_OBJET_ORIGINAL_RE.test(chemin.slice(prefixe.length))
  );
}

// Document prêt à afficher : métadonnées + URLs signées de téléchargement
// (null si la signature Storage a échoué — état dégradé côté appelant).
// Le statut « signé » se lit sur signeLe (jamais un booléen stocké).
export type DocumentASignerSigne = {
  id: string;
  nom: string;
  taille: number;
  signeLe: Date | null;
  nomSignataire: string | null;
  urlOriginal: string | null;
  urlSigne: string | null;
};
