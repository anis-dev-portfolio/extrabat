import type { Metadata } from "next";
import Link from "next/link";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { dureeEnJours, periodeJoursFr } from "@/lib/chantiers";
import { ajouterJoursLocal, parseParamJour } from "@/lib/planning";
import { telephoneNormalise } from "@/lib/validation";
import { formatDateFr } from "@/lib/format";
import { formatEuros } from "@/lib/finances";
import { boutonClasses, TACTILE_MOBILE } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ContenuFiltrable, ZoneFiltres } from "@/components/ui/zone-filtres";
import { cn } from "@/lib/ui";
import { clamperPage } from "@/lib/pagination";
import { FiltresHistoriqueBar, type FiltresHistorique } from "./filtres";

// Historique paginé : plus de cap à 100, tout l'historique est atteignable par
// recherche/pagination (destination finale des dossiers TERMINE).
const PAGE_SIZE = 30;

const TRIS_HISTORIQUE = ["termine", "montant", "nom"] as const;
type TriHistorique = (typeof TRIS_HISTORIQUE)[number];
function estTri(valeur: string): valeur is TriHistorique {
  return (TRIS_HISTORIQUE as readonly string[]).includes(valeur);
}

const REGLEMENTS = ["paye", "attente", "sans_devis"] as const;
type Reglement = (typeof REGLEMENTS)[number];
function estReglement(valeur: string): valeur is Reglement {
  return (REGLEMENTS as readonly string[]).includes(valeur);
}

// orderBy de la liste (whitelist stricte, appliqué server-side). Le montant est
// trié NULLS LAST : les devis non saisis tombent en fin plutôt qu'en tête.
function orderByHistorique(
  tri: TriHistorique,
): Prisma.DossierOrderByWithRelationInput {
  switch (tri) {
    case "montant":
      return { montantDevis: { sort: "desc", nulls: "last" } };
    case "nom":
      return { nomClient: "asc" };
    case "termine":
    default:
      // Un TERMINE a toujours un chantier (cf. lib/finances-data) : fin des
      // travaux la plus récente en tête.
      return { chantier: { termineLe: "desc" } };
  }
}

// Traduit le filtre règlement en clauses where (les mêmes prédicats que
// BadgeReglement / lib/finances : payé, à encaisser, devis non saisi).
function whereReglement(reglement: Reglement): Prisma.DossierWhereInput {
  switch (reglement) {
    case "paye":
      return { payeLe: { not: null } };
    case "attente":
      return { payeLe: null, montantDevis: { not: null } };
    case "sans_devis":
      return { montantDevis: null };
  }
}

export const metadata: Metadata = { title: "Historique" };

