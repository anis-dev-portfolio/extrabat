import type { Metadata } from "next";
import Link from "next/link";
import { BadgeEuro, Droplets, Plus } from "lucide-react";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { DossierStatut } from "@/lib/generated/prisma/enums";
import {
  DOSSIER_STATUTS,
  DOSSIER_STATUTS_KANBAN,
  DOSSIER_STATUT_LABELS,
  dateContreVisiteConseillee,
  doitEtreReplanifieDepuisCount,
  visiteLabel,
} from "@/lib/metier";
import { ordrePrioriteDossier } from "@/lib/priorite";
import { ajouterJoursLocal, parseParamJour } from "@/lib/planning";
import { telephoneNormalise } from "@/lib/validation";
import {
  formatDateFr,
  formatDateTimeFr,
  formatPlageDateTimeFr,
} from "@/lib/format";
import { boutonClasses, TACTILE_MOBILE } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Marque } from "@/components/ui/marque";
import {
  BadgeAlerte,
  DOSSIER_STATUT_UI,
  StatutDossierBadge,
} from "@/components/ui/statut-badge";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Taux } from "@/components/ui/taux";
import { ContenuFiltrable, ZoneFiltres } from "@/components/ui/zone-filtres";
import { cn } from "@/lib/ui";
import { clamperPage } from "@/lib/pagination";
import { FiltresDossiersBar, type FiltresDossiers } from "./filtres";

// Cap par colonne kanban — au-delà, un lien "+N autres" renvoie vers la vue
// liste filtrée par ce statut (qui, elle, est vraiment paginée).
const KANBAN_TAKE = 50;
const PAGE_SIZE = 30;

// L'UI ne consomme que la DERNIÈRE visite (take 1) + l'existence d'une visite
// PLANIFIEE à venir (le _count filtré nourrit le signal « À re-planifier ») —
// inutile de charger toutes les visites de chaque dossier.
function dossierInclude(maintenant: Date) {
  return {
    visites: {
      orderBy: { numero: "desc" },
      take: 1,
      select: {
        id: true,
        numero: true,
        statut: true,
        datePlanifiee: true,
        dureeMinutes: true, // plage « 10h – 12h », jamais une heure fixe
        dateRealisee: true,
        tauxHumidite: true,
        joursReparationEstimes: true,
        conducteur: { select: { nom: true } },
      },
    },
    _count: {
      select: {
        visites: {
          where: { statut: "PLANIFIEE", datePlanifiee: { gt: maintenant } },
        },
      },
    },
  } satisfies Prisma.DossierInclude;
}

type DossierAvecVisites = Prisma.DossierGetPayload<{
  include: ReturnType<typeof dossierInclude>;
}>;

// Résumé partagé kanban/liste : dernière visite, badge « À re-planifier »
// (doitEtreReplanifieDepuisCount, lib/metier — nourri par le _count filtré,
// visites PLANIFIEE à venir, calculé avec le même `maintenant`), échéance de
// séchage, empêchement signalé. L'empêchement (conducteur bloqué sur le
// terrain, visite retirée du planning) vient des scalaires du dossier —
// nullé par la planification suivante.
function resumeDossier(
  dossier: DossierAvecVisites,
  maintenant: Date,
  delai: number,
) {
  const derniere = dossier.visites[0] ?? null;
  const echeanceSechage = dateContreVisiteConseillee(dossier, delai);
  const aReplanifier = doitEtreReplanifieDepuisCount(
    dossier,
    dossier._count.visites,
    maintenant,
    delai,
  );
  const empechement = dossier.empechementLe
    ? { le: dossier.empechementLe, motif: dossier.empechementMotif }
    : null;
  // Rappel discret du geste au bon moment : un dossier prêt pour travaux sans
  // montant de devis reporté depuis Tolteck (les statuts travaux ont leur
  // propre rappel dans la section Chantiers).
  const devisNonSaisi =
    dossier.statut === "PRET_POUR_TRAVAUX" && dossier.montantDevis == null;
  return { derniere, aReplanifier, echeanceSechage, empechement, devisNonSaisi };
}

