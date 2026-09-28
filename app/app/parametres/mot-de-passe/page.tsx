import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EnteteParametres } from "../entete";
import { MotDePasseForm } from "./form";

export const metadata: Metadata = { title: "Mot de passe" };

export default async function MotDePassePage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <EnteteParametres
        titre="Mot de passe"
        description={`Compte ${user.email}.`}
      />

      <Card>
        <CardHeader titre="Changer le mot de passe" />
        <CardBody>
          <MotDePasseForm />
        </CardBody>
      </Card>
    </div>
  );
}