// Onglet Historique : la destination finale des dossiers TERMINE (travaux
// terminés, dossier clos). Page en LECTURE — recherche + filtres (règlement,
// période de fin) + tri + pagination, calqués sur l'onglet Dossiers (tout
// server-side via searchParams). Les tuiles récapitulent le règlement du
// périmètre de recherche et servent de raccourcis de filtre.
// Seconde vue « Annulés » (`?vue=annules`) : les dossiers ANNULE, avec date et
// motif d'annulation — recherche + pagination seulement, ni tuiles ni tri.
export default async function HistoriquePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    reglement?: string;
    du?: string;
    au?: string;
    tri?: string;
    page?: string;
    vue?: string;
  }>;
}) {
  const user = await requireRole(BACK_OFFICE_ROLES);
  const sp = await searchParams;

  const vue: FiltresHistorique["vue"] =
    sp.vue === "annules" ? "annules" : "termines";

  const filtres: FiltresHistorique = {
    q: (sp.q ?? "").slice(0, 200),
    // Règlement, période et tri n'existent qu'en vue Terminés : la bascule
    // client purge ces paramètres, mais une URL forgée ne doit pas les faire
    // fuiter dans la vue Annulés (requêtes comme liens).
    reglement:
      vue === "termines" && estReglement(sp.reglement ?? "")
        ? (sp.reglement as Reglement)
        : "",
    du: vue === "termines" && parseParamJour(sp.du) ? sp.du! : "",
    au: vue === "termines" && parseParamJour(sp.au) ? sp.au! : "",
    tri:
      vue === "termines" && estTri(sp.tri ?? "")
        ? (sp.tri as TriHistorique)
        : "termine",
    vue,
  };

  // Recherche téléphone : saisie brute + variante normalisée (sans
  // espaces/points/tirets), même approche que les Dossiers.
  const qTelephoneNettoye = telephoneNormalise(filtres.q);
  const termineApres = parseParamJour(filtres.du);
  const termineAvant = parseParamJour(filtres.au);

  // Clauses OR de recherche (nom/adresse/téléphone) — partagées par les deux
  // vues : la recherche q est le seul filtre qui survit à la bascule
  // Terminés/Annulés.
  const whereRecherche: Prisma.DossierWhereInput = filtres.q
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
    : {};

  // whereBase = périmètre de recherche SANS le filtre règlement : partagé par
  // les tuiles récap (répartition payé/à encaisser stable) — la liste y ajoute
  // le filtre règlement courant.
  const whereBase: Prisma.DossierWhereInput = {
    organisationId: user.organisationId,
    statut: "TERMINE",
    ...whereRecherche,
    ...(termineApres || termineAvant
      ? {
          chantier: {
            is: {
              termineLe: {
                ...(termineApres ? { gte: termineApres } : {}),
                // Borne « au » incluse : < lendemain minuit Paris.
                ...(termineAvant ? { lt: ajouterJoursLocal(termineAvant, 1) } : {}),
              },
            },
          },
        }
      : {}),
  };
  const where: Prisma.DossierWhereInput = {
    ...whereBase,
    ...(filtres.reglement ? whereReglement(filtres.reglement) : {}),
  };

  const pageDemandee = Number.parseInt(sp.page ?? "1", 10);
  let page = Number.isFinite(pageDemandee) && pageDemandee > 0 ? pageDemandee : 1;

  // --- Vue Annulés : liste dédiée (ni tuiles ni agrégats de règlement) ---
  // Dossiers sortis du flux depuis leur fiche : date + motif d'annulation,
  // triés du plus récemment annulé au plus ancien, même pagination.
  if (vue === "annules") {
    const whereAnnules: Prisma.DossierWhereInput = {
      organisationId: user.organisationId,
      statut: "ANNULE",
      ...whereRecherche,
    };
    const selectAnnules = {
      id: true,
      nomClient: true,
      adresse: true,
      annuleLe: true,
      annulationMotif: true,
    } as const;
    const fetchPageAnnules = (skip: number) =>
      prisma.dossier.findMany({
        where: whereAnnules,
        orderBy: { annuleLe: "desc" },
        take: PAGE_SIZE,
        skip,
        select: selectAnnules,
      });
    const [premierePageAnnules, totalAnnulesFiltres] = await Promise.all([
      fetchPageAnnules((page - 1) * PAGE_SIZE),
      prisma.dossier.count({ where: whereAnnules }),
    ]);
    // ?page= forgée/périmée au-delà de la dernière : re-sert la dernière
    // page réelle (chemin d'exception, cf. lib/pagination.ts — même garde
    // que l'onglet Dossiers).
    const clampAnnules = await clamperPage(
      page,
      premierePageAnnules,
      totalAnnulesFiltres,
      PAGE_SIZE,
      fetchPageAnnules,
    );
    page = clampAnnules.page;
    const totalPagesAnnules = clampAnnules.totalPages;
    const dossiersAnnules = clampAnnules.rows;

    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Historique</h1>
          <p className="text-sm text-neutral-500">
            Les dossiers annulés — sortis du flux de travail, avec la date et
            le motif de l&apos;annulation.
          </p>
        </div>

        <ZoneFiltres>
          <FiltresHistoriqueBar filtres={filtres} avecBascule />

          <ContenuFiltrable>
            {dossiersAnnules.length === 0 ? (
              filtres.q ? (
                <EmptyState
                  titre="Aucun dossier ne correspond"
                  description="Modifiez la recherche ou réinitialisez les filtres."
                />
              ) : (
                <EmptyState
                  titre="Aucun dossier annulé"
                  description="Les dossiers annulés depuis leur fiche apparaîtront ici, avec la date et le motif de l'annulation."
                />
              )
            ) : (
              <div className="space-y-3">
                <p className="px-1 text-sm text-neutral-500">
                  {totalAnnulesFiltres} dossier
                  {totalAnnulesFiltres > 1 ? "s" : ""}
                  {filtres.q ? " correspondant" : " annulé"}
                  {totalAnnulesFiltres > 1 ? "s" : ""}
                </p>
                {/* Mobile : cartes empilées (mêmes données) — table dès sm. */}
                <div className="space-y-2 sm:hidden">
                  {dossiersAnnules.map((d) => (
                    <Link
                      key={d.id}
                      href={`/app/dossiers/${d.id}`}
                      className="block space-y-1.5 rounded-lg border border-neutral-200 bg-white p-3 shadow-xs transition-colors hover:border-primary-300"
                    >
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-neutral-900">
                          {d.nomClient}
                        </p>
                        <p className="truncate text-xs text-neutral-500">
                          {d.adresse}
                        </p>
                      </div>
                      {d.annuleLe && (
                        <p className="text-xs text-neutral-600 tabular-nums">
                          Annulé le {formatDateFr(d.annuleLe)}
                        </p>
                      )}
                      {d.annulationMotif && (
                        <p className="line-clamp-2 text-xs text-neutral-500">
                          Motif : {d.annulationMotif}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>

                <div className="hidden sm:block">
                <Table>
                  <thead>
                    <tr>
                      <Th>Client</Th>
                      <Th>Annulé le</Th>
                      <Th>Motif</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossiersAnnules.map((d) => (
                      <Tr key={d.id}>
                        <Td className="font-medium">
                          <Link
                            href={`/app/dossiers/${d.id}`}
                            className="text-primary-800 hover:underline"
                          >
                            {d.nomClient}
                          </Link>
                          <span className="block max-w-56 truncate text-xs text-neutral-500">
                            {d.adresse}
                          </span>
                        </Td>
                        <Td className="text-neutral-600 tabular-nums">
                          {d.annuleLe ? formatDateFr(d.annuleLe) : "—"}
                        </Td>
                        <Td className="text-neutral-600">
                          {d.annulationMotif ? (
                            // Motif tronqué dans la cellule ; le texte complet
                            // reste lisible au survol (title).
                            <span
                              className="block max-w-72 truncate"
                              title={d.annulationMotif}
                            >
                              {d.annulationMotif}
                            </span>
                          ) : (
                            "—"
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
                </div>

                <PaginationHistorique
                  filtres={filtres}
                  page={page}
                  totalPages={totalPagesAnnules}
                />
              </div>
            )}
          </ContenuFiltrable>
        </ZoneFiltres>
      </div>
    );
  }

  // --- Vue Terminés : flux existant, inchangé — seul s'ajoute le compteur
  // global des annulés (hors recherche) qui pilote l'affichage de la bascule.
  const selectTermines = {
    id: true,
    nomClient: true,
    adresse: true,
    montantDevis: true,
    payeLe: true,
    chantier: {
      select: { dateDebut: true, dateFin: true, termineLe: true },
    },
  } as const;
  const fetchPageTermines = (skip: number) =>
    prisma.dossier.findMany({
      where,
      orderBy: orderByHistorique(filtres.tri),
      take: PAGE_SIZE,
      skip,
      select: selectTermines,
    });
  const [premierePage, total, totalScope, aggPaye, aggAttente, totalAnnules] =
    await Promise.all([
      fetchPageTermines((page - 1) * PAGE_SIZE),
      prisma.dossier.count({ where }),
      prisma.dossier.count({ where: whereBase }),
      prisma.dossier.aggregate({
        where: {
          ...whereBase,
          payeLe: { not: null },
          montantDevis: { not: null },
        },
        _sum: { montantDevis: true },
        _count: true,
      }),
      prisma.dossier.aggregate({
        where: { ...whereBase, payeLe: null, montantDevis: { not: null } },
        _sum: { montantDevis: true },
        _count: true,
      }),
      prisma.dossier.count({
        where: { organisationId: user.organisationId, statut: "ANNULE" },
      }),
    ]);

  // ?page= forgée/périmée au-delà de la dernière : re-sert la dernière page
  // réelle (chemin d'exception, cf. lib/pagination.ts).
  const clampTermines = await clamperPage(
    page,
    premierePage,
    total,
    PAGE_SIZE,
    fetchPageTermines,
  );
  page = clampTermines.page;
  const totalPages = clampTermines.totalPages;
  const dossiers = clampTermines.rows;

  const filtresActifs = Boolean(
    filtres.q || filtres.reglement || filtres.du || filtres.au,
  );
  // Historique réellement vide (aucun dossier terminé NI annulé, aucun
  // filtre) → écran d'accueil sobre, sans tuiles ni barre de filtres. Dès
  // qu'il existe un annulé, la barre reste affichée : c'est elle qui porte la
  // bascule vers la vue Annulés.
  const historiqueVide = totalScope === 0 && !filtresActifs && totalAnnules === 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Historique</h1>
        <p className="text-sm text-neutral-500">
          Les dossiers terminés — travaux achevés et dossier clos. Recherchez,
          filtrez par règlement, triez.
        </p>
      </div>

      {historiqueVide ? (
        <EmptyState
          titre="Aucun dossier terminé"
          description="Les dossiers arriveront ici une fois leur chantier marqué terminé. C'est leur destination finale : client, période des travaux et règlement."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <TuileStat
              href={lienHistorique(filtres, { reglement: "" })}
              actif={filtres.reglement === ""}
              label="Terminés"
              valeur={String(totalScope)}
              detail="tous règlements"
            />
            <TuileStat
              href={lienHistorique(filtres, { reglement: "paye" })}
              actif={filtres.reglement === "paye"}
              label="Encaissé (HT)"
              valeur={formatEuros(aggPaye._sum.montantDevis ?? 0)}
              detail={`${aggPaye._count} réglé${aggPaye._count > 1 ? "s" : ""}`}
              accent="vert"
            />
            <TuileStat
              href={lienHistorique(filtres, { reglement: "attente" })}
              actif={filtres.reglement === "attente"}
              label="À encaisser (HT)"
              valeur={formatEuros(aggAttente._sum.montantDevis ?? 0)}
              detail={`${aggAttente._count} en attente`}
              accent="ambre"
            />
          </div>

          <ZoneFiltres>
            <FiltresHistoriqueBar
              filtres={filtres}
              avecBascule={totalAnnules > 0}
            />

            <ContenuFiltrable>
              {dossiers.length === 0 ? (
            // Sans filtre actif (cas atteignable uniquement quand des annulés
            // maintiennent la barre affichée), « réinitialisez les filtres »
            // serait un conseil à vide : on garde le message d'accueil.
            filtresActifs || totalScope > 0 ? (
              <EmptyState
                titre="Aucun dossier ne correspond"
                description="Modifiez la recherche ou réinitialisez les filtres."
              />
            ) : (
              <EmptyState
                titre="Aucun dossier terminé"
                description="Les dossiers arriveront ici une fois leur chantier marqué terminé."
              />
            )
          ) : (
            <div className="space-y-3">
              <p className="px-1 text-sm text-neutral-500">
                {total} dossier{total > 1 ? "s" : ""}
                {filtresActifs ? " correspondant" : " terminé"}
                {total > 1 ? "s" : ""}
              </p>
              {/* Mobile : cartes empilées (mêmes données) — table dès sm. */}
              <div className="space-y-2 sm:hidden">
                {dossiers.map((d) => (
                  <Link
                    key={d.id}
                    href={`/app/dossiers/${d.id}`}
                    className="block space-y-2 rounded-lg border border-neutral-200 bg-white p-3 shadow-xs transition-colors hover:border-primary-300"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-semibold text-neutral-900">
                          {d.nomClient}
                        </p>
                        <p className="truncate text-xs text-neutral-500">
                          {d.adresse}
                        </p>
                      </div>
                      <span className="shrink-0">
                        <BadgeReglement dossier={d} />
                      </span>
                    </div>
                    <div className="space-y-0.5 border-t border-neutral-100 pt-2 text-xs text-neutral-600 tabular-nums">
                      <p>
                        Travaux :{" "}
                        {d.chantier
                          ? `${periodeJoursFr(d.chantier.dateDebut, d.chantier.dateFin)} · ${dureeEnJours(d.chantier)} j`
                          : "—"}
                      </p>
                      <p>
                        Terminé le{" "}
                        {d.chantier?.termineLe
                          ? formatDateFr(d.chantier.termineLe)
                          : "—"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="hidden sm:block">
              <Table>
                <thead>
                  <tr>
                    <Th>Client</Th>
                    <Th>Travaux</Th>
                    <Th className="text-right">Durée</Th>
                    <Th>Terminé le</Th>
                    <Th>Règlement</Th>
                  </tr>
                </thead>
                <tbody>
                  {dossiers.map((d) => (
                    <Tr key={d.id}>
                      <Td className="font-medium">
                        <Link
                          href={`/app/dossiers/${d.id}`}
                          className="text-primary-800 hover:underline"
                        >
                          {d.nomClient}
                        </Link>
                        <span className="block max-w-56 truncate text-xs text-neutral-500">
                          {d.adresse}
                        </span>
                      </Td>
                      <Td className="text-neutral-600 tabular-nums">
                        {d.chantier
                          ? periodeJoursFr(d.chantier.dateDebut, d.chantier.dateFin)
                          : "—"}
                      </Td>
                      <Td className="text-right text-neutral-600 tabular-nums">
                        {d.chantier ? `${dureeEnJours(d.chantier)} j` : "—"}
                      </Td>
                      <Td className="text-neutral-600 tabular-nums">
                        {d.chantier?.termineLe
                          ? formatDateFr(d.chantier.termineLe)
                          : "—"}
                      </Td>
                      <Td>
                        <BadgeReglement dossier={d} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              </div>

              <PaginationHistorique
                filtres={filtres}
                page={page}
                totalPages={totalPages}
              />
            </div>
          )}
            </ContenuFiltrable>
          </ZoneFiltres>
        </>
      )}
    </div>
  );
}

// Tuile récap cliquable : un fait additionné (comptage / somme) qui sert aussi
// de raccourci vers le filtre règlement correspondant. L'active porte l'anneau.
function TuileStat({
  href,
  actif,
  label,
  valeur,
  detail,
  accent,
}: {
  href: string;
  actif: boolean;
  label: string;
  valeur: string;
  detail: string;
  accent?: "vert" | "ambre";
}) {
  return (
    <Link
      href={href}
      aria-current={actif ? "true" : undefined}
      className={cn(
        "rounded-xl border bg-white p-3 shadow-xs transition-colors",
        actif
          ? "border-primary-300 ring-1 ring-primary-200"
          : "border-neutral-200 hover:border-neutral-300",
      )}
    >
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-bold tabular-nums",
          accent === "vert"
            ? "text-emerald-700"
            : accent === "ambre"
              ? "text-amber-700"
              : "text-neutral-900",
        )}
      >
        {valeur}
      </p>
      <p className="text-xs text-neutral-500">{detail}</p>
    </Link>
  );
}

// Construit une URL d'historique en préservant les filtres courants — dont la
// vue Terminés/Annulés ; `override` change le règlement (tuiles, retour
// page 1) ou la page (pagination).
function lienHistorique(
  filtres: FiltresHistorique,
  override: { reglement?: FiltresHistorique["reglement"]; page?: number },
): string {
  const params = new URLSearchParams();
  // URL propre : `vue` n'apparaît que pour la vue Annulés (défaut omis).
  if (filtres.vue === "annules") params.set("vue", "annules");
  if (filtres.q) params.set("q", filtres.q);
  const reglement = override.reglement ?? filtres.reglement;
  if (reglement) params.set("reglement", reglement);
  if (filtres.du) params.set("du", filtres.du);
  if (filtres.au) params.set("au", filtres.au);
  if (filtres.tri !== "termine") params.set("tri", filtres.tri);
  if (override.page && override.page > 1) params.set("page", String(override.page));
  const qs = params.toString();
  return qs ? `/app/historique?${qs}` : "/app/historique";
}

function PaginationHistorique({
  filtres,
  page,
  totalPages,
}: {
  filtres: FiltresHistorique;
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
            href={lienHistorique(filtres, { page: page - 1 })}
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
            href={lienHistorique(filtres, { page: page + 1 })}
            className={boutonClasses("secondaire", "sm", TACTILE_MOBILE)}
          >
            Suivant
          </Link>
        )}
      </div>
    </div>
  );
}

// Jalon financier du dossier clos : payé (+ montant), à encaisser (+ montant)
// ou devis non saisi.
function BadgeReglement({
  dossier,
}: {
  dossier: { montantDevis: number | null; payeLe: Date | null };
}) {
  if (dossier.montantDevis == null) {
    return <Badge ton="neutre">Devis non saisi</Badge>;
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge ton={dossier.payeLe ? "vert" : "ambre"}>
        {dossier.payeLe ? "Payé" : "À encaisser"}
      </Badge>
      <span className="text-xs text-neutral-500 tabular-nums">
        {formatEuros(dossier.montantDevis)} HT
      </span>
    </span>
  );
}