// Tris proposés en vue liste (whitelist stricte). « priorite » (défaut) suit
// l'urgence du statut filtré via ordrePrioriteDossier — le MÊME ordre que le
// kanban, dont chaque colonne est déjà triée par priorité. Les autres sont des
// orderBy statiques.
const TRIS_STATIQUES = {
  recent: { updatedAt: "desc" },
  creation: { createdAt: "desc" },
  nom: { nomClient: "asc" },
} as const satisfies Record<string, Prisma.DossierOrderByWithRelationInput>;

const TRIS_LISTE = ["priorite", "recent", "creation", "nom"] as const;
type TriListe = (typeof TRIS_LISTE)[number];

function estTri(valeur: string): valeur is TriListe {
  return (TRIS_LISTE as readonly string[]).includes(valeur);
}

// orderBy de la vue liste : « priorite » délègue à ordrePrioriteDossier selon
// le statut filtré (undefined si « Tous les statuts » → activité récente).
function orderByListe(
  tri: TriListe,
  statut: string,
): Prisma.DossierOrderByWithRelationInput | Prisma.DossierOrderByWithRelationInput[] {
  if (tri === "priorite") {
    return ordrePrioriteDossier(statut ? (statut as DossierStatut) : undefined);
  }
  return TRIS_STATIQUES[tri];
}

type ColonneKanban = {
  statut: DossierStatut;
  dossiers: DossierAvecVisites[];
  total: number;
};

function estStatut(valeur: string): valeur is DossierStatut {
  return (DOSSIER_STATUTS as readonly string[]).includes(valeur);
}

export const metadata: Metadata = { title: "Dossiers" };

