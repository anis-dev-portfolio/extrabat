import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EnteteParametres } from "../entete";
import { DefautsVisitesForm } from "./form";

export const metadata: Metadata = { title: "Visites" };

export default async function VisitesParametresPage() {
  const user = await requireRole(["ASSISTANTE", "ADMIN"]);

  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: user.organisationId },
    select: {
      dureeVisiteDefautMinutes: true,
      heureOuverture: true,
      heureFermeture: true,
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <EnteteParametres
        titre="Visites"
        description="Défauts de planification — modifiables visite par visite au moment de planifier."
      />

      <Card>
        <CardHeader titre="Défauts de planification" />
        <CardBody>
          <DefautsVisitesForm
            valeurs={{
              dureeVisiteDefautMinutes: organisation.dureeVisiteDefautMinutes,
              heureOuverture: organisation.heureOuverture,
              heureFermeture: organisation.heureFermeture,
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
