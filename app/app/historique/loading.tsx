import { Skeleton } from "@/components/ui/skeleton";

// Squelette de l'Historique : en-tête + 3 tuiles récap + barre de filtres +
// table paginée — même trame que la page.
export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Tuiles récap règlement */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-xs"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Barre de filtres */}
      <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-10 w-full sm:w-60" />
          <Skeleton className="h-10 w-[calc(50%-0.25rem)] sm:w-44" />
          <Skeleton className="h-10 w-full sm:w-56" />
        </div>
      </div>

      {/* Table */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-36" />
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-xs">
          <div className="bg-neutral-50 px-3 py-2">
            <Skeleton className="h-4 w-1/2" />
          </div>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="border-b border-neutral-100 px-3 py-2.5">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
