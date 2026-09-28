import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EnteteParametres } from "../entete";
import { ReglesForm } from "./form";

export const metadata: Metadata = { title: "Règles de classement" };

export default async function ReglesParametresPage() {
  const user = await requireRole(["ASSISTANTE", "ADMIN"]);

  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: user.organisationId },
    select: { seuilHumidite: true, delaiSechageJours: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <EnteteParametres
        titre="Règles de classement"
        description="Le seuil d'humidité et le délai de séchage qui rythment vos contre-visites."
      />

      <Card>
        <CardHeader titre="Classement après visite & séchage" />
        <CardBody>
          <ReglesForm
            valeurs={{
              seuilHumidite: organisation.seuilHumidite,
              delaiSechageJours: organisation.delaiSechageJours,
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
