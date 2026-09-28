import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin, BUCKET_SINISTRES } from "@/lib/supabase/admin";

// URLs signées de LECTURE des photos des visites RÉALISÉES du conducteur
// courant — consommé par le préchargement hors-ligne (mes-visites), qui va
// ensuite chercher chaque image pour la déposer dans le cache "photos-storage"
// du service worker. LECTURE pure : garde rôle nue en JSON (jamais de
// redirect), SANS coupure abonnement — contrairement aux routes d'ingestion
// qui passent par garderConducteur (mutations).

// Population bornée : les visites réalisées les plus récentes du conducteur
// (même ordre de grandeur que le préchargement des fiches à faire), avec un
// plafond global de photos par lot de signature.
const MAX_VISITES = 20;
const MAX_PHOTOS = 120;

// Validité alignée sur les vignettes de la fiche visite (7 jours,
// cf. app/app/visites/[id]/page.tsx).
const LECTURE_EXPIRES_IN = 7 * 24 * 3600;

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "CONDUCTEUR") {
    return NextResponse.json(
      {
        error:
          "Session expirée : rouvrez l'application pour vous reconnecter.",
      },
      { status: 401 },
    );
  }

  // Double scoping : assignation au conducteur + organisation.
  const visites = await prisma.visite.findMany({
    where: {
      conducteurId: user.id,
      dossier: { organisationId: user.organisationId },
      statut: "REALISEE",
      photos: { some: {} },
    },
    orderBy: { dateRealisee: "desc" },
    take: MAX_VISITES,
    select: {
      photos: { select: { chemin: true }, orderBy: { createdAt: "asc" } },
    },
  });

  const chemins = visites
    .flatMap((v) => v.photos.map((p) => p.chemin))
    .slice(0, MAX_PHOTOS);
  if (chemins.length === 0) return NextResponse.json({ urls: [] });

  try {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(BUCKET_SINISTRES)
      .createSignedUrls(chemins, LECTURE_EXPIRES_IN);
    if (error || !data) throw error ?? new Error("réponse vide");
    const urls = data
      .map((d) => d.signedUrl)
      .filter((u): u is string => Boolean(u));
    return NextResponse.json({ urls });
  } catch (err) {
    // Best-effort : le préchargement se contente d'un lot vide.
    console.error("photos-hors-ligne", err);
    return NextResponse.json({ urls: [] });
  }
}
