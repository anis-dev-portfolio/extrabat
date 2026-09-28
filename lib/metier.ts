import type {
  DossierStatut,
  Role,
  VisiteStatut,
} from "@/lib/generated/prisma/enums";

// Seuil d'humidité (%) au-delà duquel une contre-visite est nécessaire.
// DÉFAUT USINE : chaque organisation peut le régler (Organisation.seuilHumidite,
// paramètres → Règles de classement). Reste la valeur de repli des fonctions
// pures ci-dessous quand aucun seuil d'org n'est fourni.
export const SEUIL_HUMIDITE = 25;

// Bornes de saisie du seuil (%) et du délai de séchage (jours) — partagées
// serveur (validation de l'action) / client (min/max des inputs).
export const SEUIL_HUMIDITE_MIN = 0;
export const SEUIL_HUMIDITE_MAX = 100;
export const DELAI_SECHAGE_MIN = 1;
export const DELAI_SECHAGE_MAX = 365;

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  ASSISTANTE: "Assistante",
  CONDUCTEUR: "Conducteur",
  OUVRIER: "Ouvrier",
};

// Suggestions du sélecteur de pièces endommagées (puces + ajout libre).
// Le stockage reste un String[] : cette liste n'est qu'un confort de saisie.
export const PIECES_SUGGEREES: readonly string[] = [
  "Chambre",
  "Salle de bain",
  "Cuisine",
  "Salon",
  "Séjour",
  "Couloir",
  "Entrée",
  "WC",
  "Cave",
  "Garage",
  "Buanderie",
];

// Présets de motif d'empêchement terrain — consommé par le formulaire terrain
// (visites/[id]/empechement.tsx) ET la validation serveur
// (visites/[id]/actions.ts) — source unique.
export const MOTIFS_EMPECHEMENT: readonly string[] = [
  "Client absent",
  "Accès impossible",
  "Adresse erronée",
  "Autre",
];

// Cycle de vie complet du dossier, dans l'ordre (labels, filtres, vue liste).
export const DOSSIER_STATUTS: readonly DossierStatut[] = [
  "NOUVEAU",
  "PLANIFIE",
  "REALISE",
  "EN_ATTENTE_HUMIDITE",
  "PRET_POUR_TRAVAUX",
  "EN_CHANTIER",
  "TERMINE",
  "ANNULE",
];

// Colonnes du kanban = pipeline EXPERTISE uniquement. Un dossier pris en
// charge par le planning chantier (EN_CHANTIER/TERMINE) sort du kanban et
// vit dans la section Chantiers ; il reste trouvable via la vue liste.
export const DOSSIER_STATUTS_KANBAN: readonly DossierStatut[] = [
  "NOUVEAU",
  "PLANIFIE",
  "REALISE",
  "EN_ATTENTE_HUMIDITE",
  "PRET_POUR_TRAVAUX",
];

// Un dossier passé aux travaux (chantier en cours ou terminé) : le cycle
// expertise est clos, plus de visite à planifier. Prédicat + message partagés
// par les trois sites qui gardent la planification — planifierVisite (juge au
// submit), chargerCreneaux (lecture des créneaux) et la page /planifier — pour
// qu'un futur statut de clôture ne soit oublié nulle part.
export function dossierEnTravaux(statut: DossierStatut): boolean {
  return statut === "EN_CHANTIER" || statut === "TERMINE";
}

export const MESSAGE_DOSSIER_EN_TRAVAUX =
  "Ce dossier est passé aux travaux : plus de visite d'expertise à planifier.";

// Statuts depuis lesquels un dossier peut être annulé : le cycle EXPERTISE
// uniquement. Jamais EN_CHANTIER/TERMINE — protège le planning chantier et
// les Finances (marquerPaye exige TERMINE, donc aucun annulé n'a payeLe).
export const DOSSIER_STATUTS_ANNULABLES: readonly DossierStatut[] = [
  "NOUVEAU",
  "PLANIFIE",
  "REALISE",
  "EN_ATTENTE_HUMIDITE",
  "PRET_POUR_TRAVAUX",
];

export function dossierAnnulable(statut: DossierStatut): boolean {
  return DOSSIER_STATUTS_ANNULABLES.includes(statut);
}

// Message des gardes de planification sur un dossier annulé (mêmes trois
// sites que MESSAGE_DOSSIER_EN_TRAVAUX — voir dossierEnTravaux ci-dessus).
export const MESSAGE_DOSSIER_ANNULE =
  "Ce dossier est annulé. Reprenez-le d'abord.";

// UNE seule visite PLANIFIEE à la fois par dossier (mêmes trois sites de
// garde que MESSAGE_DOSSIER_EN_TRAVAUX). Sans cette règle, une 2ᵉ visite
// planifiée résiduelle, réalisée après coup, ferait régresser un dossier déjà
// passé aux travaux (appliquerCompteRendu remonte le dossier en REALISE).
export const MESSAGE_VISITE_DEJA_PLANIFIEE =
  "Une visite est déjà planifiée pour ce dossier : réalisez-la, replanifiez-la ou annulez-la d'abord.";

