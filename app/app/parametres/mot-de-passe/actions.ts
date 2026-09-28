"use server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type MotDePasseState = { error: string | null; ok: boolean };

const LONGUEUR_MIN = 10;

// Change le mot de passe du compte CONNECTÉ via Supabase Auth (updateUser
// n'agit que sur la session courante — aucun risque de toucher un autre
// compte). Accessible à tous les rôles.
export async function changerMotDePasse(
  _prev: MotDePasseState,
  formData: FormData,
): Promise<MotDePasseState> {
  await requireUser();

  const motDePasse = String(formData.get("motDePasse") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (motDePasse.length < LONGUEUR_MIN) {
    return {
      error: `Le mot de passe doit faire au moins ${LONGUEUR_MIN} caractères.`,
      ok: false,
    };
  }
  if (motDePasse.length > 200) {
    return { error: "Le mot de passe est limité à 200 caractères.", ok: false };
  }
  if (motDePasse !== confirmation) {
    return { error: "Les deux mots de passe ne correspondent pas.", ok: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: motDePasse });

  if (error) {
    // Cas fréquent : nouveau mot de passe identique à l'ancien.
    if (error.code === "same_password") {
      return {
        error: "Le nouveau mot de passe doit être différent de l'actuel.",
        ok: false,
      };
    }
    console.error("Changement de mot de passe échoué :", error);
    return {
      error: "Le changement de mot de passe a échoué. Réessayez.",
      ok: false,
    };
  }

  return { error: null, ok: true };
}
