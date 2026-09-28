import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { messageMutationsBloquees, mutationsBloquees } from "@/lib/abonnement";

// Guard HTTP des routes d'ingestion conducteur. Contrairement aux pages, on
// répond en JSON (jamais de redirect()) : le client de rejeu hors-ligne doit
// pouvoir distinguer « session expirée » (refus affiché, relance manuelle
// après reconnexion) d'une panne réseau (rejouée automatiquement).
export async function garderConducteur(
  req: Request,
): Promise<{ user: CurrentUser } | { reponse: NextResponse }> {
  // Les Server Actions vérifiaient l'Origin nativement ; on conserve cette
  // défense (en plus des cookies SameSite) en passant sur des routes. Origin
  // ABSENT = rejet : ces routes ne sont appelées que par fetch() POST depuis
  // nos pages (et leur rejeu service worker), qui porte toujours l'en-tête —
  // un client qui l'omet n'est pas le nôtre.
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
  if (!user || user.role !== "CONDUCTEUR") {
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

  // Abonnement suspendu/résilié → lecture seule : ces routes sont des
  // MUTATIONS (compte-rendu, photo), même coupure que requireRoleActif côté
  // Server Actions. 403 et non 401 : le client de rejeu hors-ligne classe la
  // réponse en refus métier affiché (à ne PAS rejouer), pas en panne réseau.
  if (mutationsBloquees(user.organisation)) {
    return {
      reponse: NextResponse.json(
        { error: messageMutationsBloquees(user.role) },
        { status: 403 },
      ),
    };
  }

  return { user };
}