// Présets de motif d'annulation de dossier — consommé par le formulaire
// (dossiers/[id]/annulation.tsx) ET la validation serveur
// (dossiers/actions.ts) — source unique, comme MOTIFS_EMPECHEMENT.
export const MOTIFS_ANNULATION: readonly string[] = [
  "Annulé par l'apporteur d'affaires",
  "Client injoignable",
  "Client a refusé",
  "Doublon",
  "Autre",
];

export const DOSSIER_STATUT_LABELS: Record<DossierStatut, string> = {
  NOUVEAU: "Nouveau",
  PLANIFIE: "Planifié",
  REALISE: "Visite réalisée",
  EN_ATTENTE_HUMIDITE: "En attente (humidité)",
  PRET_POUR_TRAVAUX: "Prêt pour travaux",
  EN_CHANTIER: "En chantier",
  TERMINE: "Terminé",
  ANNULE: "Annulé",
};

// Classement auto-suggéré après une visite selon le taux d'humidité relevé.
// > seuil -> il faut attendre le séchage (contre-visite) ; sinon prêt pour
// travaux. `seuil` par défaut = constante usine — un appelant qui a
// l'organisation passe Organisation.seuilHumidite pour honorer son réglage.
export function suggestStatutApresVisite(
  tauxHumidite: number | null,
  seuil: number = SEUIL_HUMIDITE,
): Extract<DossierStatut, "EN_ATTENTE_HUMIDITE" | "PRET_POUR_TRAVAUX"> {
  if (tauxHumidite !== null && tauxHumidite > seuil) {
    return "EN_ATTENTE_HUMIDITE";
  }
  return "PRET_POUR_TRAVAUX";
}

// Délai de séchage conseillé (jours) entre le classement EN_ATTENTE_HUMIDITE
// et la contre-visite. Conseil métier, jamais bloquant. DÉFAUT USINE :
// personnalisable par organisation (Organisation.delaiSechageJours).
export const DELAI_SECHAGE_JOURS = 30;

// Date à partir de laquelle la contre-visite est conseillée, null si le
// dossier n'est pas en attente humidité. Offset en ms (pas en jours civils
// Paris) : le même seuil doit être exprimable dans un `where` Prisma (badge
// « À traiter » du shell) — l'écart d'1 h aux changements d'heure est sans
// enjeu sur un délai d'un mois. `delaiJours` par défaut = constante usine.
export function dateContreVisiteConseillee(
  dossier: {
    statut: DossierStatut;
    classeHumiditeLe: Date | null;
  },
  delaiJours: number = DELAI_SECHAGE_JOURS,
): Date | null {
  if (dossier.statut !== "EN_ATTENTE_HUMIDITE" || !dossier.classeHumiditeLe) {
    return null;
  }
  return new Date(
    dossier.classeHumiditeLe.getTime() + delaiJours * 86_400_000,
  );
}

// Un dossier EN_ATTENTE_HUMIDITE dont le délai de séchage est écoulé sans
// contre-visite planifiée à venir doit être re-planifié (signal visuel).
// Délègue à doitEtreReplanifieDepuisCount — la règle vit à UN seul endroit.
export function doitEtreReplanifie(
  dossier: { statut: DossierStatut; classeHumiditeLe: Date | null },
  visites: readonly { statut: VisiteStatut; datePlanifiee: Date }[],
  maintenant: Date = new Date(),
  delaiJours: number = DELAI_SECHAGE_JOURS,
): boolean {
  const nbAVenir = visites.filter(
    (v) => v.statut === "PLANIFIEE" && v.datePlanifiee > maintenant,
  ).length;
  return doitEtreReplanifieDepuisCount(dossier, nbAVenir, maintenant, delaiJours);
}

// Même règle métier que doitEtreReplanifie(), pour les vues qui ne chargent
// pas la liste des visites : l'appelant fournit le NOMBRE de visites
// PLANIFIEE à venir — typiquement un `_count` Prisma filtré
// `{ statut: "PLANIFIEE", datePlanifiee: { gt: maintenant } }`, calculé avec
// le MÊME `maintenant` que celui passé ici (ex. resumeDossier,
// app/app/dossiers/page.tsx). whereAReplanifier (lib/a-traiter.ts) est la
// traduction SQL de ce même seuil — garder les trois alignés.
export function doitEtreReplanifieDepuisCount(
  dossier: { statut: DossierStatut; classeHumiditeLe: Date | null },
  nbVisitesPlanifieesAVenir: number,
  maintenant: Date = new Date(),
  delaiJours: number = DELAI_SECHAGE_JOURS,
): boolean {
  const echeance = dateContreVisiteConseillee(dossier, delaiJours);
  if (!echeance || maintenant.getTime() < echeance.getTime()) return false;
  return nbVisitesPlanifieesAVenir === 0;
}

