"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleActif } from "@/lib/auth";
import { dossiersBadgesTag, statsTag } from "@/lib/cache-tags";
import {
  SEUIL_HUMIDITE_MIN,
  SEUIL_HUMIDITE_MAX,
  DELAI_SECHAGE_MIN,
  DELAI_SECHAGE_MAX,
} from "@/lib/metier";
import { messageFromError } from "@/lib/erreurs";

export type ReglesState = { error: string | null; ok: boolean };

// Entier borné lu d'un FormData ; renvoie null si absent, non entier ou hors
// bornes (le message d'erreur est décidé par l'appelant).
function entierBorne(valeur: FormDataEntryValue | null, min: number, max: number) {
  const n = Number(valeur);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

// Règles métier personnalisables : seuil d'humidité (%) qui déclenche le
// classement « en attente de séchage » et délai (jours) conseillé avant la
// contre-visite. Mutation → requireRoleActif (rôle + abonnement actif). Le
// délai nourrit le comptage « À traiter » (mis en cache) : on invalide son tag
// pour que le badge et la page se recalculent immédiatement.
export async function modifierRegles(
  _prev: ReglesState,
  formData: FormData,
): Promise<ReglesState> {
  const garde = await requireRoleActif(["ASSISTANTE", "ADMIN"]);
  if (!garde.ok) return { error: garde.error, ok: false };
  const { user } = garde;

  const seuilHumidite = entierBorne(
    formData.get("seuilHumidite"),
    SEUIL_HUMIDITE_MIN,
    SEUIL_HUMIDITE_MAX,
  );
  const delaiSechageJours = entierBorne(
    formData.get("delaiSechageJours"),
    DELAI_SECHAGE_MIN,
    DELAI_SECHAGE_MAX,
  );

  if (seuilHumidite === null) {
    return {
      error: `Le seuil d'humidité doit être un entier entre ${SEUIL_HUMIDITE_MIN} et ${SEUIL_HUMIDITE_MAX} %.`,
      ok: false,
    };
  }
  if (delaiSechageJours === null) {
    return {
      error: `Le délai de séchage doit être un entier entre ${DELAI_SECHAGE_MIN} et ${DELAI_SECHAGE_MAX} jours.`,
      ok: false,
    };
  }

  try {
    await prisma.organisation.update({
      where: { id: user.organisationId },
      data: { seuilHumidite, delaiSechageJours },
    });
  } catch (e) {
    return { error: messageFromError(e), ok: false };
  }

  // Le délai déplace la frontière « À re-planifier » : recalcul immédiat du
  // badge + de la file, et rafraîchissement des vues qui affichent le taux/la
  // suggestion de classement.
  revalidateTag(dossiersBadgesTag(user.organisationId));
  // Les réglages (seuil, délai) entrent dans la clé ET le calcul des caches
  // Statistiques/CA — invalidation immédiate.
  revalidateTag(statsTag(user.organisationId));
  revalidatePath("/app/parametres/regles");
  revalidatePath("/app/dossiers");
  revalidatePath("/app/a-traiter");
  return { error: null, ok: true };
}
