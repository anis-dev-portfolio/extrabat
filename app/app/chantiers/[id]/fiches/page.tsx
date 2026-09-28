import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dureeEnJours, periodeJoursFr } from "@/lib/chantiers";
import { formatDateTimeFr } from "@/lib/format";
import { urlSigneeLectureCachee } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/ui/print-button";
import {
  FicheOuvrier,
  type ChantierPourFiche,
  type OrganisationFiche,
} from "../../fiche-ouvrier";
import { titreChantier } from "../titre";

const LECTURE_EXPIRES_IN = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return titreChantier(id, "Fiches ouvrier");
}

// Fiches d'UN chantier : une page par ouvrier affecté, ne portant que ce
// chantier — pratique pour un chantier ajouté après l'impression du lot de
// la semaine.
export default async function FichesChantierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole(BACK_OFFICE_ROLES);

  const [chantier, logoSrc] = await Promise.all([
    prisma.chantier.findFirst({
      where: { id, organisationId: user.organisationId },
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
  if (!chantier) notFound();

  const titre = `Travaux ${periodeJoursFr(chantier.dateDebut, chantier.dateFin)}`;
  const organisation: OrganisationFiche = {
    nom: user.organisation.nom,
    logoSrc,
    coordonnees: [
      user.organisation.adresse,
      user.organisation.siret ? `SIRET ${user.organisation.siret}` : null,
    ].filter((v): v is string => Boolean(v)),
  };
  const genereLe = formatDateTimeFr(new Date());

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="space-y-1">
          <Link
            href={`/app/chantiers/${chantier.id}`}
            className="inline-flex items-center gap-1 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Fiche chantier
          </Link>
          <h1 className="text-xl font-bold tracking-tight">
            Fiches ouvrier — {chantier.dossier.nomClient}
          </h1>
          <p className="text-sm text-neutral-500">
            Une page par ouvrier affecté ({chantier.affectations.length}).
          </p>
        </div>
        <PrintButton />
      </div>

      <div className="space-y-6">
        {chantier.affectations.map(({ ouvrier }) => {
          const fiche: ChantierPourFiche = {
            id: chantier.id,
            periode: periodeJoursFr(chantier.dateDebut, chantier.dateFin),
            nbJours: dureeEnJours(chantier),
            nomClient: chantier.dossier.nomClient,
            adresse: chantier.dossier.adresse,
            telephone: chantier.dossier.telephone,
            infosAcces: chantier.dossier.infosAcces,
            coEquipiers: chantier.affectations
              .filter((a) => a.ouvrier.id !== ouvrier.id)
              .map((a) => a.ouvrier.nom),
          };
          return (
            <div
              key={ouvrier.id}
              className="break-after-page last:break-after-auto"
            >
              <FicheOuvrier
                organisation={organisation}
                titre={titre}
                ouvrier={ouvrier}
                chantiers={[fiche]}
                genereLe={genereLe}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
