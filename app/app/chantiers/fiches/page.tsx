import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dureeEnJours, periodeJoursFr } from "@/lib/chantiers";
import {
  ajouterJoursLocal,
  dateVersParamJour,
  fenetreSemaine,
  parseParamJour,
} from "@/lib/planning";
import { formatDateTimeFr } from "@/lib/format";
import { urlSigneeLectureCachee } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui/empty-state";
import { PrintButton } from "@/components/ui/print-button";
import { cn } from "@/lib/ui";
import {
  FicheOuvrier,
  type ChantierPourFiche,
  type OrganisationFiche,
} from "../fiche-ouvrier";

// Validité des URLs signées de lecture : 1 h, le temps de consulter/imprimer.
const LECTURE_EXPIRES_IN = 3600;

export const metadata: Metadata = { title: "Fiches ouvrier" };

// Fiches ouvrier de la semaine : UNE page par ouvrier, listant ses chantiers
// NON TERMINÉS qui chevauchent la semaine (une fiche est un ordre de travail,
// pas une archive). Impression en lot (toutes) ou individuelle (?ouvrier=).
export default async function FichesSemainePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; ouvrier?: string }>;
}) {
  const user = await requireRole(BACK_OFFICE_ROLES);
  const sp = await searchParams;

  const fenetre = fenetreSemaine(parseParamJour(sp.date) ?? new Date());
  const dernierJour = ajouterJoursLocal(fenetre.debut, 6);
  const titre = `Semaine ${periodeJoursFr(fenetre.debut, dernierJour)}`;

  const [chantiers, logoSrc] = await Promise.all([
    prisma.chantier.findMany({
      where: {
        organisationId: user.organisationId,
        termineLe: null,
        dateDebut: { lt: fenetre.fin },
        dateFin: { gte: fenetre.debut },
      },
      orderBy: { dateDebut: "asc" },
      include: {
        dossier: {
          select: {
            nomClient: true,
            adresse: true,
            telephone: true,
            infosAcces: true,
          },
        },
        affectations: {
          include: {
            ouvrier: { select: { id: true, nom: true, telephone: true } },
          },
          orderBy: { ouvrier: { nom: "asc" } },
        },
      },
    }),
    urlSigneeLectureCachee(user.organisation.logoUrl, LECTURE_EXPIRES_IN),
  ]);

  // Regroupement par ouvrier : chaque ouvrier affecté reçoit SA fiche avec
  // ses chantiers de la semaine en ordre chronologique.
  const parOuvrier = new Map<
    string,
    {
      ouvrier: { id: string; nom: string; telephone: string | null };
      chantiers: ChantierPourFiche[];
    }
  >();
  for (const c of chantiers) {
    for (const { ouvrier } of c.affectations) {
      const entree = parOuvrier.get(ouvrier.id) ?? { ouvrier, chantiers: [] };
      entree.chantiers.push({
        id: c.id,
        periode: periodeJoursFr(c.dateDebut, c.dateFin),
        nbJours: dureeEnJours(c),
        nomClient: c.dossier.nomClient,
        adresse: c.dossier.adresse,
        telephone: c.dossier.telephone,
        infosAcces: c.dossier.infosAcces,
        coEquipiers: c.affectations
          .filter((a) => a.ouvrier.id !== ouvrier.id)
          .map((a) => a.ouvrier.nom),
      });
      parOuvrier.set(ouvrier.id, entree);
    }
  }

  const toutes = [...parOuvrier.values()].sort((a, b) =>
    a.ouvrier.nom.localeCompare(b.ouvrier.nom, "fr"),
  );
  const fiches = sp.ouvrier
    ? toutes.filter((f) => f.ouvrier.id === sp.ouvrier)
    : toutes;

  const organisation: OrganisationFiche = {
    nom: user.organisation.nom,
    logoSrc,
    coordonnees: [
      user.organisation.adresse,
      user.organisation.siret ? `SIRET ${user.organisation.siret}` : null,
    ].filter((v): v is string => Boolean(v)),
  };

  const urlBase = `/app/chantiers/fiches?date=${dateVersParamJour(fenetre.debut)}`;
  const genereLe = formatDateTimeFr(new Date());

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <Link
              href={`/app/chantiers?date=${dateVersParamJour(fenetre.debut)}`}
              className="inline-flex items-center gap-1 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              Chantiers
            </Link>
            <h1 className="text-xl font-bold tracking-tight">
              Fiches ouvrier — {titre.toLowerCase()}
            </h1>
            <p className="text-sm text-neutral-500">
              Une page par ouvrier. L&apos;impression sort toutes les fiches
              affichées d&apos;un coup.
            </p>
          </div>
          {fiches.length > 0 && <PrintButton />}
        </div>

        {toutes.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-neutral-500">Imprimer :</span>
            <FiltreOuvrier href={urlBase} actif={!sp.ouvrier}>
              Toutes ({toutes.length})
            </FiltreOuvrier>
            {toutes.map((f) => (
              <FiltreOuvrier
                key={f.ouvrier.id}
                href={`${urlBase}&ouvrier=${f.ouvrier.id}`}
                actif={sp.ouvrier === f.ouvrier.id}
              >
                {f.ouvrier.nom}
              </FiltreOuvrier>
            ))}
          </div>
        )}
      </div>

      {fiches.length === 0 ? (
        <EmptyState
          titre="Aucune fiche pour cette semaine"
          description="Aucun chantier (non terminé) ne chevauche la semaine affichée — planifiez des chantiers depuis la page Chantiers."
        />
      ) : (
        <div className="space-y-6">
          {fiches.map((f) => (
            <div key={f.ouvrier.id} className="break-after-page last:break-after-auto">
              <FicheOuvrier
                organisation={organisation}
                titre={titre}
                ouvrier={f.ouvrier}
                chantiers={f.chantiers}
                genereLe={genereLe}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FiltreOuvrier({
  href,
  actif,
  children,
}: {
  href: string;
  actif: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-2.5 py-0.5 font-medium transition-colors",
        actif
          ? "border-primary-300 bg-primary-50 text-primary-800"
          : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100",
      )}
    >
      {children}
    </Link>
  );
}