export default async function DossiersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    statut?: string;
    conducteur?: string;
    du?: string;
    au?: string;
    vue?: string;
    tri?: string;
    page?: string;
  }>;
}) {
  const user = await requireRole(BACK_OFFICE_ROLES);
  const sp = await searchParams;

  const statutFiltre = estStatut(sp.statut ?? "") ? sp.statut! : "";
  // Les statuts hors kanban (EN_CHANTIER, TERMINE) n'ont pas de colonne :
  // filtrer dessus bascule d'office en vue liste.
  const statutHorsKanban =
    statutFiltre !== "" &&
    !(DOSSIER_STATUTS_KANBAN as readonly string[]).includes(statutFiltre);
  // Défauts d'affichage réglés par l'organisation (Paramètres → Préférences
  // d'affichage). Servent de repli quand l'URL ne porte pas vue/tri, et de
  // référence « à omettre » côté barre de filtres.
  const vueDefaut: FiltresDossiers["vue"] =
    user.organisation.vueDossiersDefaut === "liste" ? "liste" : "kanban";
  const triDefaut: TriListe = estTri(user.organisation.triDossiersDefaut)
    ? (user.organisation.triDossiersDefaut as TriListe)
    : "priorite";

  const filtres: FiltresDossiers = {
    q: (sp.q ?? "").slice(0, 200),
    statut: statutFiltre,
    conducteur: sp.conducteur ?? "",
    du: parseParamJour(sp.du) ? sp.du! : "",
    au: parseParamJour(sp.au) ? sp.au! : "",
    // vue explicite dans l'URL > statut hors kanban (force liste) > défaut org.
    vue: statutHorsKanban
      ? "liste"
      : sp.vue === "liste"
        ? "liste"
        : sp.vue === "kanban"
          ? "kanban"
          : vueDefaut,
    tri: estTri(sp.tri ?? "") ? (sp.tri as TriListe) : triDefaut,
  };

  // Référence unique pour la requête (visites à venir) ET le rendu des badges.
  const maintenant = new Date();
  // Délai de séchage réglé par l'organisation (défaut usine 30 j) — nourrit le
  // badge « À re-planifier » et l'échéance de contre-visite, au même titre que
  // le comptage « À traiter » (lib/a-traiter). Seuil d'humidité réglé de même :
  // colore le taux (rouge au-delà du seuil) en cohérence avec le classement.
  const delai = user.organisation.delaiSechageJours;
  const seuil = user.organisation.seuilHumidite;

  // Recherche + filtres server-side, partagés entre kanban et liste.
  const creeApres = parseParamJour(filtres.du);
  const creeAvant = parseParamJour(filtres.au);
  // Recherche téléphone : saisie brute + variante normalisée (sans
  // espaces/points/tirets — couvre « 06 12 34 56 78 » tapé « 0612345678 » ; la
  // colonne, elle, n'est pas normalisable en contains SQL simple).
  const qTelephoneNettoye = telephoneNormalise(filtres.q);
  // where SANS statut : partagé par toutes les colonnes du kanban (chacune
  // applique ensuite SON statut). La vue liste y ajoute filtres.statut.
  const whereBase: Prisma.DossierWhereInput = {
    organisationId: user.organisationId,
    ...(filtres.q
      ? {
          OR: [
            { nomClient: { contains: filtres.q, mode: "insensitive" } },
            { adresse: { contains: filtres.q, mode: "insensitive" } },
            { telephone: { contains: filtres.q } },
            ...(qTelephoneNettoye && qTelephoneNettoye !== filtres.q
              ? [{ telephone: { contains: qTelephoneNettoye } }]
              : []),
          ],
        }
      : {}),
    ...(filtres.conducteur
      ? { visites: { some: { conducteurId: filtres.conducteur } } }
      : {}),
    ...(creeApres || creeAvant
      ? {
          createdAt: {
            ...(creeApres ? { gte: creeApres } : {}),
            // Borne « au » incluse : < lendemain minuit Paris.
            ...(creeAvant ? { lt: ajouterJoursLocal(creeAvant, 1) } : {}),
          },
        }
      : {}),
  };
  const where: Prisma.DossierWhereInput = {
    ...whereBase,
    ...(filtres.statut ? { statut: filtres.statut as DossierStatut } : {}),
  };

  const conducteursPromise = prisma.user.findMany({
    where: { organisationId: user.organisationId, role: "CONDUCTEUR" },
    orderBy: { nom: "asc" },
    select: { id: true, nom: true },
  });

  let dossiers: DossierAvecVisites[] = [];
  let colonnes: ColonneKanban[] = [];
  let totalGlobal = 0;
  let page = 1;
  let totalPages = 1;
  let conducteurs: { id: string; nom: string }[];

  if (filtres.vue === "liste") {
    const pageDemandee = Number.parseInt(sp.page ?? "1", 10);
    page = Number.isFinite(pageDemandee) && pageDemandee > 0 ? pageDemandee : 1;

    const fetchPage = (skip: number) =>
      prisma.dossier.findMany({
        where,
        orderBy: orderByListe(filtres.tri, filtres.statut),
        include: dossierInclude(maintenant),
        take: PAGE_SIZE,
        skip,
      });
    const [rows, total, cs] = await Promise.all([
      fetchPage((page - 1) * PAGE_SIZE),
      prisma.dossier.count({ where }),
      conducteursPromise,
    ]);
    totalGlobal = total;
    conducteurs = cs;
    // ?page= forgée/périmée au-delà de la dernière : re-sert la dernière
    // page réelle (chemin d'exception, cf. lib/pagination.ts).
    const clamp = await clamperPage(page, rows, total, PAGE_SIZE, fetchPage);
    page = clamp.page;
    totalPages = clamp.totalPages;
    dossiers = clamp.rows;
  } else {
    const [parColonne, cs] = await Promise.all([
      Promise.all(
        DOSSIER_STATUTS_KANBAN.map(async (statut): Promise<ColonneKanban> => {
          // Le filtre "statut" du formulaire, actif, ne peut matcher qu'UNE
          // colonne — les autres restent vides sans requête.
          if (filtres.statut && filtres.statut !== statut) {
            return { statut, dossiers: [], total: 0 };
          }
          const whereColonne: Prisma.DossierWhereInput = { ...whereBase, statut };
          const [rows, total] = await Promise.all([
            prisma.dossier.findMany({
              where: whereColonne,
              // Chaque colonne triée par priorité de son statut (En attente :
              // séchage le plus dépassé en tête ; Prêt pour travaux : en attente
              // depuis le plus longtemps ; etc.).
              orderBy: ordrePrioriteDossier(statut),
              include: dossierInclude(maintenant),
              take: KANBAN_TAKE,
            }),
            prisma.dossier.count({ where: whereColonne }),
          ]);
          return { statut, dossiers: rows, total };
        }),
      ),
      conducteursPromise,
    ]);
    colonnes = parColonne;
    totalGlobal = parColonne.reduce((somme, c) => somme + c.total, 0);
    conducteurs = cs;
  }

  const filtresActifs = Boolean(
    filtres.q || filtres.statut || filtres.conducteur || filtres.du || filtres.au,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Dossiers</h1>
          <p className="text-sm text-neutral-500">
            {totalGlobal} dossier{totalGlobal > 1 ? "s" : ""}
            {/* Le kanban ne couvre que le cycle expertise (pas de colonne
                En chantier / Terminé) : expliciter le périmètre pour ne pas
                laisser croire à un écart avec la vue liste. */}
            {filtres.vue === "kanban" && " en cours d'expertise"}
            {filtresActifs && " (filtrés)"}
          </p>
        </div>
        <Link href="/app/dossiers/nouveau" className={boutonClasses("primaire")}>
          <Plus className="size-4" aria-hidden="true" />
          Nouveau dossier
        </Link>
      </div>

      <ZoneFiltres>
        <FiltresDossiersBar
          filtres={filtres}
          conducteurs={conducteurs}
          vueDefaut={vueDefaut}
          triDefaut={triDefaut}
        />

        <ContenuFiltrable>
          {totalGlobal === 0 ? (
            filtresActifs ? (
              <EmptyState
                titre="Aucun dossier ne correspond"
                description="Modifiez la recherche ou réinitialisez les filtres."
              />
            ) : (
              <EmptyState
                titre="Aucun dossier pour l'instant"
                description="Créez le premier dossier sinistre : client, adresse, téléphone — la planification suit."
                action={
                  <Link
                    href="/app/dossiers/nouveau"
                    className={boutonClasses("primaire")}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Nouveau dossier
                  </Link>
                }
              />
            )
          ) : filtres.vue === "liste" ? (
            <div className="space-y-4">
              <VueListe
                dossiers={dossiers}
                maintenant={maintenant}
                delai={delai}
                seuil={seuil}
              />
              <PaginationDossiers filtres={filtres} page={page} totalPages={totalPages} />
            </div>
          ) : (
            <VueKanban
              colonnes={colonnes}
              filtres={filtres}
              maintenant={maintenant}
              delai={delai}
              seuil={seuil}
            />
          )}
        </ContenuFiltrable>
      </ZoneFiltres>
    </div>
  );
}

