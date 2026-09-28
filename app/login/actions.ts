"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// `saisie` re-remplit l'email après une erreur (React réinitialise les inputs
// non contrôlés après l'action) — le mot de passe n'est JAMAIS renvoyé.
export type LoginState = {
  error: string | null;
  saisie: { email: string } | null;
};

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email et mot de passe requis.", saisie: { email } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Identifiants invalides.", saisie: { email } };
  }

  // redirect() throws internally — must be called outside any try/catch.
  redirect("/app");
}
