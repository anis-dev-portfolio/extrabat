import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chargerDispoOuvriers } from "@/lib/chantiers-data";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { creerChantier } from "../actions";
import { ChantierForm, type DossierOption } from "../chantier-form";

export const metadata: Metadata = { title: "Nouveau chantier" };

// Création de chantier : client cherché parmi les dossiers PRET_POUR_TRAVAUX
// (présélectionnable via ?dossier=, sinon barre de recherche), durée proposée
// depuis joursReparationEstimes de la dernière visite, affectation d'ouvriers
// avec signal de dispo en direct.
export default async function NouveauChantierPage({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string }>;
}) {
  const { dossier: dossierParam } = await searchParams;
  const user = await requireRole(BACK_OFFICE_ROLES);

  const [dossiers, ouvriers] = await Promise.all([
    prisma.dossier.findMany({
      where: {
        organisationId: user.organisationId,
        statut: "PRET_POUR_TRAVAUX",
      },
      // Les plus anciens d'abord : même ordre que la file « à planifier ».
      orderBy: { updatedAt: "asc" },
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
    }),
    chargerDispoOuvriers(user.organisationId),
  ]);

  const options: DossierOption[] = dossiers.map((d) => ({
    id: d.id,
    nomClient: d.nomClient,
    adresse: d.adresse,
    telephone: d.telephone,
    infosAcces: d.infosAcces,
    joursEstimes: d.visites[0]?.joursReparationEstimes ?? null,
    conclusion: d.visites[0]?.conclusion ?? null,
  }));

  // Présélection uniquement en arrivée ciblée (?dossier= depuis la fiche
  // dossier) — sinon le formulaire ouvre sur la recherche de client.
  const dossierInitialId =
    options.find((d) => d.id === dossierParam)?.id ?? "";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-1">
        <Link
          href="/app/chantiers"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Chantiers
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Nouveau chantier</h1>
        <p className="text-sm text-neutral-500">
          Le dossier passera « En chantier » et sortira du kanban.
        </p>
      </div>

      {options.length === 0 ? (
        <EmptyState
          titre="Aucun dossier prêt pour travaux"
          description="Un chantier se crée depuis un dossier classé « Prêt pour travaux ». Terminez d'abord le cycle d'expertise d'un dossier."
          action={
            <Link
              href="/app/dossiers"
              className="text-sm font-medium text-primary-800 hover:underline"
            >
              Voir les dossiers
            </Link>
          }
        />
      ) : (
        <Card>
          <CardBody>
            <ChantierForm
              action={creerChantier}
              dossiers={options}
              dossierInitialId={dossierInitialId}
              dossierFige={false}
              ouvriers={ouvriers}
              labelSubmit="Créer le chantier"
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
