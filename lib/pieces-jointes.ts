// Pièces jointes d'un dossier (devis, courriers, rapports…) — stockées dans le
// bucket privé "sinistres" sous organisationId/dossiers/dossierId/<uuid>.<ext>,
// distinct des photos de visite (organisationId/visiteId/<uuid>.jpg).
//
// Module PUR (zéro I/O) : importable côté client (attribut `accept` du champ
// fichier, pré-contrôle de taille, affichage) comme côté serveur (le juge
// final). La signature des URLs (client admin) vit dans pieces-jointes-storage.

// Types de fichiers acceptés : documents bureautiques + images. Chaque MIME
// est mappé vers l'extension d'objet stockée — le contentType de l'upload et
// l'extension sont ainsi toujours cohérents (contrôlés serveur avant de signer).
export const MIME_PIECE_JOINTE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

// Extension d'un MIME accepté, sinon null. Object.hasOwn : un MIME forgé
// « constructor » / « __proto__ » / « toString » ne doit jamais passer le
// contrôle via le prototype de l'objet.
export function extensionPieceJointe(mimeType: string): string | null {
  return Object.hasOwn(MIME_PIECE_JOINTE, mimeType)
    ? MIME_PIECE_JOINTE[mimeType]
    : null;
}

// Extensions correspondantes (dédupliquées), pour la regex de validation du
// nom d'objet.
export const EXTENSIONS_PIECE_JOINTE = [
  ...new Set(Object.values(MIME_PIECE_JOINTE)),
];

// Valeur de l'attribut `accept` du champ fichier : la liste des MIME acceptés.
export const ACCEPT_PIECE_JOINTE = Object.keys(MIME_PIECE_JOINTE).join(",");

// Plafonds : bornent le coût Storage et le nombre d'URLs signées par dossier.
export const MAX_PIECES_PAR_DOSSIER = 30;
export const MAX_TAILLE_PIECE_OCTETS = 15 * 1024 * 1024; // 15 Mo

// Nom d'objet attendu sous org/dossiers/dossierId/ : <uuid v4>.<ext autorisée>
// (élimine toute traversée « .. » et tout format inattendu).
const NOM_OBJET_RE = new RegExp(
  `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(${EXTENSIONS_PIECE_JOINTE.join("|")})$`,
);

// Préfixe d'objet des pièces jointes d'un dossier donné.
export function prefixePiecesJointes(
  organisationId: string,
  dossierId: string,
): string {
  return `${organisationId}/dossiers/${dossierId}/`;
}

// Un chemin d'objet est-il bien une pièce jointe légitime de CE dossier ?
// (préfixe org/dossier exact + nom d'objet conforme). Défense contre un chemin
// forgé pointant ailleurs dans le bucket.
export function cheminPieceJointeValide(
  chemin: string,
  organisationId: string,
  dossierId: string,
): boolean {
  const prefixe = prefixePiecesJointes(organisationId, dossierId);
  return (
    chemin.startsWith(prefixe) && NOM_OBJET_RE.test(chemin.slice(prefixe.length))
  );
}

// Pièce jointe prête à afficher : métadonnées + URL signée de téléchargement
// (ou null si la signature a échoué — l'appelant montre un état dégradé).
export type PieceJointeSignee = {
  id: string;
  nom: string;
  taille: number;
  url: string | null;
};

// « 1 234 567 » octets → « 1,2 Mo » : taille lisible à la française.
export function formatTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  const ko = octets / 1024;
  if (ko < 1024) return `${Math.round(ko)} Ko`;
  const mo = ko / 1024;
  return `${mo.toFixed(1).replace(".", ",")} Mo`;
}