/* ── Kanban ─────────────────────────────────────────────────────────── */

function VueKanban({
  colonnes,
  filtres,
  maintenant,
  delai,
  seuil,
}: {
  colonnes: ColonneKanban[];
  filtres: FiltresDossiers;
  maintenant: Date;
  delai: number;
  seuil: number;
}) {
  return (
    // Pleine largeur SANS scroll horizontal : 5 colonnes minmax(0,1fr) dès xl.
    // Pleine hauteur : la grille prend le viewport moins les éléments au-dessus
    // (py-6 du main + titre + filtres + gaps ≈ 13.5rem) ; chaque colonne
    // scrolle en interne. Sous xl : 2 colonnes puis empilement, scroll page.
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:h-[calc(100dvh-13.5rem)] xl:grid-cols-5">
      {colonnes.map(({ statut, dossiers: colonne, total }) => {
        const ui = DOSSIER_STATUT_UI[statut];
        const aTraiter = statut === "REALISE";
        const plafonne = total > colonne.length;
        return (
          <section
            key={statut}
            aria-label={DOSSIER_STATUT_LABELS[statut]}
            className={cn(
              "flex min-h-48 flex-col rounded-xl p-2 xl:min-h-0",
              aTraiter
                ? "bg-violet-50/70 ring-1 ring-violet-200"
                : "bg-neutral-100/80",
            )}
          >
            <div className="flex items-center justify-between gap-2 px-1.5 pt-1 pb-2.5">
              <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-neutral-800">
                <span
                  className={cn("size-2 shrink-0 rounded-full", ui.point)}
                  aria-hidden="true"
                />
                <span className="truncate">{DOSSIER_STATUT_LABELS[statut]}</span>
              </h2>
              <span className="flex shrink-0 items-center gap-1.5">
                {aTraiter && total > 0 && (
                  <span className="text-[11px] font-medium text-violet-700">
                    à traiter
                  </span>
                )}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                    aTraiter && total > 0
                      ? "bg-violet-600 text-white"
                      : "bg-white text-neutral-600 ring-1 ring-neutral-200",
                  )}
                >
                  {total}
                </span>
              </span>
            </div>
            {/* min-h-0 : sans lui, flex refuse de rétrécir et la colonne
                déborde au lieu de scroller. overflow-x-hidden explicite : dès
                que overflow-y est posé, un overflow-x laissé « visible »
                calcule à auto (spec CSS) → scrollbar horizontale parasite au
                moindre pixel de débordement d'une carte. */}
            <div className="scrollbar-survol flex min-h-0 flex-1 flex-col gap-2 xl:overflow-x-hidden xl:overflow-y-auto">
              {colonne.length === 0 ? (
                <EmptyState
                  titre="Aucun dossier"
                  className="flex-1"
                  icone={
                    <Marque mono className="h-6 w-auto text-neutral-300" />
                  }
                />
              ) : (
                <>
                  {colonne.map((dossier, i) => (
                    <CarteDossier
                      key={dossier.id}
                      dossier={dossier}
                      index={i}
                      maintenant={maintenant}
                      delai={delai}
                      seuil={seuil}
                    />
                  ))}
                  {plafonne && (
                    <Link
                      href={urlColonne(filtres, statut)}
                      className="flex shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-300 px-3 py-2.5 text-center text-xs font-medium text-neutral-500 transition-colors hover:border-primary-300 hover:text-primary-700"
                    >
                      +{total - colonne.length} autre{total - colonne.length > 1 ? "s" : ""} ·
                      voir en liste
                    </Link>
                  )}
                </>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// Carte kanban : un résumé CLIQUABLE vers la fiche — les actions vivent sur
// la fiche dossier. `avecStatut` : badge de statut affiché quand la carte vit
// hors d'une colonne kanban (liste mobile), où le statut n'est pas implicite.
function CarteDossier({
  dossier,
  index,
  maintenant,
  delai,
  seuil,
  avecStatut = false,
}: {
  dossier: DossierAvecVisites;
  index: number;
  maintenant: Date;
  delai: number;
  seuil: number;
  avecStatut?: boolean;
}) {
  const { derniere, aReplanifier, echeanceSechage, empechement, devisNonSaisi } =
    resumeDossier(dossier, maintenant, delai);

  return (
    <Link
      href={`/app/dossiers/${dossier.id}`}
      className="block space-y-2 rounded-lg border border-neutral-200 bg-white p-3 shadow-xs transition-all hover:-translate-y-px hover:border-primary-300 hover:shadow-md active:scale-[0.99] animate-[carte-in_200ms_var(--ease-sortie)_backwards]"
      style={{ animationDelay: `${Math.min(index, 8) * 25}ms` }}
    >
      <div className="space-y-0.5">
        <p className="flex items-start justify-between gap-2 text-sm font-semibold text-neutral-900">
          <span className="leading-tight">{dossier.nomClient}</span>
          {(empechement || aReplanifier) && (
            <span className="flex shrink-0 flex-col items-end gap-1">
              {empechement && (
                <span title={empechement.motif ?? undefined}>
                  <BadgeAlerte>Empêchement — à re-planifier</BadgeAlerte>
                </span>
              )}
              {aReplanifier && <BadgeAlerte>À re-planifier</BadgeAlerte>}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-neutral-500">{dossier.adresse}</p>
      </div>

      {avecStatut && (
        <p>
          <StatutDossierBadge statut={dossier.statut} />
        </p>
      )}

      {/* Motif en clair (tronqué) : le title seul est invisible au tactile
          et aux lecteurs d'écran. */}
      {empechement?.motif && (
        <p className="line-clamp-1 text-xs text-neutral-500">
          Motif : {empechement.motif}
        </p>
      )}

      {echeanceSechage && !aReplanifier && (
        <p className="flex items-center gap-1 text-xs font-medium text-amber-700">
          <Droplets className="size-3.5 shrink-0" aria-hidden="true" />
          Contre-visite dès le {formatDateFr(echeanceSechage)}
        </p>
      )}

      {devisNonSaisi && (
        <p className="flex items-center gap-1 text-xs font-medium text-neutral-500">
          <BadgeEuro className="size-3.5 shrink-0" aria-hidden="true" />
          Devis non saisi
        </p>
      )}

      {derniere ? (
        <div className="space-y-0.5 border-t border-neutral-100 pt-2 text-xs text-neutral-500">
          <p className="font-medium text-neutral-700">
            {visiteLabel(derniere.numero)}
          </p>
          {derniere.statut === "PLANIFIEE" ? (
            <p className="tabular-nums">
              Prévue le{" "}
              {formatPlageDateTimeFr(derniere.datePlanifiee, derniere.dureeMinutes)} ·{" "}
              {derniere.conducteur.nom}
            </p>
          ) : (
            <p className="tabular-nums">
              {derniere.dateRealisee
                ? `Réalisée le ${formatDateTimeFr(derniere.dateRealisee)}`
                : "Réalisée"}
              {derniere.tauxHumidite != null && (
                <>
                  {" · "}
                  <Taux taux={derniere.tauxHumidite} seuil={seuil} />
                </>
              )}
            </p>
          )}
        </div>
      ) : (
        <p className="border-t border-neutral-100 pt-2 text-xs text-neutral-500">
          Aucune visite planifiée.
        </p>
      )}
    </Link>
  );
}

/* ── Liste ──────────────────────────────────────────────────────────── */

function VueListe({
  dossiers,
  maintenant,
  delai,
  seuil,
}: {
  dossiers: DossierAvecVisites[];
  maintenant: Date;
  delai: number;
  seuil: number;
}) {
  return (
    <>
      {/* Mobile : cartes empilées (mêmes données, même composant que le
          kanban, badge de statut en plus) — la table prend le relais dès sm. */}
      <div className="space-y-2 sm:hidden">
        {dossiers.map((dossier, i) => (
          <CarteDossier
            key={dossier.id}
            dossier={dossier}
            index={i}
            maintenant={maintenant}
            delai={delai}
            seuil={seuil}
            avecStatut
          />
        ))}
      </div>

      <div className="hidden sm:block">
    <Table>
      <thead>
        <tr>
          <Th>Client</Th>
          <Th>Adresse</Th>
          <Th>Statut</Th>
          <Th>Dernière visite</Th>
          <Th className="text-right">Taux</Th>
        </tr>
      </thead>
      <tbody>
        {dossiers.map((dossier) => {
          const {
            derniere,
            aReplanifier,
            echeanceSechage,
            empechement,
            devisNonSaisi,
          } = resumeDossier(dossier, maintenant, delai);
          return (
            <Tr key={dossier.id}>
              <Td className="font-medium">
                <Link
                  href={`/app/dossiers/${dossier.id}`}
                  className="text-primary-800 hover:underline"
                >
                  {dossier.nomClient}
                </Link>
                {empechement && (
                  <span className="ml-2" title={empechement.motif ?? undefined}>
                    <BadgeAlerte>Empêchement — à re-planifier</BadgeAlerte>
                  </span>
                )}
                {aReplanifier && (
                  <BadgeAlerte className="ml-2">À re-planifier</BadgeAlerte>
                )}
                {/* Motif en clair (tronqué) : le title seul est invisible au
                    tactile et aux lecteurs d'écran. */}
                {empechement?.motif && (
                  <span className="mt-0.5 line-clamp-1 text-xs text-neutral-500">
                    Motif : {empechement.motif}
                  </span>
                )}
                {echeanceSechage && !aReplanifier && (
                  <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-700">
                    <Droplets className="size-3.5 shrink-0" aria-hidden="true" />
                    Contre-visite dès le {formatDateFr(echeanceSechage)}
                  </span>
                )}
                {devisNonSaisi && (
                  <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-neutral-500">
                    <BadgeEuro className="size-3.5 shrink-0" aria-hidden="true" />
                    Devis non saisi
                  </span>
                )}
              </Td>
              <Td className="max-w-64 truncate text-neutral-600">
                {dossier.adresse}
              </Td>
              <Td>
                <StatutDossierBadge statut={dossier.statut} />
              </Td>
              <Td className="text-neutral-600 tabular-nums">
                {derniere ? (
                  <>
                    {visiteLabel(derniere.numero)}
                    <span className="block text-xs text-neutral-500">
                      {derniere.statut === "PLANIFIEE"
                        ? `Prévue le ${formatPlageDateTimeFr(derniere.datePlanifiee, derniere.dureeMinutes)}`
                        : derniere.dateRealisee
                          ? `Réalisée le ${formatDateTimeFr(derniere.dateRealisee)}`
                          : "Réalisée"}{" "}
                      · {derniere.conducteur.nom}
                    </span>
                  </>
                ) : (
                  <span className="text-neutral-400">—</span>
                )}
              </Td>
              <Td className="text-right tabular-nums">
                {derniere?.tauxHumidite != null ? (
                  <Taux taux={derniere.tauxHumidite} seuil={seuil} />
                ) : (
                  <span className="text-neutral-400">—</span>
                )}
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
      </div>
    </>
  );
}

/* ── URLs + pagination ─────────────────────────────────────────────── */

function paramsCommuns(filtres: FiltresDossiers): URLSearchParams {
  const params = new URLSearchParams();
  if (filtres.q) params.set("q", filtres.q);
  if (filtres.conducteur) params.set("conducteur", filtres.conducteur);
  if (filtres.du) params.set("du", filtres.du);
  if (filtres.au) params.set("au", filtres.au);
  if (filtres.tri !== "priorite") params.set("tri", filtres.tri);
  return params;
}

function urlColonne(filtres: FiltresDossiers, statut: DossierStatut): string {
  const params = paramsCommuns(filtres);
  params.set("statut", statut);
  params.set("vue", "liste");
  return `/app/dossiers?${params.toString()}`;
}

function urlPage(filtres: FiltresDossiers, page: number): string {
  const params = paramsCommuns(filtres);
  if (filtres.statut) params.set("statut", filtres.statut);
  params.set("vue", "liste");
  if (page > 1) params.set("page", String(page));
  return `/app/dossiers?${params.toString()}`;
}

function PaginationDossiers({
  filtres,
  page,
  totalPages,
}: {
  filtres: FiltresDossiers;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-1 pt-1 text-sm text-neutral-600">
      <span>
        Page {page} / {totalPages}
      </span>
      {/* En butée : un <span> (même rendu), pas un <Link> désactivé —
          pointer-events-none + aria-disabled n'empêchent pas Tab + Entrée. */}
      <div className="flex gap-2">
        {page <= 1 ? (
          <span
            className={boutonClasses("secondaire", "sm", `pointer-events-none opacity-40 ${TACTILE_MOBILE}`)}
          >
            Précédent
          </span>
        ) : (
          <Link
            href={urlPage(filtres, page - 1)}
            className={boutonClasses("secondaire", "sm", TACTILE_MOBILE)}
          >
            Précédent
          </Link>
        )}
        {page >= totalPages ? (
          <span
            className={boutonClasses("secondaire", "sm", `pointer-events-none opacity-40 ${TACTILE_MOBILE}`)}
          >
            Suivant
          </span>
        ) : (
          <Link
            href={urlPage(filtres, page + 1)}
            className={boutonClasses("secondaire", "sm", TACTILE_MOBILE)}
          >
            Suivant
          </Link>
        )}
      </div>
    </div>
  );
}
