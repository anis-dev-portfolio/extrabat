import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { messageMutationsBloquees, mutationsBloquees } from "@/lib/abonnement";

// Guard HTTP des routes d'ingestion OUVRIER — miroir exact de
// garderConducteur (app/api/visites/[id]/garde.ts) : réponse JSON (jamais de
// redirect()), Origin obligatoire, coupure abonnement en 403. En plus du
// rôle, exige la fiche Ouvrier liée ACTIVE — la désactivation douce coupe la
// signature immédiatement.
export type OuvrierGarde = {
  user: CurrentUser;
  ouvrier: { id: string; nom: string };
};

export async function garderOuvrier(
  req: Request,
): Promise<OuvrierGarde | { reponse: NextResponse }> {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) {
    return {
      reponse: NextResponse.json(
        { error: "Origine non autorisée." },
        { status: 403 },
      ),
    };
  }

  const user = await getCurrentUser();
  if (!user || user.role !== "OUVRIER") {
    return {
      reponse: NextResponse.json(
        {
          error:
            "Session expirée : rouvrez l'application pour vous reconnecter, puis réessayez.",
        },
        { status: 401 },
      ),
    };
  }

  const ouvrier = await prisma.ouvrier.findFirst({
    where: { userId: user.id, organisationId: user.organisationId, actif: true },
    select: { id: true, nom: true },
  });
  if (!ouvrier) {
    return {
      reponse: NextResponse.json(
        { error: "Votre accès terrain est désactivé." },
        { status: 403 },
      ),
    };
  }

  // Abonnement suspendu/résilié → lecture seule : la signature est une
  // MUTATION, même coupure que requireRoleActif côté Server Actions.
  if (mutationsBloquees(user.organisation)) {
    return {
      reponse: NextResponse.json(
        { error: messageMutationsBloquees(user.role) },
        { status: 403 },
      ),
    };
  }

  return { user, ouvrier };
}
