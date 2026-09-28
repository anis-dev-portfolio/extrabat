import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, ChevronLeft } from "lucide-react";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { visiteLabel } from "@/lib/metier";
import { formatPlageDateTimeFr } from "@/lib/format";
import { boutonClasses } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SaisirForm } from "./form";
import { titreDossier } from "../titre";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return titreDossier(id, "Saisir le compte-rendu");
}

export default async function SaisirPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole(BACK_OFFICE_ROLES);

  // Les 2 requêtes ne dépendent que de params.id : parallélisées. La visite
  // porte son PROPRE scoping org (elle ne peut plus s'appuyer sur le check
  // préalable du dossier).
  const [dossier, visite] = await Promise.all([
    prisma.dossier.findFirst({
      where: { id, organisationId: user.organisationId },
      select: { id: true, nomClient: true, adresse: true },
    }),
    prisma.visite.findFirst({
      where: {
        dossierId: id,
        statut: "PLANIFIEE",
        dossier: { organisationId: user.organisationId },
      },
      orderBy: { numero: "desc" },
      include: { conducteur: { select: { nom: true } } },
    }),
  ]);
  if (!dossier) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="space-y-1">
        <Link
          href={`/app/dossiers/${dossier.id}`}
          className="inline-flex items-center gap-1 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Dossier
        </Link>
        <h1 className="text-xl font-bold tracking-tight">
          Saisir le compte-rendu
        </h1>
        <p className="text-sm text-neutral-500">
          {dossier.nomClient} — {dossier.adresse}
        </p>
      </div>

      {!visite ? (
        <EmptyState
          titre="Aucune visite planifiée"
          description="Ce dossier n'a pas de visite à saisir : planifiez-en une d'abord."
          action={
            <Link
              href={`/app/dossiers/${dossier.id}/planifier?retour=dossier`}
              className={boutonClasses("primaire")}
            >
              <CalendarPlus className="size-4" aria-hidden="true" />
              Planifier une visite
            </Link>
          }
        />
      ) : (
        <>
          <Card>
            <CardBody className="text-sm">
              <p className="font-medium text-neutral-900">
                {visiteLabel(visite.numero)}
              </p>
              <p className="text-neutral-500 tabular-nums">
                Prévue le{" "}
                {formatPlageDateTimeFr(visite.datePlanifiee, visite.dureeMinutes)}{" "}
                · Conducteur : {visite.conducteur.nom}
              </p>
            </CardBody>
          </Card>
          <p className="text-xs text-neutral-500">
            Saisie de dépannage côté bureau — c&apos;est normalement{" "}
            {visite.conducteur.nom} qui remplit ce compte-rendu depuis son
            téléphone. À l&apos;enregistrement, la visite passe « réalisée »
            (horodatée) et le dossier remonte en réception.
          </p>
          <SaisirForm dossierId={dossier.id} />
        </>
      )}
    </div>
  );
}
