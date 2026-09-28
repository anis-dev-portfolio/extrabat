import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Recherche instantanée dans le périmètre du conducteur : SES visites (org +
// assignation dans le where — le gating vit ici, pas dans l'UI), par nom
// client / adresse / téléphone du dossier. ILIKE %q% porté par l'index GIN
// trigram de Dossier. Endpoint JSON (pas une Server Action) : appelé en rafale
// par l'input débouncé, annulable via AbortController.
export type ResultatRecherche = {
  id: string;
  numero: number;
  statut: "PLANIFIEE" | "REALISEE";
  datePlanifiee: string;
  dureeMinutes: number;
  dateRealisee: string | null;
  tauxHumidite: number | null;
  nomClient: string;
  adresse: string;
};

const MAX_RESULTATS = 20;
const MAX_LONGUEUR_REQUETE = 100;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "CONDUCTEUR") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const q =
    new URL(request.url).searchParams.get("q")?.trim().slice(0, MAX_LONGUEUR_REQUETE) ??
    "";
  // En dessous de 2 caractères le trigram n'apporte rien et tout matche.
  if (q.length < 2) {
    return NextResponse.json({ resultats: [] satisfies ResultatRecherche[] });
  }

  const visites = await prisma.visite.findMany({
    where: {
      conducteurId: user.id,
      dossier: {
        organisationId: user.organisationId,
        OR: [
          { nomClient: { contains: q, mode: "insensitive" } },
          { adresse: { contains: q, mode: "insensitive" } },
          { telephone: { contains: q, mode: "insensitive" } },
        ],
      },
    },
    orderBy: { datePlanifiee: "desc" },
    take: MAX_RESULTATS,
    select: {
      id: true,
      numero: true,
      statut: true,
      datePlanifiee: true,
      dureeMinutes: true,
      dateRealisee: true,
      tauxHumidite: true,
      dossier: { select: { nomClient: true, adresse: true } },
    },
  });

  const resultats: ResultatRecherche[] = visites.map((v) => ({
    id: v.id,
    numero: v.numero,
    statut: v.statut,
    datePlanifiee: v.datePlanifiee.toISOString(),
    dureeMinutes: v.dureeMinutes,
    dateRealisee: v.dateRealisee?.toISOString() ?? null,
    tauxHumidite: v.tauxHumidite,
    nomClient: v.dossier.nomClient,
    adresse: v.dossier.adresse,
  }));

  return NextResponse.json(
    { resultats },
    { headers: { "Cache-Control": "no-store" } },
  );
}
