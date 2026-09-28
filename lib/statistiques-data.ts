import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { DossierStatut } from "@/lib/generated/prisma/enums";
import { statsTag } from "@/lib/cache-tags";
import { DOSSIER_STATUTS } from "@/lib/metier";
import { debutJourLocal } from "@/lib/planning";
import {
  whereAClasser,
  whereAClouturer,
  whereAReplanifier,
  whereEmpeches,
} from "@/lib/a-traiter";
import {
  bornePeriode,
  bucketsHumidite,
  indexBucketHumidite,
  moisEntre,
  tauxPourcent,
  type MoisAxe,
  type Periode,
  type TonHumidite,
} from "@/lib/statistiques";

// Données de la page Statistiques (scopées organisationId) — un pilotage
// OPINIONÉ : où ça rame (rouge/ambre), où ça va nickel (vert). Miroir de
// lib/finances-data.ts : un seul Promise.all d'aggregate/groupBy/count. Les
// regroupements mensuels et les moyennes de délais sont calculés EN SQL
// ($queryRaw date_trunc-like via to_char, scopé org, paramétré) : aucune ligne
// chargée en JS, donc aucun plafond — ça scale avec l'ancienneté du tenant.
// Aucune métrique dérivée du journal EvenementDossier (incomplet pour les
// vieux dossiers) : tout vient de colonnes fiables.

// ── Types ────────────────────────────────────────────────────────────────────

export type BarreMois = { cle: string; label: string; valeur: number };

export type LigneConducteur = {
  id: string;
  nom: string;
  visitesRealisees: number;
  heures: number;
  aVenir: number;
};

export type BarreHumidite = { label: string; compte: number; ton: TonHumidite };

export type Statistiques = {
  periode: Periode;
  borneLabel: string; // « 12 derniers mois », « Depuis le début »…
  maintenant: Date;
  seuilHumidite: number;
  moisPlafonnes: boolean; // axe mensuel tronqué (org très ancienne)

  // ── À ce jour (snapshot) ──
  backlog: {
    aClasser: number;
    aReplanifier: number;
    empeches: number;
    aClouturer: number;
    total: number;
  };
  pipeline: { statut: DossierStatut; compte: number }[];
  pipelineTotal: number;
  geo: { departement: string; compte: number }[];

  // ── Argent ──
  argent: {
    encaisseParMois: BarreMois[]; // centimes (flux)
    encaissePeriode: number; // centimes (flux)
    nbEncaisse: number;
    aEncaisser: number; // centimes (snapshot)
    nbAEncaisser: number;
    carnet: number; // centimes (snapshot)
    nbCarnet: number;
    franchiseCumulee: number; // centimes (flux)
    delaiEncaissementMoyen: number | null; // jours, terminé → payé (flux)
  };

  // ── Chantiers ──
  chantiers: {
    aVenir: number; // snapshot
    enCours: number; // snapshot
    aClouturer: number; // snapshot (= backlog.aClouturer)
    terminesPeriode: number; // flux
    dureeMoyenneJours: number | null; // flux
  };

  // ── Activité expertise ──
  expertise: {
    nouveauxParMois: BarreMois[]; // flux
    nouveauxPeriode: number; // flux
    visitesRealiseesPeriode: number; // flux
    parConducteur: LigneConducteur[]; // réalisées = flux ; à venir = snapshot
    tauxContreVisite: number | null; // % (flux)
    delaiPremiereVisiteMoyen: number | null; // jours, création → 1re visite (flux)
  };

  // ── Humidité ──
  humidite: {
    nbReleves: number; // flux
    moyen: number | null;
    min: number | null;
    max: number | null;
    joursReparationMoyen: number | null;
    pourcentSuperieurSeuil: number | null;
    histogramme: BarreHumidite[];
  };
};

// ── Loader ───────────────────────────────────────────────────────────────────

