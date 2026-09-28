import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dureeEnJours } from "@/lib/chantiers";
import { chargerDispoOuvriers } from "@/lib/chantiers-data";
import { dateVersParamJour } from "@/lib/planning";
import { Card, CardBody } from "@/components/ui/card";
import { modifierChantier } from "../../actions";
import { ChantierForm, type DossierOption } from "../../chantier-form";
import { titreChantier } from "../titre";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return titreChantier(id, "Modifier le chantier");
}

// Édition d'un chantier non terminé : mêmes champs qu'à la création, dossier
// figé. Le chantier édité est exclu de la détection de conflits.
export default async function ModifierChantierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole(BACK_OFFICE_ROLES);

  const chantier = await prisma.chantier.findFirst({
    where: { id, organisationId: user.organisationId },
    include: {
      dossier: {
        select: {
          id: true,
          nomClient: true,
          adresse: true,
          telephone: true,
          infosAcces: true,
          visites: {
            where: { statut: "REALISEE" },
            orderBy: { numero: "desc" },
            take: 1,
            select: { joursReparationEstimes: true, conclusion: true },
          },
        },
      },
      affectations: { select: { ouvrierId: true } },
    },
  });
  if (!chantier) notFound();
  // Un chantier terminé ne se modifie pas : rouvrir d'abord (fiche).
  if (chantier.termineLe) redirect(`/app/chantiers/${chantier.id}`);

  const ouvriers = await chargerDispoOuvriers(user.organisationId, chantier.id);

  const dossierOption: DossierOption = {
    id: chantier.dossier.id,
    nomClient: chantier.dossier.nomClient,
    adresse: chantier.dossier.adresse,
    telephone: chantier.dossier.telephone,
    infosAcces: chantier.dossier.infosAcces,
    joursEstimes: chantier.dossier.visites[0]?.joursReparationEstimes ?? null,
    conclusion: chantier.dossier.visites[0]?.conclusion ?? null,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-1">
        <Link
          href={`/app/chantiers/${chantier.id}`}
          className="inline-flex items-center gap-1 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Fiche chantier
        </Link>
        <h1 className="text-xl font-bold tracking-tight">
          Modifier le chantier — {chantier.dossier.nomClient}
        </h1>
      </div>

      <Card>
        <CardBody>
          <ChantierForm
            action={modifierChantier.bind(null, chantier.id)}
            dossiers={[dossierOption]}
            dossierInitialId={dossierOption.id}
            dossierFige
            ouvriers={ouvriers}
            valeursInitiales={{
              dateDebut: dateVersParamJour(chantier.dateDebut),
              nbJours: dureeEnJours(chantier),
              ouvrierIds: chantier.affectations.map((a) => a.ouvrierId),
            }}
            labelSubmit="Enregistrer"
          />
        </CardBody>
      </Card>
    </div>
  );
}
