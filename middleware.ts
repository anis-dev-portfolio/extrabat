import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on all routes except true static assets — UNIQUEMENT des chemins
    // littéraux ancrés en DÉBUT ET FIN (chaque alternative se termine par $
    // ou par un `/` de segment), JAMAIS de motif par extension ni de préfixe
    // non ancré : un segment dynamique peut se terminer en .png
    // (/app/dossiers/<id>.png) et sauterait alors le middleware, seul
    // endroit qui purge les headers de confiance x-supabase-*
    // (lib/supabase/middleware.ts) → usurpation d'identité triviale. Sans le
    // `$` de fin, un préfixe comme `favicon\.ico` matcherait aussi
    // `/favicon.icoXXX` — même classe de bug via un chemin non prévu au lieu
    // d'une extension. sw.js est revérifié par Chrome à CHAQUE navigation en
    // bypassant le cache HTTP : sans cette exclusion, chaque navigation
    // déclenche un passage middleware (et sa vérification de session) fantôme.
    "/((?!_next/static|_next/image|favicon\\.ico$|sw\\.js$|manifest\\.webmanifest$|icones/|splash/|isobat-marque\\.png$|icon\\.svg$).*)",
  ],
};
