"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleActif } from "@/lib/auth";
import { messageFromError } from "@/lib/erreurs";

export type AffichageState = { error: string | null; ok: boolean };

// Valeurs autorisées — MIROIR des whitelists de la page Dossiers :
// vue (app/app/dossiers/filtres.tsx : FiltresDossiers["vue"]) et tri
// (app/app/dossiers/page.tsx : TRIS_LISTE). Le serveur reste le juge final.
export const VUES_DOSSIERS = ["kanban", "liste"] as const;
export const TRIS_DOSSIERS = ["priorite", "recent", "creation", "nom"] as const;

// Préférences d'affichage du back-office : vue (kanban/liste) et tri par défaut
// de la page Dossiers, appliqués quand l'URL ne les précise pas.
export async function modifierAffichage(
  _prev: AffichageState,
  formData: FormData,
): Promise<AffichageState> {
  const garde = await requireRoleActif(["ASSISTANTE", "ADMIN"]);
  if (!garde.ok) return { error: garde.error, ok: false };
  const { user } = garde;

  const vue = String(formData.get("vueDossiersDefaut") ?? "");
  const tri = String(formData.get("triDossiersDefaut") ?? "");

  if (!(VUES_DOSSIERS as readonly string[]).includes(vue)) {
    return { error: "Vue par défaut invalide.", ok: false };
  }
  if (!(TRIS_DOSSIERS as readonly string[]).includes(tri)) {
    return { error: "Tri par défaut invalide.", ok: false };
  }

  try {
    await prisma.organisation.update({
      where: { id: user.organisationId },
      data: { vueDossiersDefaut: vue, triDossiersDefaut: tri },
    });
  } catch (e) {
    return { error: messageFromError(e), ok: false };
  }

  revalidatePath("/app/parametres/affichage");
  revalidatePath("/app/dossiers");
  return { error: null, ok: true };
}
