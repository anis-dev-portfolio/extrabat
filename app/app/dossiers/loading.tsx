import { Skeleton } from "@/components/ui/skeleton";

// Squelette du listing Dossiers : en-tête + barre de filtres + kanban 5
// colonnes (la vue par défaut) — même trame que la page pour un chargement
// sans saut. La vue liste retombe sur une structure proche (barre + bloc).
export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      {/* Barre de filtres (recherche + selects) */}
      <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-10 w-full sm:w-60" />
          <Skeleton className="h-10 w-[calc(50%-0.25rem)] sm:w-44" />
          <Skeleton className="h-10 w-[calc(50%-0.25rem)] sm:w-44" />
          <Skeleton className="ml-auto h-10 w-36" />
        </div>
      </div>

      {/* Kanban : 5 colonnes de cartes */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, c) => (
          <div
            key={c}
            className="flex min-h-48 flex-col gap-2 rounded-xl bg-neutral-100/80 p-2"
          >
            <div className="flex items-center justify-between gap-2 px-1.5 pt-1 pb-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-8 rounded-full" />
            </div>
            {Array.from({ length: c % 2 === 0 ? 3 : 2 }, (_, i) => (
              <div
                key={i}
                className="space-y-2 rounded-lg border border-neutral-200 bg-white p-3 shadow-xs"
              >
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
