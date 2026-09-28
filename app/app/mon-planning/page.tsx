import type { Metadata } from "next";
import Link from "next/link";
import { CalendarOff, ChevronLeft, ChevronRight, HardHat } from "lucide-react";
import { requireOuvrier } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ajouterJoursLocal,
  dateVersParamJour,
  debutJourLocal,
  fenetreSemaine,
  parseDateJour,
} from "@/lib/planning";
import { finPlageExclusive, periodeJoursFr } from "@/lib/chantiers";
import { formatJourLongFr } from "@/lib/format";
import { boutonClasses } from "@/components/ui/button";
import { cn } from "@/lib/ui";

export const metadata: Metadata = { title: "Mon planning" };

// Planning personnel de l'ouvrier, en LECTURE SEULE : la semaine jour par
// jour, avec ses chantiers (affectations uniquement — jamais ceux de l'org)
// et ses absences. Navigation ±1 semaine par ?date=YYYY-MM-DD (minuit Paris,
// jamais l'heure du serveur). Select minimal : zéro champ financier.
export default async function MonPlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { user, ouvrier } = await requireOuvrier();
  const { date: dateParam } = await searchParams;

  const maintenant = new Date();
  const reference = (dateParam ? parseDateJour(dateParam) : null) ?? maintenant;
  const fenetre = fenetreSemaine(reference);
  const aujourdhui = debutJourLocal(maintenant).getTime();

  const [chantiers, absences] = await Promise.all([
    // Chevauchement de la fenêtre : dateDebut < fin ET dateFin >= debut
    // (bornes de jours INCLUSES côté chantier).
    prisma.chantier.findMany({
      where: {
        organisationId: user.organisationId,
        affectations: { some: { ouvrierId: ouvrier.id } },
        dateDebut: { lt: fenetre.fin },
        dateFin: { gte: fenetre.debut },
      },
      orderBy: { dateDebut: "asc" },
      select: {
        id: true,
        dateDebut: true,
        dateFin: true,
        termineLe: true,
        dossier: { select: { nomClient: true, adresse: true } },
      },
    }),
    prisma.absenceOuvrier.findMany({
      where: {
        ouvrierId: ouvrier.id,
        dateDebut: { lt: fenetre.fin },
        dateFin: { gte: fenetre.debut },
      },
      select: { id: true, dateDebut: true, dateFin: true, motif: true },
    }),
  ]);

  // 7 jours civils de la semaine, chacun avec ce qui le couvre.
  const jours = Array.from({ length: 7 }, (_, i) => {
    const debut = ajouterJoursLocal(fenetre.debut, i);
    const t = debut.getTime();
    return {
      debut,
      estAujourdhui: t === aujourdhui,
      chantiers: chantiers.filter(
        (c) =>
          c.dateDebut.getTime() <= t && t < finPlageExclusive(c).getTime(),
      ),
      absences: absences.filter(
        (a) =>
          a.dateDebut.getTime() <= t && t < finPlageExclusive(a).getTime(),
      ),
    };
  });

  const precedente = dateVersParamJour(ajouterJoursLocal(fenetre.debut, -7));
  const suivante = dateVersParamJour(ajouterJoursLocal(fenetre.debut, 7));
  const semaineCourante = fenetreSemaine(maintenant).debut.getTime() ===
    fenetre.debut.getTime();

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="font-display text-xl font-bold tracking-tight text-neutral-900">
          Mon planning
        </h1>
        <p className="text-sm text-neutral-500">
          Semaine{" "}
          {periodeJoursFr(fenetre.debut, ajouterJoursLocal(fenetre.debut, 6))}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/app/mon-planning?date=${precedente}`}
          className={boutonClasses("secondaire", "sm", "min-h-11")}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Précédente
        </Link>
        {!semaineCourante && (
          <Link
            href="/app/mon-planning"
            className={boutonClasses("fantome", "sm", "min-h-11")}
          >
            Cette semaine
          </Link>
        )}
        <Link
          href={`/app/mon-planning?date=${suivante}`}
          className={boutonClasses("secondaire", "sm", "min-h-11")}
        >
          Suivante
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <ol className="space-y-2">
        {jours.map((jour) => (
          <li
            key={jour.debut.toISOString()}
            className={cn(
              "rounded-lg border bg-white p-3 shadow-xs",
              jour.estAujourdhui
                ? "border-primary-300 ring-1 ring-primary-200"
                : "border-neutral-200",
            )}
          >
            <p
              className={cn(
                "text-xs font-semibold tracking-wide uppercase",
                jour.estAujourdhui ? "text-primary-700" : "text-neutral-500",
              )}
            >
              {formatJourLongFr(jour.debut)}
              {jour.estAujourdhui && " · aujourd'hui"}
            </p>

            {jour.chantiers.length === 0 && jour.absences.length === 0 ? (
              <p className="mt-1.5 text-sm text-neutral-400">—</p>
            ) : (
              <div className="mt-1.5 space-y-1.5">
                {jour.absences.map((a) => (
                  <p
                    key={a.id}
                    className="flex items-center gap-2 rounded-md bg-neutral-100 px-2.5 py-1.5 text-sm text-neutral-600"
                  >
                    <CalendarOff
                      className="size-4 shrink-0 text-neutral-400"
                      aria-hidden="true"
                    />
                    Absent{a.motif ? ` — ${a.motif}` : ""}
                  </p>
                ))}
                {jour.chantiers.map((c) => (
                  <Link
                    key={c.id}
                    href={`/app/mes-chantiers/${c.id}`}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                      c.termineLe
                        ? "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                        : "bg-primary-50 text-primary-900 hover:bg-primary-100",
                    )}
                  >
                    <HardHat
                      className={cn(
                        "size-4 shrink-0",
                        c.termineLe ? "text-neutral-400" : "text-primary-600",
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {c.dossier.nomClient}
                        {c.termineLe && " · terminé"}
                      </span>
                      <span className="block truncate text-xs opacity-80">
                        {c.dossier.adresse}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
