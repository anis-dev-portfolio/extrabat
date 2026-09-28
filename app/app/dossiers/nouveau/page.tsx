import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { Card, CardBody } from "@/components/ui/card";
import { NouveauDossierForm } from "./form";

export const metadata: Metadata = { title: "Nouveau dossier" };

export default async function NouveauDossierPage() {
  await requireRole(BACK_OFFICE_ROLES);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="space-y-1">
        <Link
          href="/app/dossiers"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Dossiers
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Nouveau dossier</h1>
        <p className="text-sm text-neutral-500">
          Le dossier démarre au statut « Nouveau » — la planification de la
          première visite se fait depuis sa fiche.
        </p>
      </div>
      <Card>
        <CardBody>
          <NouveauDossierForm />
        </CardBody>
      </Card>
    </div>
  );
}