// Cache serveur par TENANT : la clé inclut organisationId (invariant
// multi-tenant, comme le badge « À traiter ») + les réglages org qui influent
// sur le calcul + la période. Invalidé par revalidateTag(statsTag) aux mêmes
// mutations que dossiersBadgesTag, aux mutations financières et aux réglages ;
// filet revalidate 300 s (page de pilotage, 5 min de fraîcheur acceptable).
// Les 24 requêtes ne partent donc plus à chaque affichage.
export async function chargerStatistiques(
  organisationId: string,
  org: { seuilHumidite: number; delaiSechageJours: number },
  periode: Periode,
): Promise<Statistiques> {
  const lire = unstable_cache(
    () => calculerStatistiques(organisationId, org, periode),
    [
      "statistiques",
      organisationId,
      String(org.seuilHumidite),
      String(org.delaiSechageJours),
      periode,
    ],
    { revalidate: 300, tags: [statsTag(organisationId)] },
  );
  const stats = await lire();
  // unstable_cache sérialise en JSON : sur cache chaud, `maintenant` revient
  // en chaîne ISO — ré-hydratation pour honorer le type (seul champ Date).
  return { ...stats, maintenant: new Date(stats.maintenant) };
}

async function calculerStatistiques(
  organisationId: string,
  org: { seuilHumidite: number; delaiSechageJours: number },
  periode: Periode,
): Promise<Statistiques> {
  const maintenant = new Date();
  const borne = bornePeriode(periode, maintenant);
  const debut = borne.debut; // Date | null (null = depuis le début)
  const debutJour = debutJourLocal(maintenant);

  // Filtre « depuis la borne » d'un champ date NULLABLE (payeLe, dateRealisee,
  // termineLe) : exige non-null, et ≥ borne si la période en a une.
  const depuisNonNull: Prisma.DateTimeNullableFilter = debut
    ? { not: null, gte: debut }
    : { not: null };
  // Filtre relationnel de scoping des visites (Visite → dossier de l'org).
  const dossierOrg = { organisationId };

  // ── Fragments SQL des requêtes brutes (regroupements mensuels + délais) ──
  // Prisma stocke les DateTime en TIMESTAMP(3) NAÏF contenant l'instant UTC :
  // la clé de mois Paris s'obtient par le double AT TIME ZONE (naïf → UTC
  // qualifié → heure locale Paris), même sémantique que cleMois() côté JS.
  // `colonne` est toujours un identifiant écrit en dur ici (jamais une entrée
  // utilisateur) ; les valeurs, elles, passent par des paramètres liés.
  const moisParis = (colonne: string) =>
    Prisma.raw(
      `to_char(${colonne} AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris', 'YYYY-MM')`,
    );
  // Borne basse de période (vide si « depuis le début »). L'ISO passé en
  // timestamptz puis ramené en UTC naïf est insensible au fuseau du serveur.
  const borneSql = (colonne: string) =>
    debut
      ? Prisma.sql`AND ${Prisma.raw(colonne)} >= (${debut.toISOString()}::timestamptz AT TIME ZONE 'UTC')`
      : Prisma.empty;

  const [
    aClasser,
    aReplanifier,
    empeches,
    aClouturer,
    pipelineBrut,
    aEncaisserAgg,
    carnetAgg,
    encaisseParMoisRows,
    delaiEncaissementRows,
    chantiersAVenir,
    chantiersEnCours,
    chantiersTerminesRows,
    nouveauxParMoisRows,
    premierDossierAgg,
    visitesRealiseesCount,
    contreVisitesCount,
    realiseesParConducteur,
    aVenirParConducteur,
    conducteurs,
    delaiPremiereVisiteRows,
    humiditeParTaux,
    joursReparationAgg,
    geoBrut,
  ] = await Promise.all([
    // ── Backlog (snapshot) — mêmes prédicats que le badge « À traiter » ──
    prisma.dossier.count({ where: whereAClasser(organisationId) }),
    prisma.dossier.count({
      where: whereAReplanifier(organisationId, maintenant, org.delaiSechageJours),
    }),
    prisma.dossier.count({ where: whereEmpeches(organisationId) }),
    prisma.chantier.count({
      where: whereAClouturer(organisationId, maintenant),
    }),

    // ── Pipeline (snapshot) : dossiers par statut ──
    prisma.dossier.groupBy({
      by: ["statut"],
      where: { organisationId },
      _count: true,
    }),

    // ── Argent ──
    // À encaisser (snapshot) : terminés devisés non réglés.
    prisma.dossier.aggregate({
      where: {
        organisationId,
        statut: "TERMINE",
        payeLe: null,
        montantDevis: { not: null },
      },
      _sum: { montantDevis: true },
      _count: true,
    }),
    // Carnet de commandes (snapshot) : chantiers en cours devisés.
    prisma.dossier.aggregate({
      where: { organisationId, statut: "EN_CHANTIER", montantDevis: { not: null } },
      _sum: { montantDevis: true },
      _count: true,
    }),
    // Encaissé sur la période (flux), groupé par mois Paris EN SQL — les
    // totaux exacts (somme, franchise, compte) sont dérivés des mêmes groupes,
    // plus de findMany plafonné ni d'aggregate redondant.
    prisma.$queryRaw<{ cle: string; total: number; franchise: number; nb: number }[]>`
      SELECT ${moisParis(`d."payeLe"`)} AS cle,
             SUM(d."montantDevis")::float8 AS total,
             SUM(COALESCE(d."franchise", 0))::float8 AS franchise,
             COUNT(*)::int AS nb
      FROM "Dossier" d
      WHERE d."organisationId" = ${organisationId}
        AND d."montantDevis" IS NOT NULL
        AND d."payeLe" IS NOT NULL
        ${borneSql(`d."payeLe"`)}
      GROUP BY 1
    `,
    // Délai moyen terminé → payé (jours fractionnaires, diffs négatives
    // écartées comme avant — anomalie de données).
    prisma.$queryRaw<{ moyenne: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (d."payeLe" - c."termineLe")) / 86400.0)::float8 AS moyenne
      FROM "Dossier" d
      JOIN "Chantier" c ON c."dossierId" = d."id"
      WHERE d."organisationId" = ${organisationId}
        AND d."montantDevis" IS NOT NULL
        AND d."payeLe" IS NOT NULL
        ${borneSql(`d."payeLe"`)}
        AND c."termineLe" IS NOT NULL
        AND d."payeLe" >= c."termineLe"
    `,

    // ── Chantiers (snapshot + flux) ──
    // À venir (snapshot) : non terminé, début dans le futur.
    prisma.chantier.count({
      where: { organisationId, termineLe: null, dateDebut: { gt: maintenant } },
    }),
    // En cours (snapshot) : non terminé, commencé, pas encore à clôturer.
    prisma.chantier.count({
      where: {
        organisationId,
        termineLe: null,
        dateDebut: { lte: maintenant },
        dateFin: { gte: debutJour },
      },
    }),
    // Terminés sur la période (flux) : compte + durée moyenne des travaux EN
    // SQL. La durée réplique dureeEnJours (round des jours + 1, bornes à
    // minuit Paris dont l'arrondi absorbe les heures d'été/hiver).
    prisma.$queryRaw<{ nb: number; dureeMoyenne: number | null }[]>`
      SELECT COUNT(*)::int AS nb,
             AVG(ROUND(EXTRACT(EPOCH FROM (c."dateFin" - c."dateDebut")) / 86400.0) + 1)::float8 AS "dureeMoyenne"
      FROM "Chantier" c
      WHERE c."organisationId" = ${organisationId}
        AND c."termineLe" IS NOT NULL
        ${borneSql(`c."termineLe"`)}
    `,

    // ── Expertise ──
    // Nouveaux dossiers sur la période (flux), groupés par mois Paris EN SQL —
    // le comptage exact est la somme des groupes.
    prisma.$queryRaw<{ cle: string; nb: number }[]>`
      SELECT ${moisParis(`d."createdAt"`)} AS cle, COUNT(*)::int AS nb
      FROM "Dossier" d
      WHERE d."organisationId" = ${organisationId}
        ${borneSql(`d."createdAt"`)}
      GROUP BY 1
    `,
    // Plus ancien dossier de l'org — sert de borne basse de l'axe mensuel quand
    // la période est « depuis le début ».
    prisma.dossier.aggregate({
      where: { organisationId },
      _min: { createdAt: true },
    }),
    // Visites réalisées sur la période (flux).
    prisma.visite.count({
      where: {
        dossier: dossierOrg,
        statut: "REALISEE",
        dateRealisee: depuisNonNull,
      },
    }),
    // Contre-visites réalisées sur la période (numero > 1, flux).
    prisma.visite.count({
      where: {
        dossier: dossierOrg,
        statut: "REALISEE",
        numero: { gt: 1 },
        dateRealisee: depuisNonNull,
      },
    }),
    // Charge par conducteur — réalisées sur la période (flux) : nb + minutes.
    prisma.visite.groupBy({
      by: ["conducteurId"],
      where: {
        dossier: dossierOrg,
        statut: "REALISEE",
        dateRealisee: depuisNonNull,
      },
      _count: true,
      _sum: { dureeMinutes: true },
    }),
    // Charge par conducteur — à venir (snapshot) : visites planifiées futures.
    prisma.visite.groupBy({
      by: ["conducteurId"],
      where: {
        dossier: dossierOrg,
        statut: "PLANIFIEE",
        datePlanifiee: { gt: maintenant },
      },
      _count: true,
    }),
    // Conducteurs de l'org (inclut ceux à 0 visite — visibilité de la charge).
    prisma.user.findMany({
      where: { organisationId, role: "CONDUCTEUR" },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
    // Délai moyen création → 1re visite réalisée sur la période (flux), EN SQL
    // (jours fractionnaires, diffs négatives écartées comme avant).
    prisma.$queryRaw<{ moyenne: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (v."dateRealisee" - d."createdAt")) / 86400.0)::float8 AS moyenne
      FROM "Visite" v
      JOIN "Dossier" d ON d."id" = v."dossierId"
      WHERE d."organisationId" = ${organisationId}
        AND v."numero" = 1
        AND v."statut" = 'REALISEE'
        AND v."dateRealisee" IS NOT NULL
        ${borneSql(`v."dateRealisee"`)}
        AND v."dateRealisee" >= d."createdAt"
    `,

    // ── Humidité (flux) : relevés des visites réalisées sur la période, ──
    // groupés par taux (≤ 101 groupes, un taux est un entier 0-100) : min,
    // max, moyenne, histogramme et part au-dessus du seuil s'en dérivent sans
    // charger une ligne par visite.
    prisma.visite.groupBy({
      by: ["tauxHumidite"],
      where: {
        dossier: dossierOrg,
        statut: "REALISEE",
        dateRealisee: depuisNonNull,
        tauxHumidite: { not: null },
      },
      _count: true,
    }),
    // Jours de réparation estimés : moyenne sur le même périmètre (l'_avg
    // ignore les null, comme l'ancien filtrage ligne à ligne).
    prisma.visite.aggregate({
      where: {
        dossier: dossierOrg,
        statut: "REALISEE",
        dateRealisee: depuisNonNull,
        tauxHumidite: { not: null },
      },
      _avg: { joursReparationEstimes: true },
    }),

    // ── Géographie (snapshot) : dossiers par département ──
    prisma.dossier.groupBy({
      by: ["departement"],
      where: { organisationId },
      _count: true,
    }),
  ]);

  // ── Axe mensuel commun aux barres (encaissé, nouveaux dossiers) ──
  // Borne basse : la borne de période, ou le plus ancien dossier pour « tout ».
  const debutAxe = debut ?? premierDossierAgg._min.createdAt ?? maintenant;
  const { mois: moisAxe, plafonne: moisPlafonnes } = moisEntre(
    debutAxe,
    maintenant,
  );

  // Projette des groupes mensuels SQL (clé « YYYY-MM » Paris, déjà agrégés)
  // sur l'axe (mois vides = 0). L'axe garantit l'ordre chronologique et les
  // trous ; to_char produit exactement le même format de clé que cleMois().
  function barresMensuelles(
    groupes: { cle: string; valeur: number }[],
    axe: MoisAxe[],
  ): BarreMois[] {
    const parCle = new Map(groupes.map((g) => [g.cle, g.valeur]));
    return axe.map((m) => ({
      cle: m.cle,
      label: m.label,
      valeur: parCle.get(m.cle) ?? 0,
    }));
  }

  // ── Pipeline ──
  const parStatut = new Map<DossierStatut, number>(
    pipelineBrut.map((r) => [r.statut, r._count]),
  );
  const pipeline = DOSSIER_STATUTS.map((statut) => ({
    statut,
    compte: parStatut.get(statut) ?? 0,
  }));
  const pipelineTotal = pipeline.reduce((s, p) => s + p.compte, 0);

  // ── Argent ── (totaux exacts dérivés des groupes mensuels SQL)
  const encaisseParMois = barresMensuelles(
    encaisseParMoisRows.map((r) => ({ cle: r.cle, valeur: r.total })),
    moisAxe,
  );
  const encaissePeriode = encaisseParMoisRows.reduce((s, r) => s + r.total, 0);
  const nbEncaisse = encaisseParMoisRows.reduce((s, r) => s + r.nb, 0);
  const franchiseCumulee = encaisseParMoisRows.reduce(
    (s, r) => s + r.franchise,
    0,
  );

  // ── Chantiers ── (compte + durée moyenne calculés en SQL)
  const chantiersTermines = chantiersTerminesRows[0] ?? {
    nb: 0,
    dureeMoyenne: null,
  };

  // ── Expertise ──
  const nouveauxParMois = barresMensuelles(
    nouveauxParMoisRows.map((r) => ({ cle: r.cle, valeur: r.nb })),
    moisAxe,
  );
  const nouveauxPeriode = nouveauxParMoisRows.reduce((s, r) => s + r.nb, 0);
  const realiseesMap = new Map(
    realiseesParConducteur.map((r) => [
      r.conducteurId,
      { count: r._count, minutes: r._sum.dureeMinutes ?? 0 },
    ]),
  );
  const aVenirMap = new Map(
    aVenirParConducteur.map((r) => [r.conducteurId, r._count]),
  );
  const parConducteur: LigneConducteur[] = conducteurs
    .map((c) => {
      const r = realiseesMap.get(c.id);
      return {
        id: c.id,
        nom: c.nom,
        visitesRealisees: r?.count ?? 0,
        heures: (r?.minutes ?? 0) / 60,
        aVenir: aVenirMap.get(c.id) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.visitesRealisees - a.visitesRealisees ||
        b.aVenir - a.aVenir ||
        a.nom.localeCompare(b.nom),
    );
  // ── Humidité ── (dérivée des groupes par taux : jamais une ligne par visite)
  const groupesTaux = humiditeParTaux.flatMap((g) =>
    g.tauxHumidite != null ? [{ taux: g.tauxHumidite, compte: g._count }] : [],
  );
  const nbReleves = groupesTaux.reduce((s, g) => s + g.compte, 0);
  const sommeTaux = groupesTaux.reduce((s, g) => s + g.taux * g.compte, 0);
  const buckets = bucketsHumidite(org.seuilHumidite);
  const comptes = new Array(buckets.length).fill(0);
  for (const g of groupesTaux) {
    comptes[indexBucketHumidite(g.taux, buckets)] += g.compte;
  }
  const histogramme: BarreHumidite[] = buckets.map((b, i) => ({
    label: b.label,
    compte: comptes[i],
    ton: b.ton,
  }));
  const auDessusSeuil = groupesTaux.reduce(
    (s, g) => (g.taux > org.seuilHumidite ? s + g.compte : s),
    0,
  );

  // ── Géographie ──
  const geo = geoBrut
    .map((r) => ({
      departement: r.departement ?? "Non renseigné",
      compte: r._count,
    }))
    .sort((a, b) => b.compte - a.compte || a.departement.localeCompare(b.departement));

  return {
    periode,
    borneLabel: borne.label,
    maintenant,
    seuilHumidite: org.seuilHumidite,
    moisPlafonnes,

    backlog: {
      aClasser,
      aReplanifier,
      empeches,
      aClouturer,
      total: aClasser + aReplanifier + empeches + aClouturer,
    },
    pipeline,
    pipelineTotal,
    geo,

    argent: {
      encaisseParMois,
      encaissePeriode,
      nbEncaisse,
      aEncaisser: aEncaisserAgg._sum.montantDevis ?? 0,
      nbAEncaisser: aEncaisserAgg._count,
      carnet: carnetAgg._sum.montantDevis ?? 0,
      nbCarnet: carnetAgg._count,
      franchiseCumulee,
      delaiEncaissementMoyen: delaiEncaissementRows[0]?.moyenne ?? null,
    },

    chantiers: {
      aVenir: chantiersAVenir,
      enCours: chantiersEnCours,
      aClouturer,
      terminesPeriode: chantiersTermines.nb,
      dureeMoyenneJours: chantiersTermines.dureeMoyenne,
    },

    expertise: {
      nouveauxParMois,
      nouveauxPeriode,
      visitesRealiseesPeriode: visitesRealiseesCount,
      parConducteur,
      tauxContreVisite: tauxPourcent(contreVisitesCount, visitesRealiseesCount),
      delaiPremiereVisiteMoyen: delaiPremiereVisiteRows[0]?.moyenne ?? null,
    },

    humidite: {
      nbReleves,
      moyen: nbReleves > 0 ? sommeTaux / nbReleves : null,
      min: groupesTaux.length
        ? Math.min(...groupesTaux.map((g) => g.taux))
        : null,
      max: groupesTaux.length
        ? Math.max(...groupesTaux.map((g) => g.taux))
        : null,
      joursReparationMoyen: joursReparationAgg._avg.joursReparationEstimes,
      pourcentSuperieurSeuil: tauxPourcent(auDessusSeuil, nbReleves),
      histogramme,
    },
  };
}
