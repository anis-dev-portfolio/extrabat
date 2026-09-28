import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { statsTag } from "@/lib/cache-tags";

// Données de la vue Chiffre d'affaires — des LISTES DE FAITS ADDITIONNÉS (pas
// un dashboard) : chaque total est la somme de lignes visibles et vérifiables
// une à une. Frontière assumée avec la page Statistiques (`/app/statistiques`,
// lib/statistiques-data.ts) : les graphiques, tendances et taux vivent là-bas ;
// ici, uniquement des faits additionnés.

// Fenêtre des règlements affichés : les 500 derniers suffisent à l'usage (un
// tenant fait quelques dizaines de dossiers/mois) ; l'historique complet reste
// en base. Borne = la page reste légère même après des années d'activité.
const PAYES_MAX = 500;

// Clé de mois stable pour le regroupement/tri (« 2026-07 »), en fuseau Paris —
// un règlement du 1er à 00 h 30 Paris tombe dans le bon mois (et pas le
// précédent en UTC). Le libellé (« juillet 2026 ») est dérivé du même Date.
const clePartsFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  timeZone: "Europe/Paris",
});
const moisLabelFmt = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

function cleMois(d: Date): string {
  // en-CA rend « 2026-07 » avec ces options — clé triable lexicographiquement.
  return clePartsFmt.format(d);
}

export type DossierPaye = {
  id: string;
  nomClient: string;
  montantDevis: number; // centimes (garanti non nul par le where)
  franchise: number | null;
  payeLe: Date;
};

export type MoisCA = {
  cle: string; // « 2026-07 »
  label: string; // « juillet 2026 »
  total: number; // somme des montants HT du mois (centimes)
  dossiers: DossierPaye[]; // du plus récent au plus ancien
};

export type ChiffreAffaires = {
  mois: MoisCA[]; // du mois le plus récent au plus ancien
  totalPaye: number; // somme des mois affichés (centimes)
  payesPlafonnes: boolean; // la fenêtre PAYES_MAX est atteinte (note honnête)
  totalAEncaisser: number; // terminé devisé non réglé — détail dans l'Historique
  nbAEncaisser: number;
  enCours: number; // total devisé des chantiers en cours (carnet de commandes)
  nbEnCours: number;
  maintenant: Date;
};

// Chargement de la vue CA (scopé org). Trois populations :
// - PAYÉS groupés par mois du règlement (payeLe) — le CA réalisé, dérivé du
//   fait « payé » (jamais couplé au « terminé ») ;
// - À ENCAISSER : total + nombre des terminés devisés non payés (le détail
//   dossier par dossier vit dans l'Historique, filtre « À encaisser ») ;
// - EN COURS : total devisé des dossiers EN_CHANTIER (carnet de commandes).
// Cache serveur par TENANT (clé = organisationId — invariant multi-tenant),
// même tag statsTag que les Statistiques : invalidé par les mutations
// financières (revaliderFinances) et le cycle dossiers/chantiers ; filet
// revalidate 300 s.
export async function chargerChiffreAffaires(
  organisationId: string,
): Promise<ChiffreAffaires> {
  const lire = unstable_cache(
    () => calculerChiffreAffaires(organisationId),
    ["chiffre-affaires", organisationId],
    { revalidate: 300, tags: [statsTag(organisationId)] },
  );
  const ca = await lire();
  // unstable_cache sérialise en JSON : sur cache chaud, les Date reviennent en
  // chaîne ISO — ré-hydratation (maintenant + payeLe de chaque règlement).
  return {
    ...ca,
    maintenant: new Date(ca.maintenant),
    mois: ca.mois.map((m) => ({
      ...m,
      dossiers: m.dossiers.map((d) => ({ ...d, payeLe: new Date(d.payeLe) })),
    })),
  };
}

async function calculerChiffreAffaires(
  organisationId: string,
): Promise<ChiffreAffaires> {
  const maintenant = new Date();

  const [payes, aEncaisserAgg, enCoursAgg] = await Promise.all([
    prisma.dossier.findMany({
      where: {
        organisationId,
        payeLe: { not: null },
        montantDevis: { not: null },
      },
      orderBy: { payeLe: "desc" },
      take: PAYES_MAX,
      select: {
        id: true,
        nomClient: true,
        montantDevis: true,
        franchise: true,
        payeLe: true,
      },
    }),
    // À encaisser : total + nombre seulement — le détail dossier par dossier
    // est servi par l'Historique (filtre « À encaisser »), plus de liste ici.
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
    prisma.dossier.aggregate({
      where: {
        organisationId,
        statut: "EN_CHANTIER",
        montantDevis: { not: null },
      },
      _sum: { montantDevis: true },
      _count: true,
    }),
  ]);

  // Regroupement par mois : `payes` est déjà trié payeLe desc, donc les mois
  // sont créés dans l'ordre du plus récent au plus ancien, et les dossiers
  // s'empilent desc dans chacun — aucun tri supplémentaire.
  const mois: MoisCA[] = [];
  const parCle = new Map<string, MoisCA>();
  for (const d of payes) {
    // Garde TS (le where garantit non-null) + filet défensif.
    if (d.montantDevis == null || d.payeLe == null) continue;
    const cle = cleMois(d.payeLe);
    let m = parCle.get(cle);
    if (!m) {
      m = { cle, label: moisLabelFmt.format(d.payeLe), total: 0, dossiers: [] };
      parCle.set(cle, m);
      mois.push(m);
    }
    m.total += d.montantDevis;
    m.dossiers.push({
      id: d.id,
      nomClient: d.nomClient,
      montantDevis: d.montantDevis,
      franchise: d.franchise,
      payeLe: d.payeLe,
    });
  }
  const totalPaye = mois.reduce((somme, m) => somme + m.total, 0);

  return {
    mois,
    totalPaye,
    payesPlafonnes: payes.length >= PAYES_MAX,
    totalAEncaisser: aEncaisserAgg._sum.montantDevis ?? 0,
    nbAEncaisser: aEncaisserAgg._count,
    enCours: enCoursAgg._sum.montantDevis ?? 0,
    nbEnCours: enCoursAgg._count,
    maintenant,
  };
}
