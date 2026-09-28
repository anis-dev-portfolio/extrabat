import { Skeleton } from "@/components/ui/skeleton";

// Squelette du Planning : en-tête (titre + contrôles) puis la grille horaire
// (bloc unique à hauteur de viewport, colonnes esquissées) — même trame que
// la vue semaine, la vue par défaut.
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-10 w-44" />
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-xs">
        <div className="grid h-[60vh] grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              className={
                i >= 5
                  ? "hidden flex-col gap-2 lg:flex"
                  : i >= 3
                    ? "hidden flex-col gap-2 sm:flex"
                    : "flex flex-col gap-2"
              }
            >
              <Skeleton className="h-4 w-full shrink-0" />
              <Skeleton className="min-h-0 flex-1 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
