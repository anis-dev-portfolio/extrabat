import type { Conflit } from "@/lib/planning";

// Erreur métier volontaire : son message est écrit pour l'utilisateur final et
// peut être renvoyé tel quel au navigateur. Toute autre erreur (Prisma, pg,
// Supabase…) est considérée technique : loggée côté serveur, jamais exposée.
export class ErreurMetier extends Error {}

// Conflits de planification re-détectés EN TRANSACTION (le serveur reste le
// juge, l'UI n'est qu'un confort). Capturée séparément de messageFromError :
// les actions la traduisent en `PlanifierState.conflits` pour que le client
// affiche l'avertissement + le forçage explicite.
export class ConflitsDetectes extends Error {
  constructor(public readonly conflits: Conflit[]) {
    super("Le créneau choisi présente des conflits.");
  }
}

// Violation de contrainte unique Prisma (P2002) — ex. deux planifications
// simultanées calculant le même (dossierId, numero).
export function estContrainteUnique(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "P2002"
  );
}

// Maps a caught error to a user-facing French message. Seules les ErreurMetier
// (et la contrainte unique P2002, traduite) passent ; le reste est loggé
// serveur et remplacé par un message générique.
export function messageFromError(e: unknown): string {
  if (e instanceof ErreurMetier && e.message) return e.message;
  if (estContrainteUnique(e)) {
    return "Une autre visite vient d'être créée pour ce dossier au même moment. Réessayez.";
  }
  console.error("Erreur interne dans une action serveur :", e);
  return "Une erreur est survenue.";
}
