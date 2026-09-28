import { Skeleton } from "@/components/ui/skeleton";

// Squelette des Notifications conducteur : en-tête (titre + compteur + bouton
// « Tout marquer lu ») puis pile de cartes au pouce (icône + libellé + date) —
// même trame que la page pour un chargement sans saut.
export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>

      {/* Liste des notifications (non-lues d'abord dans la vraie page) */}
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="flex min-h-16 items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-xs"
          >
            <Skeleton className="size-5 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className={i % 2 === 0 ? "h-4 w-3/4" : "h-4 w-2/3"} />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
