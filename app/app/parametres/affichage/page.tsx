import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EnteteParametres } from "../entete";
import { AffichageForm } from "./form";

export const metadata: Metadata = { title: "Affichage" };

export default async function AffichageParametresPage() {
  const user = await requireRole(["ASSISTANTE", "ADMIN"]);

  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: user.organisationId },
    select: { vueDossiersDefaut: true, triDossiersDefaut: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <EnteteParametres
        titre="Préférences d'affichage"
        description="Le point de départ de la page Dossiers — chacun reste libre de basculer ensuite."
      />

      <Card>
        <CardHeader titre="Page Dossiers" />
        <CardBody>
          <AffichageForm
            valeurs={{
              vueDossiersDefaut: organisation.vueDossiersDefaut,
              triDossiersDefaut: organisation.triDossiersDefaut,
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
