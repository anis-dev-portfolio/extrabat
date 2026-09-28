import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { Role } from "@/lib/generated/prisma/enums";
import { enregistrerEvenement } from "@/lib/evenements";
import { ErreurMetier } from "@/lib/erreurs";
import { isBackOffice } from "@/lib/auth";
import { type CompteRenduPayload, validerCompteRendu } from "@/lib/metier";

// La visite n'était plus PLANIFIEE au moment d'appliquer le compte-rendu.
// Distinguée d'une ErreurMetier générique : côté conducteur, un REJEU qui
// tombe dessus est un succès (l'envoi précédent avait abouti mais la réponse
// s'était perdue) — il ne faut ni doublon ni fausse erreur.
export class CompteRenduDejaEnvoye extends ErreurMetier {
  constructor() {
    super("Le compte-rendu de cette visite a déjà été enregistré.");
  }
}

// Existe-t-il déjà une visite PLANIFIEE pour ce dossier ? Invariant partagé
// par planifierVisite (juge au submit, DANS une transaction), chargerCreneaux
// (pré-vérification côté lecture) et la page /planifier (redirect si déjà
// planifiée) — une SEULE forme de requête, systématiquement org-scopée, pour
// que les trois sites ne divergent jamais (l'un des trois anciens duplicatas
// ne l'était pas, se fiant au scoping déjà fait par son appelant — ce
// helper ferme cet écart pour de bon). Accepte `Prisma.TransactionClient`
// (le client `prisma` singleton le satisfait structurellement) : appelable
// aussi bien en lecture qu'à l'intérieur d'un `$transaction`.
export async function visiteDejaPlanifiee(
  client: Prisma.TransactionClient,
  organisationId: string,
  dossierId: string,
): Promise<boolean> {
  const count = await client.visite.count({
    where: { dossierId, statut: "PLANIFIEE", dossier: { organisationId } },
  });
  return count > 0;
}

// Include partagé pour la fiche visite conducteur (dossier + photos triées).
// classeHumiditeLe : contexte de contre-visite (« classé en attente humidité
// le … ») affiché sur la fiche terrain. piecesJointes : documents du dossier
// (devis, courriers…) que le conducteur consulte en visite — chemins d'objets
// du bucket privé, signés au rendu par la page. notes : le canal
// bureau → terrain (l'assistante y consigne les consignes) — bornées aux 20
// dernières pour garder la fiche mobile légère ; affichées sur la fiche
// visite, JAMAIS rendues sur le compte-rendu imprimable (document client).
export const visiteConducteurInclude = {
  dossier: {
    select: {
      id: true,
      nomClient: true,
      adresse: true,
      telephone: true,
      infosAcces: true,
      statut: true,
      classeHumiditeLe: true,
      piecesJointes: {
        orderBy: { createdAt: "desc" },
        select: { id: true, nom: true, taille: true, chemin: true },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          contenu: true,
          createdAt: true,
          auteur: { select: { nom: true } },
        },
      },
    },
  },
  photos: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.VisiteInclude;

export type VisiteConducteur = Prisma.VisiteGetPayload<{
  include: typeof visiteConducteurInclude;
}>;

// Charge une visite en garantissant qu'elle appartient bien au conducteur
// connecté ET à son organisation (double scoping tenant + assignation).
// Renvoie null si introuvable / non autorisée. Guard réutilisé par la fiche,
// les actions terrain et le compte-rendu imprimable.
export async function chargerVisiteConducteur(
  conducteurId: string,
  organisationId: string,
  visiteId: string,
): Promise<VisiteConducteur | null> {
  return prisma.visite.findFirst({
    where: {
      id: visiteId,
      conducteurId,
      dossier: { organisationId },
    },
    include: visiteConducteurInclude,
  });
}

// Champs de la dernière visite RÉALISÉE précédente montrés au conducteur en
// contre-visite (pourquoi il revient : taux relevé, pièces, résumé).
const visitePrecedenteSelect = {
  numero: true,
  dateRealisee: true,
  tauxHumidite: true,
  piecesEndommagees: true,
  resume: true,
} satisfies Prisma.VisiteSelect;

export type VisitePrecedente = Prisma.VisiteGetPayload<{
  select: typeof visitePrecedenteSelect;
}>;

// Charge la dernière visite RÉALISÉE du dossier qui précède `numero` (contexte
// de contre-visite pour la fiche terrain). Toujours scopée organisation ; à
// n'appeler qu'APRÈS chargerVisiteConducteur, qui a vérifié le double scoping
// (org + assignation) sur la visite COURANTE — la visite précédente du même
// dossier peut, elle, avoir été réalisée par un autre conducteur : c'est
// précisément l'historique à montrer. Renvoie null si numero <= 1 ou sans
// visite réalisée antérieure.
export async function chargerVisitePrecedente(
  organisationId: string,
  dossierId: string,
  numero: number,
): Promise<VisitePrecedente | null> {
  if (numero <= 1) return null;
  return prisma.visite.findFirst({
    where: {
      dossierId,
      dossier: { organisationId },
      statut: "REALISEE",
      numero: { lt: numero },
    },
    orderBy: { numero: "desc" },
    select: visitePrecedenteSelect,
  });
}

