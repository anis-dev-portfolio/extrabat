import "server-only";
import { urlSigneeTelechargementCachee } from "@/lib/pieces-jointes-storage";
import type { DocumentASignerSigne } from "@/lib/documents-a-signer";

// Signature Storage des documents à signer — SERVEUR uniquement. Le pendant
// pur (constantes, validation de chemin) vit dans lib/documents-a-signer.ts.
// Réutilise le signeur unitaire CACHÉ des pièces jointes (chemins immuables,
// TTL = expiresIn/2) : re-rendre une fiche ne re-mine pas d'URL Storage.

// URLs signées de TÉLÉCHARGEMENT d'un lot de documents (original + version
// signée quand elle existe). Best-effort par document : une signature qui
// échoue donne url null sans casser le lot. Le nom de téléchargement de la
// version signée est dérivé du nom d'origine (« PV.pdf » → « PV-signe.pdf »).
export async function signerDocumentsASigner(
  documents: readonly {
    id: string;
    nom: string;
    taille: number;
    cheminOriginal: string;
    cheminSigne: string | null;
    signeLe: Date | null;
    nomSignataire: string | null;
  }[],
  expiresIn: number,
): Promise<DocumentASignerSigne[]> {
  if (documents.length === 0) return [];
  return Promise.all(
    documents.map(async (d) => ({
      id: d.id,
      nom: d.nom,
      taille: d.taille,
      signeLe: d.signeLe,
      nomSignataire: d.nomSignataire,
      urlOriginal: await urlSigneeTelechargementCachee(
        d.cheminOriginal,
        d.nom,
        expiresIn,
      ),
      urlSigne: d.cheminSigne
        ? await urlSigneeTelechargementCachee(
            d.cheminSigne,
            nomVersionSignee(d.nom),
            expiresIn,
          )
        : null,
    })),
  );
}

// « PV de fin de travaux.pdf » → « PV de fin de travaux-signe.pdf ».
export function nomVersionSignee(nom: string): string {
  return nom.toLowerCase().endsWith(".pdf")
    ? `${nom.slice(0, -4)}-signe.pdf`
    : `${nom}-signe.pdf`;
}
