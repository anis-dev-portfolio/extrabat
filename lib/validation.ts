// Validation manuelle et légère des Server Actions — module PUR (zéro Prisma,
// zéro I/O), importable côté serveur (le juge final) comme côté client
// (maxLength des formulaires). Convention héritée de validerNouvellePlage
// (lib/planning.ts) : un validateur renvoie le MESSAGE d'erreur (string) ou
// null si la valeur est acceptée — l'action le glisse tel quel dans son
// ActionState { error }.

import { parseDateJour } from "@/lib/planning";

// Bornes de longueur partagées serveur/client — SOURCE UNIQUE. Historique :
// les actions dupliquaient ces valeurs inline avec des incohérences
// (téléphone ≤ 200 côté dossiers vs ≤ 30 côté ouvriers, nom d'ouvrier ≤ 100
// vs ≤ 200 partout ailleurs) — convergées ici vers la borne la plus
// raisonnable. Les maxLength des formulaires clients consomment ces mêmes
// constantes.
export const LIMITES = {
  // Nom d'une personne ou d'une structure (client, ouvrier, organisation…).
  NOM: 200,
  // Adresse postale (dossier, organisation).
  ADRESSE: 200,
  // Téléphone (dossier, ouvrier) — large pour un double numéro annoté.
  TELEPHONE: 30,
  EMAIL: 200,
  SIRET: 40,
  // Identité étendue de l'organisation (compte-rendu imprimable).
  SITE_WEB: 200,
  ASSURANCE: 200,
  MENTIONS_LEGALES: 2000,
  // Motif d'absence (conducteur, ouvrier).
  MOTIF: 200,
  // Motif d'empêchement COMPOSÉ côté serveur (préset + précision) — la
  // précision du formulaire terrain est bornée en dessous (empechement.tsx).
  MOTIF_EMPECHEMENT: 300,
  // Motif d'annulation de dossier, même mécanique (préset + précision
  // composés côté serveur — annulation.tsx / dossiers/actions.ts).
  MOTIF_ANNULATION: 300,
  // Blocs de texte libre.
  INFOS_ACCES: 5000,
  NOTE: 2000,
  // Nom de fichier d'une pièce jointe (nom d'origine affiché).
  PIECE_JOINTE_NOM: 255,
  // Référence du devis Tolteck (n° court recopié pour retracer côté Tolteck).
  REF_DEVIS: 60,
} as const;

// Accords français des messages générés (« limitée », « sont limitées »,
// « requise »…). Défaut : masculin singulier.
type AccordChamp = {
  feminin?: boolean;
  pluriel?: boolean;
};

export type OptionsChampRequis = AccordChamp & {
  // Message « champ manquant » sur mesure quand le libellé dérivé ne suffit
  // pas (ex. trio « Nom du client, adresse et téléphone sont requis. »).
  messageRequis?: string;
};

// « 5000 » → « 5 000 » : séparateur de milliers à la française, à l'identique
// des messages historiques des actions.
function formatNombre(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function verbe(options: AccordChamp): string {
  return options.pluriel ? "sont" : "est";
}

// Champ texte d'un FormData, trimé ("" si absent ou non-texte : un File posté
// sur un champ texte ne devient jamais "[object File]").
export function texte(formData: FormData, nom: string): string {
  const valeur = formData.get(nom);
  return typeof valeur === "string" ? valeur.trim() : "";
}

// Champ texte OPTIONNEL borné : vide accepté, sinon longueur ≤ max.
// Message type : « Le motif est limité à 200 caractères. »
export function champOptionnel(
  valeur: string,
  max: number,
  libelle: string,
  options: AccordChamp = {},
): string | null {
  if (valeur.length <= max) return null;
  const limite = `limité${options.feminin ? "e" : ""}${options.pluriel ? "s" : ""}`;
  return `${libelle} ${verbe(options)} ${limite} à ${formatNombre(max)} caractères.`;
}

// Champ texte REQUIS borné : refuse le vide (valeur supposée déjà trimée —
// passer par texte()), puis applique la borne de champOptionnel.
// Messages types : « Le nom est requis. », « La note est limitée à 2 000
// caractères. »
export function champRequis(
  valeur: string,
  max: number,
  libelle: string,
  options: OptionsChampRequis = {},
): string | null {
  if (!valeur) {
    // « requis » est invariable au masculin pluriel.
    const requis = `requis${options.feminin ? (options.pluriel ? "es" : "e") : ""}`;
    return options.messageRequis ?? `${libelle} ${verbe(options)} ${requis}.`;
  }
  return champOptionnel(valeur, max, libelle, options);
}

// Validation LÉGÈRE de l'email : un format « x@y.z » suffit — pas de RFC 5322,
// le vrai contrôle est le mailto: qui échoue si l'adresse est fausse. La borne
// LIMITES.EMAIL est incluse : l'appelant n'a qu'un test à faire.
export function emailValide(email: string): boolean {
  return email.length <= LIMITES.EMAIL && /^\S+@\S+\.\S+$/.test(email);
}

// Garde LÉGÈRE du téléphone : borne + au moins un chiffre — pas de regex
// stricte qui rejetterait des numéros réels (espaces, points, tirets, +33,
// poste, double numéro…). Le nettoyage pour un lien tel: vit dans telHref
// (components/conducteur/bouton-appel.tsx).
export function telephoneValide(telephone: string): boolean {
  return telephone.length <= LIMITES.TELEPHONE && /\d/.test(telephone);
}

// LA normalisation de COMPARAISON des téléphones (recherche, détection de
// doublons) : retire espaces, points et tirets — « 06 12.34-56 78 » et
// « 0612345678 » deviennent identiques. Charset unique, à garder aligné avec
// sa traduction SQL côté colonne (regexp_replace(…, '[[:space:].-]', '', 'g')
// dans app/app/dossiers/actions.ts). Rien à voir avec telHref (lien tel:).
export function telephoneNormalise(v: string): string {
  return v.replace(/[\s.\-]/g, "");
}

// Plage d'absence en jours entiers : deux inputs date (YYYY-MM-DD) lus en
// minuit Paris (parseDateJour), fin ≥ début (bornes incluses). Même contrat
// que les parse* locaux des actions : les champs, ou { error }.
export function plageJours(
  formData: FormData,
  nomDebut = "dateDebut",
  nomFin = "dateFin",
): { dateDebut: Date; dateFin: Date } | { error: string } {
  const dateDebut = parseDateJour(texte(formData, nomDebut));
  const dateFin = parseDateJour(texte(formData, nomFin));
  if (!dateDebut || !dateFin) return { error: "Dates invalides." };
  if (dateFin < dateDebut) {
    return {
      error: "La date de fin doit être après (ou égale à) la date de début.",
    };
  }
  return { dateDebut, dateFin };
}