// Statut cohérent d'un dossier après ANNULATION d'une visite planifiée,
// re-dérivé des visites RESTANTES : s'il reste une PLANIFIEE → PLANIFIE ;
// sinon la dernière REALISEE (numéro le plus haut) redonne le classement
// suggéré par son taux ; sinon le dossier revient à NOUVEAU.
export function statutApresAnnulation(
  visitesRestantes: readonly {
    statut: VisiteStatut;
    numero: number;
    tauxHumidite: number | null;
  }[],
  seuil: number = SEUIL_HUMIDITE,
): DossierStatut {
  if (visitesRestantes.some((v) => v.statut === "PLANIFIEE")) return "PLANIFIE";
  const derniereRealisee = [...visitesRestantes]
    .filter((v) => v.statut === "REALISEE")
    .sort((a, b) => b.numero - a.numero)[0];
  if (derniereRealisee) {
    return suggestStatutApresVisite(derniereRealisee.tauxHumidite, seuil);
  }
  return "NOUVEAU";
}

// --- Compte-rendu de visite : bornes + validation PURES ----------------------
// Partagées par le serveur (parseCompteRendu, lib/visites.ts) et le formulaire
// terrain : le téléphone refuse AVANT la mise en file hors-ligne ce que le
// serveur refuserait — sinon le refus n'apparaît qu'au rejeu, des heures plus
// tard, loin du chantier.
export const MAX_PHOTOS_PAR_VISITE = 20;
export const LIMITES_COMPTE_RENDU = {
  PIECES: 30,
  PIECE_LONGUEUR: 100,
  TEXTE: 5000,
  // Borne haute : un entier géant dépasserait la colonne Int (erreur Prisma
  // opaque au lieu d'un message clair).
  JOURS: 999,
} as const;

// Charge utile d'un compte-rendu de visite (champs saisis par l'expert).
export type CompteRenduPayload = {
  pieces: string[];
  taux: number | null;
  jours: number | null;
  resume: string | null;
  conclusion: string | null;
};

function normaliserRetours(texte: string): string {
  return texte.replace(/\r\n?/g, "\n");
}

export function validerCompteRendu(champs: {
  pieces: string[];
  taux: string;
  jours: string;
  resume: string;
  conclusion: string;
}): { payload: CompteRenduPayload } | { error: string } {
  const pieces = champs.pieces.map((p) => p.trim()).filter(Boolean);
  if (pieces.length > LIMITES_COMPTE_RENDU.PIECES) {
    return { error: `${LIMITES_COMPTE_RENDU.PIECES} pièces maximum par compte-rendu.` };
  }
  if (pieces.some((p) => p.length > LIMITES_COMPTE_RENDU.PIECE_LONGUEUR)) {
    return {
      error: `Le nom d'une pièce est limité à ${LIMITES_COMPTE_RENDU.PIECE_LONGUEUR} caractères.`,
    };
  }

  const tauxStr = champs.taux.trim();
  const joursStr = champs.jours.trim();
  // Retours ligne normalisés (\r\n → \n) AVANT de mesurer : l'envoi d'un
  // formulaire peut les convertir en \r\n, et un texte proche de la limite
  // accepté par le téléphone était alors refusé par le serveur — au rejeu.
  const resume = normaliserRetours(champs.resume).trim();
  const conclusion = normaliserRetours(champs.conclusion).trim();
  if (
    resume.length > LIMITES_COMPTE_RENDU.TEXTE ||
    conclusion.length > LIMITES_COMPTE_RENDU.TEXTE
  ) {
    return {
      error: "Résumé et conclusion sont limités à 5 000 caractères.",
    };
  }

  let taux: number | null = null;
  if (tauxStr !== "") {
    taux = Number(tauxStr);
    if (!Number.isInteger(taux) || taux < 0 || taux > 100) {
      return { error: "Le taux d'humidité doit être un entier entre 0 et 100." };
    }
  }

  let jours: number | null = null;
  if (joursStr !== "") {
    jours = Number(joursStr);
    if (
      !Number.isInteger(jours) ||
      jours < 0 ||
      jours > LIMITES_COMPTE_RENDU.JOURS
    ) {
      return {
        error: `Les jours de réparation estimés doivent être un entier entre 0 et ${LIMITES_COMPTE_RENDU.JOURS}.`,
      };
    }
  }

  return {
    payload: {
      pieces,
      taux,
      jours,
      resume: resume || null,
      conclusion: conclusion || null,
    },
  };
}

// Ordinal français court : 1 -> "1ère", 2 -> "2ème", 3 -> "3ème"…
function ordinalFr(n: number): string {
  return n === 1 ? "1ère" : `${n}ème`;
}

// Label métier dérivé du numéro de visite (jamais stocké en base).
// numero 1     -> "Première visite d'expert"
// numero n>1   -> "(n-1)ᵉ contre-visite pour taux d'humidité"
export function visiteLabel(numero: number): string {
  if (numero <= 1) return "Première visite d'expert";
  return `${ordinalFr(numero - 1)} contre-visite pour taux d'humidité`;
}