// Périmètre de LECTURE des visites selon le rôle — liste BLANCHE : le
// back-office (ASSISTANTE/ADMIN) voit toute visite de son organisation, un
// CONDUCTEUR uniquement celles qui lui sont assignées, tout autre rôle
// (OUVRIER…) rien du tout (null). Auparavant, tout rôle non-CONDUCTEUR
// tombait dans la branche back-office : un OUVRIER lisait n'importe quel
// compte-rendu de l'org (client, téléphone, photos) par son id.
export function perimetreLectureVisite(user: {
  id: string;
  role: Role;
  organisationId: string;
}): Prisma.VisiteWhereInput | null {
  if (isBackOffice(user.role)) {
    return { dossier: { organisationId: user.organisationId } };
  }
  if (user.role === "CONDUCTEUR") {
    return {
      dossier: { organisationId: user.organisationId },
      conducteurId: user.id,
    };
  }
  return null;
}

// Charge une visite en LECTURE (compte-rendu imprimable), dans le périmètre
// du rôle ci-dessus. Toujours scopé org — le gating par rôle vit ici (guard),
// pas dans l'UI. Renvoie null si introuvable/non autorisée.
export async function chargerVisitePourLecture(
  user: { id: string; role: Role; organisationId: string },
  visiteId: string,
): Promise<VisiteConducteur | null> {
  const perimetre = perimetreLectureVisite(user);
  if (!perimetre) return null;
  return prisma.visite.findFirst({
    where: { id: visiteId, ...perimetre },
    include: visiteConducteurInclude,
  });
}

export type { CompteRenduPayload };

// Parse + valide les champs du compte-rendu depuis un FormData. Renvoie soit la
// charge utile, soit un message d'erreur (convention ActionState). Partagé par
// la saisie back-office et le formulaire terrain du conducteur — les règles
// vivent dans validerCompteRendu (lib/metier.ts), que le téléphone applique
// aussi AVANT d'envoyer ou de mettre en file.
export function parseCompteRendu(
  formData: FormData,
): { payload: CompteRenduPayload } | { error: string } {
  return validerCompteRendu({
    pieces: formData.getAll("piece").map((v) => String(v)),
    taux: String(formData.get("tauxHumidite") ?? ""),
    jours: String(formData.get("joursReparationEstimes") ?? ""),
    resume: String(formData.get("resume") ?? ""),
    conclusion: String(formData.get("conclusion") ?? ""),
  });
}

// Transition métier partagée : une visite PLANIFIEE devient REALISEE, est
// horodatée côté serveur (dateRealisee, jamais saisie), et son dossier remonte
// en REALISE (réception). À exécuter DANS une transaction Prisma après avoir
// vérifié l'appartenance de la visite (org + rôle/assignation) par l'appelant.
// La mise à jour est CONDITIONNELLE au statut PLANIFIEE (updateMany) : deux
// envois concurrents (rejeu + envoi direct, saisie back-office simultanée…)
// ne peuvent pas appliquer le compte-rendu deux fois — le second lève
// CompteRenduDejaEnvoye et la transaction est annulée.
//
// `acteurId` (journal COMPTE_RENDU_RECU) : par défaut le conducteur de la
// visite (envoi terrain + rejeu offline via lib/envoi-compte-rendu.ts) ; la
// saisie back-office passe l'assistante connectée. L'événement n'est écrit
// QUE si la transition a réellement eu lieu (count > 0) — un rejeu offline
// idempotent lève CompteRenduDejaEnvoye AVANT toute écriture d'événement.
export async function appliquerCompteRendu(
  tx: Prisma.TransactionClient,
  visiteId: string,
  dossierId: string,
  payload: CompteRenduPayload,
  acteurId?: string,
): Promise<void> {
  const maj = await tx.visite.updateMany({
    where: { id: visiteId, statut: "PLANIFIEE" },
    data: {
      statut: "REALISEE",
      dateRealisee: new Date(),
      piecesEndommagees: payload.pieces,
      tauxHumidite: payload.taux,
      joursReparationEstimes: payload.jours,
      resume: payload.resume,
      conclusion: payload.conclusion,
    },
  });
  if (maj.count === 0) throw new CompteRenduDejaEnvoye();

  // Transition dossier CONDITIONNELLE (défense en profondeur) : dans tout
  // flux légitime, un dossier qui porte une visite PLANIFIEE est PLANIFIE à
  // cet instant. Si ce n'est plus le cas (visite résiduelle, état
  // concurrent), on annule tout plutôt que d'écraser un statut aval — sans
  // cette garde, un dossier TERMINE régresserait en REALISE.
  const dossierMaj = await tx.dossier.updateMany({
    where: { id: dossierId, statut: "PLANIFIE" },
    data: { statut: "REALISE" },
  });
  if (dossierMaj.count === 0) {
    // Message NEUTRE VIS-À-VIS DU RÔLE : appliquerCompteRendu est appelée à
    // la fois côté back-office (saisirResultat, accès à la fiche dossier) et
    // côté terrain (enregistrerCompteRendu, lib/envoi-compte-rendu.ts — un
    // CONDUCTEUR n'a PAS accès à /app/dossiers/[id]). Une instruction du
    // type « rouvrez la fiche dossier » remontée telle quelle à un
    // conducteur serait un cul-de-sac (rôle sans cette route).
    throw new ErreurMetier(
      "Le dossier a changé d'état entre-temps : compte-rendu non enregistré. Contactez le bureau avant de ressaisir.",
    );
  }

  // numero + conducteur relus DANS la transaction : ils nourrissent le journal
  // sans imposer de nouveau paramètre aux appelants existants.
  const visite = await tx.visite.findUniqueOrThrow({
    where: { id: visiteId },
    select: { numero: true, conducteurId: true },
  });
  await enregistrerEvenement(tx, {
    dossierId,
    type: "COMPTE_RENDU_RECU",
    acteurId: acteurId ?? visite.conducteurId,
    meta: { numero: visite.numero, tauxHumidite: payload.taux },
  });
}
