import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { HEADER_USER_ID, HEADER_USER_EMAIL } from "@/lib/supabase/trusted-headers";
import { messageMutationsBloquees, mutationsBloquees } from "@/lib/abonnement";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { Role } from "@/lib/generated/prisma/enums";

export type CurrentUser = Prisma.UserGetPayload<{
  include: { organisation: true };
}>;

// Returns the DB User linked to the current Supabase Auth session, creating and
// linking the row on first sign-in ONLY IF the email is on the allowlist
// (MembreAutorise). Returns null when there is no session. A signed-in user
// whose email is NOT allowlisted is signed out and redirected with a message
// (auto-attachment is closed — no more open provisioning).
//
// La session est vérifiée UNE SEULE FOIS, par le middleware
// (lib/supabase/middleware.ts), qui valide le JWT via supabase.auth.getClaims()
// et transmet l'id/email vérifiés (claims.sub / claims.email) via les headers
// x-supabase-user-id / x-supabase-user-email — en écrasant systématiquement
// toute valeur envoyée par le client. On peut donc les lire ici sans
// revérifier la session.
//
// Wrapped in React cache() so multiple calls within a single request (e.g. the
// /app layout guard + the page guard) hit the DB only once.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const h = await headers();
  const userId = h.get(HEADER_USER_ID);
  if (!userId) return null;

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    include: { organisation: true },
  });
  if (existing) return existing;

  // First sign-in: provision ONLY if the email is explicitly allowlisted.
  const headerEmail = h.get(HEADER_USER_EMAIL)?.toLowerCase();
  const autorise = headerEmail
    ? await prisma.membreAutorise.findUnique({ where: { email: headerEmail } })
    : null;

  // Not allowlisted → access refused: the route handler signs the user out and
  // sends them back to /login with a message. (redirect() throws internally.)
  if (!autorise) redirect("/auth/refus");

  // Chemin rare (une fois par personne, à la création du compte) : on a
  // besoin de user_metadata (nom/full_name, posé par prisma/seed.ts), qui ne
  // transite pas par les headers de confiance — un seul appel réseau ici,
  // jamais sur le chemin nominal de chaque navigation.
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  // Défensif : le header indiquait une session ; si getUser() dit le
  // contraire (session révoquée entre le middleware et cet appel), on traite
  // comme non connecté plutôt que de provisionner à l'aveugle.
  if (!authUser) return null;

  const metadata = authUser.user_metadata ?? {};
  const nom =
    (typeof metadata.nom === "string" && metadata.nom) ||
    (typeof metadata.full_name === "string" && metadata.full_name) ||
    authUser.email?.split("@")[0] ||
    "Utilisateur";

  // Liaison compte ↔ fiche Ouvrier dans la MÊME transaction que la création :
  // un accès ouvrier (MembreAutorise.ouvrierId, posé par « Donner un accès »
  // dans Paramètres → Ouvriers) écrit Ouvrier.userId au provisioning — jamais
  // de compte OUVRIER orphelin (sans fiche) ni de fiche liée à moitié.
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        id: authUser.id,
        email: authUser.email ?? `${authUser.id}@unknown.local`,
        nom,
        role: autorise.role,
        organisationId: autorise.organisationId,
      },
      include: { organisation: true },
    });
    if (autorise.ouvrierId) {
      // updateMany conditionnel (org + non lié) : si la fiche a été supprimée
      // ou liée à un autre compte entre-temps, on ne casse rien — le compte
      // existe mais requireOuvrier refusera l'accès (fiche absente).
      await tx.ouvrier.updateMany({
        where: {
          id: autorise.ouvrierId,
          organisationId: autorise.organisationId,
          userId: null,
        },
        data: { userId: user.id },
      });
    }
    return user;
  });
});

// Rôles ayant accès au back-office (kanban dossiers).
export const BACK_OFFICE_ROLES: readonly Role[] = ["ASSISTANTE", "ADMIN"];

export function isBackOffice(role: Role): boolean {
  return BACK_OFFICE_ROLES.includes(role);
}

// Guard: exige une session, sinon redirige vers /login.
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// Guard: exige une session ET un rôle autorisé. Sinon renvoie vers /app, qui
// réoriente chacun vers sa vue selon son rôle (donc pas de boucle de redirection).
export async function requireRole(roles: readonly Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/app");
  return user;
}

// Fiche Ouvrier liée au compte courant, requise ACTIVE. Le pendant page du
// contrat garderOuvrier des Route Handlers : un OUVRIER sans fiche liée (cas
// anormal) ou désactivé (il a quitté l'entreprise) est déconnecté via
// /auth/refus — jamais de redirect("/app"), qui bouclerait (le hub renvoie
// l'OUVRIER vers /app/mes-chantiers).
export type OuvrierCourant = {
  user: CurrentUser;
  ouvrier: { id: string; nom: string; telephone: string | null };
};

export async function requireOuvrier(): Promise<OuvrierCourant> {
  const user = await requireRole(["OUVRIER"]);
  const ouvrier = await prisma.ouvrier.findFirst({
    where: { userId: user.id, organisationId: user.organisationId, actif: true },
    select: { id: true, nom: true, telephone: true },
  });
  if (!ouvrier) redirect("/auth/refus");
  return { user, ouvrier };
}

// Guard des Server Actions de MUTATION : rôle autorisé ET abonnement
// permettant d'écrire. Convention binaire du projet : action qui écrit →
// requireRoleActif ; page/action en lecture → requireRole nu. Indispensable
// dans CHAQUE action (un guard de layout/page ne protège pas les Server
// Actions — ce sont des POST indépendants du rendu), même invariant que le
// scoping org. Le statut est lu sur user.organisation, déjà chargée par
// getCurrentUser() : un simple if en mémoire, aucun coût.
//
// Union discriminée plutôt qu'un throw : TypeScript force l'appelant à
// traiter le refus (impossible d'accéder à .user sans tester .ok), et chaque
// action renvoie l'erreur dans SON format d'ActionState au lieu d'échouer
// vers l'error boundary.
//
// Exceptions assumées (toujours requireRole/requireUser) : paiement de
// l'abonnement (sinon le client ne peut pas se réactiver), changement de mot
// de passe (sécurité du compte ≠ abonnement), déconnexion.
export type GardeMutation =
  | { ok: true; user: CurrentUser }
  | { ok: false; error: string };

export async function requireRoleActif(
  roles: readonly Role[],
): Promise<GardeMutation> {
  const user = await requireRole(roles);
  if (mutationsBloquees(user.organisation)) {
    return { ok: false, error: messageMutationsBloquees(user.role) };
  }
  return { ok: true, user };
}
