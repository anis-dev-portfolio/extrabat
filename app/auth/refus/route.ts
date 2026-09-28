import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Accès refusé : un utilisateur authentifié mais NON autorisé (email absent de
// la liste MembreAutorise) est déconnecté ici, puis renvoyé vers /login avec un
// message. Route handler (et non Server Component) car il faut écrire les
// cookies de session pour la déconnexion.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(
    new URL("/login?erreur=non-autorise", request.url),
  );
}
