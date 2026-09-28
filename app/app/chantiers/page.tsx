import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  FileText,
  HardHat,
  Plus,
} from "lucide-react";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  dureeEnJours,
  etatChantier,
  periodeJoursFr,
} from "@/lib/chantiers";
import {
  ajouterJoursLocal,
  dateVersParamJour,
  debutJourLocal,
  fenetreSemaine,
  parseParamJour,
} from "@/lib/planning";
import { formatJourCourtFr } from "@/lib/format";
import { boutonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PrintButton } from "@/components/ui/print-button";
import { EtatChantierBadge } from "@/components/ui/statut-badge";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import {
  GanttSemaine,
  type BarreChantier,
  type JourColonne,
  type LigneOuvrier,
} from "./gantt";
import { SelecteurDate } from "./selecteur-date";

const chantierInclude = {
  dossier: {
    select: { id: true, nomClient: true, adresse: true },
  },
  affectations: {
    include: { ouvrier: { select: { id: true, nom: true } } },
    orderBy: { ouvrier: { nom: "asc" } },
  },
} satisfies Prisma.ChantierInclude;

type ChantierListe = Prisma.ChantierGetPayload<{
  include: typeof chantierInclude;
}>;

export const metadata: Metadata = { title: "Chantiers" };

// Section Chantiers : vue semaine (Gantt ouvriers × jours), file des dossiers
// prêts pour travaux (la to-do de planification) et listes des chantiers.
export default async function ChantiersPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireRole(BACK_OFFICE_ROLES);
  const sp = await searchParams;

  const maintenant = new Date();
  const dateRef = parseParamJour(sp.date) ?? maintenant;
  const fenetre = fenetreSemaine(dateRef);
  const jours = Array.from({ length: 7 }, (_, i) =>
    ajouterJoursLocal(fenetre.debut, i),
  );
  // Index de colonne (0..6) d'un minuit Paris dans la semaine affichée —
  // Math.round absorbe les jours de 23/25 h aux changements d'heure.
  const indexJour = (d: Date) =>
    Math.round((d.getTime() - fenetre.debut.getTime()) / 86_400_000);
  const colAujourdhui = indexJour(debutJourLocal(maintenant));

  // Requêtes bornées : Gantt = chantiers chevauchant la semaine affichée
  // (index organisationId, dateDebut) ; « En cours & à venir » = termineLe null
  // (volume naturellement borné). Les terminés vivent désormais dans l'onglet
  // Historique (dossiers TERMINE), plus ici.
  const [aPlanifier, chantiersSemaine, enCours, ouvriers] =
    await Promise.all([
      prisma.dossier.findMany({
        where: {
          organisationId: user.organisationId,
          statut: "PRET_POUR_TRAVAUX",
        },
        // Les plus anciens d'abord : ceux qui attendent depuis le plus longtemps.
        orderBy: { updatedAt: "asc" },
        select: {
          id: true,
          nomClient: true,
          adresse: true,
          visites: {
            where: { statut: "REALISEE" },
            orderBy: { numero: "desc" },
            take: 1,
            select: { joursReparationEstimes: true },
          },
        },
      }),
      // Chevauchement de jours inclus avec la semaine affichée (terminés
      // compris : leur barre reste visible, teintée par etatChantier).
      prisma.chantier.findMany({
        where: {
          organisationId: user.organisationId,
          dateDebut: { lt: fenetre.fin },
          dateFin: { gte: fenetre.debut },
        },
        orderBy: { dateDebut: "asc" },
        include: chantierInclude,
      }),
      prisma.chantier.findMany({
        where: { organisationId: user.organisationId, termineLe: null },
        orderBy: { dateDebut: "asc" },
        include: chantierInclude,
      }),
      // Lignes du Gantt : les actifs + les inactifs encore affectés cette
      // semaine (sinon leur barre serait invisible).
      prisma.ouvrier.findMany({
        where: {
          organisationId: user.organisationId,
          OR: [
            { actif: true },
            {
              affectations: {
                some: {
                  chantier: {
                    dateDebut: { lt: fenetre.fin },
                    dateFin: { gte: fenetre.debut },
                  },
                },
              },
            },
          ],
        },
        orderBy: { nom: "asc" },
        select: {
          id: true,
          nom: true,
          actif: true,
          absences: {
            where: {
              dateDebut: { lt: fenetre.fin },
              dateFin: { gte: fenetre.debut },
            },
            select: { dateDebut: true, dateFin: true, motif: true },
          },
        },
      }),
    ]);

  /* ── Assemblage du Gantt (tout précalculé, le composant ne fait qu'afficher) ── */

  const colonnes: JourColonne[] = jours.map((j, i) => ({
    cle: dateVersParamJour(j),
    label: formatJourCourtFr(j),
    aujourdhui: i === colAujourdhui,
    weekend: i >= 5,
  }));

  const lignes: LigneOuvrier[] = ouvriers.map((o) => {
    const siens = chantiersSemaine.filter((c) =>
      c.affectations.some((a) => a.ouvrier.id === o.id),
    );

    const barres: BarreChantier[] = siens
      .map((c) => {
        const debut = indexJour(c.dateDebut);
        const fin = indexJour(c.dateFin);
        const coEquipiers = c.affectations
          .filter((a) => a.ouvrier.id !== o.id)
          .map((a) => a.ouvrier.nom);
        return {
          chantierId: c.id,
          nomClient: c.dossier.nomClient,
          title:
            `Chez ${c.dossier.nomClient} — travaux ${periodeJoursFr(c.dateDebut, c.dateFin)}` +
            (coEquipiers.length > 0 ? ` · avec ${coEquipiers.join(", ")}` : ""),
          colDebut: Math.max(0, debut),
          colFin: Math.min(6, fin),
          clampGauche: debut < 0,
          clampDroite: fin > 6,
          etat: etatChantier(c, maintenant),
          conflit: false,
          lane: 0,
        };
      })
      .sort((a, b) => a.colDebut - b.colDebut || b.colFin - a.colFin);

    // Lanes (empilement) : première lane libre dont la dernière barre finit
    // avant le début de celle-ci. Deux barres empilées = surbooking → conflit.
    const finParLane: number[] = [];
    for (const barre of barres) {
      let lane = finParLane.findIndex((fin) => fin < barre.colDebut);
      if (lane === -1) {
        lane = finParLane.length;
        finParLane.push(barre.colFin);
      } else {
        finParLane[lane] = barre.colFin;
      }
      barre.lane = lane;
    }
    for (const a of barres) {
      for (const b of barres) {
        if (a !== b && a.colDebut <= b.colFin && b.colDebut <= a.colFin) {
          a.conflit = true;
          a.title += " · ⚠ chevauche un autre chantier";
          break;
        }
      }
    }

    return {
      ouvrierId: o.id,
      nom: o.nom,
      actif: o.actif,
      lanes: Math.max(1, finParLane.length),
      barres,
      absences: o.absences.map((a) => ({
        colDebut: Math.max(0, indexJour(a.dateDebut)),
        colFin: Math.min(6, indexJour(a.dateFin)),
        title: `Absent ${periodeJoursFr(a.dateDebut, a.dateFin)}${a.motif ? ` (${a.motif})` : ""}`,
      })),
    };
  });

  const urlSemaine = (delta: number) =>
    `/app/chantiers?date=${dateVersParamJour(ajouterJoursLocal(fenetre.debut, delta))}`;

  return (
    <div className="space-y-6">
      {/* Impression : seul le Gantt sort (paysage) — le reste est masqué. */}
      <style>{`@media print { @page { size: A4 landscape; margin: 10mm; } }`}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Chantiers</h1>
          <p className="text-sm text-neutral-500">
            Planification des travaux après expertise — {enCours.length} en
            cours ou à venir.
          </p>
        </div>
        <Link href="/app/chantiers/nouveau" className={boutonClasses("primaire")}>
          <Plus className="size-4" aria-hidden="true" />
          Nouveau chantier
        </Link>
      </div>

      {/* ── Vue semaine ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-base font-medium text-neutral-900">
            Planning chantiers — semaine {periodeJoursFr(jours[0], jours[6])}
          </h2>
          <div className="flex items-center gap-1.5 print:hidden">
            <Link
              href={urlSemaine(-7)}
              aria-label="Semaine précédente"
              className={boutonClasses("secondaire", "sm")}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/app/chantiers" className={boutonClasses("secondaire", "sm")}>
              Aujourd&apos;hui
            </Link>
            <Link
              href={urlSemaine(7)}
              aria-label="Semaine suivante"
              className={boutonClasses("secondaire", "sm")}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
            <SelecteurDate valeur={dateVersParamJour(dateRef)} />
            <span className="mx-1 h-5 w-px bg-neutral-200" aria-hidden="true" />
            <Link
              href={`/app/chantiers/fiches?date=${dateVersParamJour(fenetre.debut)}`}
              className={boutonClasses("secondaire", "sm")}
            >
              <FileText className="size-4" aria-hidden="true" />
              Fiches de la semaine
            </Link>
            <PrintButton label="Imprimer" variante="secondaire" />
          </div>
        </div>

        {lignes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-500">
            Aucun ouvrier —{" "}
            <Link
              href="/app/parametres/ouvriers"
              className="font-medium text-primary-800 hover:underline"
            >
              ajoutez l&apos;équipe dans Paramètres → Ouvriers
            </Link>{" "}
            pour planifier des chantiers.
          </p>
        ) : (
          <GanttSemaine jours={colonnes} lignes={lignes} />
        )}
      </section>

      {/* ── File « à planifier » ─────────────────────────────────── */}
      <section className="space-y-3 print:hidden">
        <h2 className="flex items-center gap-2 font-display text-base font-medium text-neutral-900">
          Prêts pour travaux
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 tabular-nums">
            {aPlanifier.length}
          </span>
        </h2>
        {aPlanifier.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-500">
            Aucun dossier en attente de planification — tout est en chantier ou
            encore en expertise.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {aPlanifier.map((d) => {
              const jours = d.visites[0]?.joursReparationEstimes ?? null;
              return (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-3 shadow-xs"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/app/dossiers/${d.id}`}
                      className="block truncate text-sm font-semibold text-neutral-900 hover:text-primary-800 hover:underline"
                    >
                      {d.nomClient}
                    </Link>
                    <p className="truncate text-xs text-neutral-500">
                      {d.adresse}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {jours != null
                        ? `${jours} j de réparation estimés`
                        : "Durée à estimer"}
                    </p>
                  </div>
                  <Link
                    href={`/app/chantiers/nouveau?dossier=${d.id}`}
                    className={boutonClasses("secondaire", "sm", "shrink-0")}
                  >
                    <CalendarPlus className="size-4" aria-hidden="true" />
                    Planifier
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Chantiers en cours & à venir ─────────────────────────── */}
      <section className="space-y-3 print:hidden">
        <h2 className="font-display text-base font-medium text-neutral-900">
          En cours &amp; à venir
        </h2>
        {enCours.length === 0 ? (
          <EmptyState
            titre="Aucun chantier planifié"
            description="Créez le premier chantier depuis un dossier « Prêt pour travaux » : dates, ouvriers, travaux à réaliser."
            action={
              aPlanifier.length > 0 ? (
                <Link
                  href="/app/chantiers/nouveau"
                  className={boutonClasses("primaire")}
                >
                  <HardHat className="size-4" aria-hidden="true" />
                  Nouveau chantier
                </Link>
              ) : undefined
            }
          />
        ) : (
          <TableChantiers chantiers={enCours} maintenant={maintenant} />
        )}
      </section>
    </div>
  );
}

function TableChantiers({
  chantiers,
  maintenant,
}: {
  chantiers: ChantierListe[];
  maintenant: Date;
}) {
  return (
    <>
      {/* Mobile : cartes empilées (mêmes données) — table dès sm. */}
      <div className="space-y-2 sm:hidden">
        {chantiers.map((c) => (
          <Link
            key={c.id}
            href={`/app/chantiers/${c.id}`}
            className="block space-y-2 rounded-lg border border-neutral-200 bg-white p-3 shadow-xs transition-colors hover:border-primary-300"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold text-neutral-900">
                  {c.dossier.nomClient}
                </p>
                <p className="truncate text-xs text-neutral-500">
                  {c.dossier.adresse}
                </p>
              </div>
              <span className="shrink-0">
                <EtatChantierBadge etat={etatChantier(c, maintenant)} />
              </span>
            </div>
            <div className="space-y-0.5 border-t border-neutral-100 pt-2 text-xs text-neutral-600">
              <p className="tabular-nums">
                {periodeJoursFr(c.dateDebut, c.dateFin)} · {dureeEnJours(c)} j
              </p>
              <p className="truncate">
                {c.affectations.map((a) => a.ouvrier.nom).join(", ") ||
                  "Aucun ouvrier affecté"}
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
          <Th>Période</Th>
          <Th className="text-right">Durée</Th>
          <Th>Ouvriers</Th>
          <Th>État</Th>
        </tr>
      </thead>
      <tbody>
        {chantiers.map((c) => {
          const nbJours = dureeEnJours(c);
          return (
            <Tr key={c.id}>
              <Td className="font-medium">
                <Link
                  href={`/app/chantiers/${c.id}`}
                  className="text-primary-800 hover:underline"
                >
                  {c.dossier.nomClient}
                </Link>
                <span className="block max-w-56 truncate text-xs text-neutral-500">
                  {c.dossier.adresse}
                </span>
              </Td>
              <Td className="text-neutral-600 tabular-nums">
                {periodeJoursFr(c.dateDebut, c.dateFin)}
              </Td>
              <Td className="text-right text-neutral-600 tabular-nums">
                {nbJours} j
              </Td>
              <Td className="max-w-48 text-neutral-600">
                <span className="block truncate">
                  {c.affectations.map((a) => a.ouvrier.nom).join(", ") || "—"}
                </span>
              </Td>
              <Td>
                <EtatChantierBadge etat={etatChantier(c, maintenant)} />
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
