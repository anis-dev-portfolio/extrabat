"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleActif } from "@/lib/auth";
import { AMPLITUDES_PLAGE, heureVersMinutes, validerPlage } from "@/lib/planning";
import { messageFromError } from "@/lib/erreurs";

export type DefautsVisitesState = { error: string | null; ok: boolean };

// Défauts de planification de l'organisation : durée par défaut d'une visite
// (copiée dans la Visite à la création, jamais recalculée) et bornes
// d'affichage du planning (fallback pour un conducteur sans horaires).
export async function modifierDefautsVisites(
  _prev: DefautsVisitesState,
  formData: FormData,
): Promise<DefautsVisitesState> {
  const garde = await requireRoleActif(["ASSISTANTE", "ADMIN"]);
  if (!garde.ok) return { error: garde.error, ok: false };
  const { user } = garde;

  const duree = Number(formData.get("dureeVisiteDefautMinutes") ?? 0);
  const heureOuverture = heureVersMinutes(
    String(formData.get("heureOuverture") ?? ""),
  );
  const heureFermeture = heureVersMinutes(
    String(formData.get("heureFermeture") ?? ""),
  );

  if (!AMPLITUDES_PLAGE.includes(duree)) {
    return { error: "Amplitude de plage par défaut invalide.", ok: false };
  }
  if (heureOuverture === null || heureFermeture === null) {
    return { error: "Heures invalides (format HH:MM).", ok: false };
  }
  const invalide = validerPlage({
    heureDebut: heureOuverture,
    heureFin: heureFermeture,
  });
  if (invalide) return { error: invalide, ok: false };

  try {
    await prisma.organisation.update({
      where: { id: user.organisationId },
      data: {
        dureeVisiteDefautMinutes: duree,
        heureOuverture,
        heureFermeture,
      },
    });
  } catch (e) {
    return { error: messageFromError(e), ok: false };
  }

  revalidatePath("/app/parametres/visites");
  return { error: null, ok: true };
}
