import { Skeleton } from "@/components/ui/skeleton";

// Squelette de la page Chantiers : en-tête + Gantt de la semaine (grand bloc)
// + tuiles « Prêts pour travaux » + table « En cours & à venir » — même trame
// que la page.
export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-44" />
      </div>

      {/* Gantt de la semaine */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-9 w-64" />
        </div>
        <Skeleton className="h-48 w-full rounded-lg" />
      </section>

      {/* Prêts pour travaux : tuiles */}
      <section className="space-y-3">
        <Skeleton className="h-5 w-44" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-3 shadow-xs"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
              <Skeleton className="h-8 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </section>

      {/* En cours & à venir : table */}
      <section className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-xs">
          <div className="space-y-0">
            <div className="bg-neutral-50 px-3 py-2">
              <Skeleton className="h-4 w-1/2" />
            </div>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="border-b border-neutral-100 px-3 py-2.5">
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
