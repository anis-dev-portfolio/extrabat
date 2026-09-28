import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { DELAI_SECHAGE_JOURS, dateContreVisiteConseillee } from "@/lib/metier";
import { debutJourLocal } from "@/lib/planning";
import { dossiersBadgesTag } from "@/lib/cache-tags";

// File « À traiter » du back-office — quatre populations DISJOINTES (un
// dossier ne compte qu'une fois), partagées entre le badge du shell
// (comptage caché) et la page /app/a-traiter (listes détaillées) :
// 1. dossiers REALISE : compte-rendu envoyé, classement à confirmer ;
// 2. dossiers EN_ATTENTE_HUMIDITE dont le délai de séchage est écoulé SANS
//    contre-visite planifiée à venir NI empêchement signalé (à re-planifier).
//    Traduction SQL du même seuil que doitEtreReplanifie() /
//    doitEtreReplanifieDepuisCount() (lib/metier.ts) — un classeHumiditeLe
//    null ne matche pas `lte`, cohérent avec les helpers ;
// 3. dossiers dont le conducteur a signalé un EMPÊCHEMENT (empechementLe non
//    null — la visite a été retirée du planning, le bureau doit re-planifier ;
//    le champ est nullé par la prochaine planification) ;
// 4. chantiers À CLÔTURER : dateFin écoulée sans marquage « terminé » (dossier
//    EN_CHANTIER, donc disjoint des trois autres qui ont d'autres statuts). Le
//    back-office doit marquer terminé ou prolonger. Compté via Chantier — d'où
//    l'invalidation du badge depuis les actions chantier (revaliderChantiers).
// Ces quatre prédicats sont la SOURCE UNIQUE des populations « À traiter » :
// partagés par le comptage du badge, la page /app/a-traiter ET la page
// Statistiques (lib/statistiques-data.ts) — exportés pour qu'aucune vue ne
// re-dérive le périmètre et ne dérive du badge.
export function whereAClasser(organisationId: string): Prisma.DossierWhereInput {
  return { organisationId, statut: "REALISE" };
}

// Chantier dont la plage est écoulée (dateFin strictement avant minuit Paris
// du jour courant = etatChantier → A_CLOTURER) sans marquage « terminé ».
export function whereAClouturer(
  organisationId: string,
  maintenant: Date,
): Prisma.ChantierWhereInput {
  return {
    organisationId,
    termineLe: null,
    dateFin: { lt: debutJourLocal(maintenant) },
  };
}

export function whereEmpeches(
  organisationId: string,
): Prisma.DossierWhereInput {
  // Un dossier ANNULE conserve son empêchement (retrouvé tel quel à la
  // reprise) mais sort du backlog : rien à re-planifier tant qu'il est annulé.
  return {
    organisationId,
    empechementLe: { not: null },
    statut: { not: "ANNULE" },
  };
}

export function whereAReplanifier(
  organisationId: string,
  maintenant: Date,
  delaiJours: number,
): Prisma.DossierWhereInput {
  return {
    organisationId,
    statut: "EN_ATTENTE_HUMIDITE",
    // Populations disjointes — un dossier ne compte qu'une fois : un dossier
    // avec empêchement signalé relève de whereEmpeches (le signal le plus
    // précis), pas de cette liste. Badge et page héritent tous deux de cette
    // exclusion puisque les `where` sont partagés.
    empechementLe: null,
    // `lte` : même inclusion de borne que doitEtreReplanifieDepuisCount
    // (lib/metier — maintenant >= échéance ⟺ classeHumiditeLe <= maintenant
    // − délai). `delaiJours` = Organisation.delaiSechageJours (défaut usine 30).
    classeHumiditeLe: {
      lte: new Date(maintenant.getTime() - delaiJours * 86_400_000),
    },
    visites: {
      none: { statut: "PLANIFIEE", datePlanifiee: { gt: maintenant } },
    },
  };
}

// Comptage du badge « À traiter » du shell (app/app/layout.tsx). Mis en cache
// par organisation (tag + filet 60 s) : recalculé immédiatement par
// revalidateTag() à chaque mutation qui peut le faire bouger —
// app/app/dossiers/actions.ts, lib/envoi-compte-rendu.ts (l'envoi de
// compte-rendu passe par les route handlers /api/visites/[id]/*) et
// app/app/visites/[id]/actions.ts (empêchement) ; le TTL n'est qu'un filet en
// cas d'oubli — badge non transactionnel.
export async function compterATraiter(
  organisationId: string,
  delaiJours: number = DELAI_SECHAGE_JOURS,
): Promise<number> {
  const lire = unstable_cache(
    async () => {
      const maintenant = new Date();
      const [aClasser, aReplanifier, empeches, aClouturer] = await Promise.all([
        prisma.dossier.count({ where: whereAClasser(organisationId) }),
        prisma.dossier.count({
          where: whereAReplanifier(organisationId, maintenant, delaiJours),
        }),
        prisma.dossier.count({ where: whereEmpeches(organisationId) }),
        prisma.chantier.count({
          where: whereAClouturer(organisationId, maintenant),
        }),
      ]);
      return aClasser + aReplanifier + empeches + aClouturer;
    },
    ["dossiers-badges", organisationId],
    { revalidate: 60, tags: [dossiersBadgesTag(organisationId)] },
  );
  return lire();
}

