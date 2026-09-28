import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { HEADER_USER_ID, HEADER_USER_EMAIL } from "@/lib/supabase/trusted-headers";

// Refreshes the Supabase session on every request, keeps the auth cookies in
// sync between the request and the response, AND forwards the verified user
// identity as trusted request headers (read by getCurrentUser() in
// lib/auth.ts) — évite un second appel réseau d'auth dans le premier Server
// Component de la requête. Route protection itself lives in the protected
// pages (e.g. /app), which redirect when there is no user.
export async function updateSession(request: NextRequest) {
  // 1) Neutralise toute valeur envoyée par le client AVANT tout traitement —
  // une requête venue du navigateur ne doit jamais pouvoir injecter ces
  // headers elle-même (sinon usurpation d'identité triviale).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(HEADER_USER_ID);
  requestHeaders.delete(HEADER_USER_EMAIL);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run other code between createServerClient and getClaims().
  // getClaims() vérifie le JWT et rafraîchit la session si nécessaire (ce qui
  // déclenche le setAll ci-dessus) — comme getUser(), mais SANS l'appel réseau
  // GET /auth/v1/user à chaque navigation : avec des clés JWT asymétriques la
  // signature est vérifiée localement (JWKS mis en cache) ; avec des clés
  // symétriques, repli automatique sur une vérification serveur (pas cassé,
  // juste sans gain). Pas de session → { data: null, error: null }.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  // 2) Ré-injecte le header seulement maintenant que la session est vérifiée.
  if (claims) {
    requestHeaders.set(HEADER_USER_ID, claims.sub);
    if (claims.email) requestHeaders.set(HEADER_USER_EMAIL, claims.email);
  }
  // sinon : rien à faire, le header a déjà été purgé à l'étape 1 — une
  // requête non authentifiée (ou session invalide) ne porte jamais d'id.

  // 3) Reconstruction FINALE obligatoire : NextResponse.next({ request }) fige
  // l'état des headers de façon synchrone au moment de l'appel — muter
  // requestHeaders après un appel précédent à NextResponse.next() (celui
  // rendu par le dernier setAll() ci-dessus) n'affecte pas rétroactivement cet
  // objet déjà construit. On reconstruit donc une dernière fois, puis on
  // reporte les cookies d'auth rafraîchis depuis supabaseResponse (qui a pu
  // être reconstruit 0, 1 ou plusieurs fois pendant getClaims()).
  const finalResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    finalResponse.cookies.set(cookie);
  });

  return finalResponse;
}
