import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { urlSigneeLectureCachee } from "@/lib/supabase/admin";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Marque } from "@/components/ui/marque";
import { EnteteParametres } from "../entete";
import { OrganisationForm } from "./form";

export const metadata: Metadata = { title: "Organisation" };

export default async function OrganisationPage() {
  const user = await requireRole(["ASSISTANTE", "ADMIN"]);

  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: user.organisationId },
    select: {
      nom: true,
      adresse: true,
      siret: true,
      logoUrl: true,
      telephone: true,
      emailContact: true,
      siteWeb: true,
      assuranceDecennale: true,
      mentionsLegales: true,
    },
  });
  // URL signée de lecture (bucket privé), best-effort : sans logo on retombe
  // sur la marque ISOBAT. Cachée (TTL < expiration) : un nouveau logo change
  // de chemin, donc de clé — pas d'URL périmée servie.
  const logoSrc = await urlSigneeLectureCachee(organisation.logoUrl, 3600);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <EnteteParametres
        titre="Identité & coordonnées"
        description="Ces informations apparaissent sur le compte-rendu imprimable remis au client."
      />

      <Card>
        <CardHeader titre="Coordonnées & logo" />
        <CardBody>
          <div className="mb-5 flex items-center gap-4">
            {logoSrc ? (
              // Image distante signée (durée 1 h) : <img> simple, pas
              // d'optimisation Next sur une URL éphémère.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoSrc}
                alt={`Logo ${organisation.nom}`}
                className="size-16 rounded-lg border border-neutral-200 bg-white object-contain p-1.5"
              />
            ) : (
              <span className="flex size-16 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50">
                <Marque mono className="h-8 w-auto text-neutral-300" />
              </span>
            )}
            <div className="text-sm text-neutral-500">
              <p className="font-medium text-neutral-800">Logo actuel</p>
              <p>
                {organisation.logoUrl
                  ? "Stocké dans le bucket privé, servi via URL signée."
                  : "Aucun logo — la marque ISOBAT est utilisée par défaut."}
              </p>
            </div>
          </div>

          <OrganisationForm
            valeurs={{
              nom: organisation.nom,
              adresse: organisation.adresse ?? "",
              siret: organisation.siret ?? "",
              telephone: organisation.telephone ?? "",
              emailContact: organisation.emailContact ?? "",
              siteWeb: organisation.siteWeb ?? "",
              assuranceDecennale: organisation.assuranceDecennale ?? "",
              mentionsLegales: organisation.mentionsLegales ?? "",
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