// Dossier REALISE avec sa dernière visite réalisée (numéro le plus haut) :
// taux, date, conducteur — ce qu'il faut pour décider du classement.
const selectAClasser = {
  id: true,
  nomClient: true,
  adresse: true,
  visites: {
    where: { statut: "REALISEE" },
    orderBy: { numero: "desc" },
    take: 1,
    select: {
      numero: true,
      tauxHumidite: true,
      dateRealisee: true,
      conducteur: { select: { nom: true } },
    },
  },
} satisfies Prisma.DossierSelect;

export type DossierAClasser = Prisma.DossierGetPayload<{
  select: typeof selectAClasser;
}>;

export type DossierAReplanifier = {
  id: string;
  nomClient: string;
  adresse: string;
  classeHumiditeLe: Date;
  echeanceConseillee: Date;
};

export type DossierEmpeche = {
  id: string;
  nomClient: string;
  adresse: string;
  empechementLe: Date;
  empechementMotif: string | null;
};

export type ChantierAClouturer = {
  id: string;
  dossierId: string;
  nomClient: string;
  adresse: string;
  dateDebut: Date;
  dateFin: Date;
};

// Borne des listes détaillées de la page — filet contre une file qui aurait
// dérivé (des centaines de dossiers non traités) : la page reste légère, le
// badge continue de compter le vrai total.
const A_TRAITER_MAX = 100;

// Chargement détaillé de la page /app/a-traiter — volontairement NON caché
// (la page doit refléter l'état réel au chargement), mêmes `where` que le
// comptage pour que la page liste exactement ce que le badge compte.
export async function chargerATraiter(
  organisationId: string,
  delaiJours: number = DELAI_SECHAGE_JOURS,
): Promise<{
  aClasser: DossierAClasser[];
  aReplanifier: DossierAReplanifier[];
  empeches: DossierEmpeche[];
  aClouturer: ChantierAClouturer[];
  maintenant: Date;
}> {
  const maintenant = new Date();
  const [aClasser, brutsAReplanifier, brutsEmpeches, brutsAClouturer] =
    await Promise.all([
    prisma.dossier.findMany({
      where: whereAClasser(organisationId),
      // Les plus anciens d'abord : premier arrivé, premier classé.
      orderBy: { updatedAt: "asc" },
      take: A_TRAITER_MAX,
      select: selectAClasser,
    }),
    prisma.dossier.findMany({
      where: whereAReplanifier(organisationId, maintenant, delaiJours),
      // Les plus en retard d'abord.
      orderBy: { classeHumiditeLe: "asc" },
      take: A_TRAITER_MAX,
      select: {
        id: true,
        nomClient: true,
        adresse: true,
        statut: true,
        classeHumiditeLe: true,
      },
    }),
    prisma.dossier.findMany({
      where: whereEmpeches(organisationId),
      // Les empêchements les plus anciens d'abord (les plus urgents).
      orderBy: { empechementLe: "asc" },
      take: A_TRAITER_MAX,
      select: {
        id: true,
        nomClient: true,
        adresse: true,
        empechementLe: true,
        empechementMotif: true,
      },
    }),
    prisma.chantier.findMany({
      where: whereAClouturer(organisationId, maintenant),
      // Les plus en retard de clôture d'abord.
      orderBy: { dateFin: "asc" },
      take: A_TRAITER_MAX,
      select: {
        id: true,
        dateDebut: true,
        dateFin: true,
        dossier: { select: { id: true, nomClient: true, adresse: true } },
      },
    }),
  ]);

  const aReplanifier = brutsAReplanifier.flatMap(
    (dossier): DossierAReplanifier[] => {
      const echeance = dateContreVisiteConseillee(dossier, delaiJours);
      // Le where garantit statut EN_ATTENTE_HUMIDITE + classeHumiditeLe non
      // nul — filet purement défensif pour le narrowing TypeScript.
      if (!echeance || !dossier.classeHumiditeLe) return [];
      return [
        {
          id: dossier.id,
          nomClient: dossier.nomClient,
          adresse: dossier.adresse,
          classeHumiditeLe: dossier.classeHumiditeLe,
          echeanceConseillee: echeance,
        },
      ];
    },
  );

  const empeches = brutsEmpeches.flatMap((dossier): DossierEmpeche[] => {
    // Le where garantit empechementLe non null — filet purement défensif
    // pour le narrowing TypeScript.
    if (!dossier.empechementLe) return [];
    return [
      {
        id: dossier.id,
        nomClient: dossier.nomClient,
        adresse: dossier.adresse,
        empechementLe: dossier.empechementLe,
        empechementMotif: dossier.empechementMotif,
      },
    ];
  });

  const aClouturer = brutsAClouturer.map(
    (chantier): ChantierAClouturer => ({
      id: chantier.id,
      dossierId: chantier.dossier.id,
      nomClient: chantier.dossier.nomClient,
      adresse: chantier.dossier.adresse,
      dateDebut: chantier.dateDebut,
      dateFin: chantier.dateFin,
    }),
  );

  return { aClasser, aReplanifier, empeches, aClouturer, maintenant };
}
