import { Skeleton } from "@/components/ui/skeleton";

// Squelette du Chiffre d'affaires : en-tête + 3 sections (Encaissé avec table
// mensuelle, À encaisser, En cours) — même trame que la page.
function EnteteSection() {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-5 w-28" />
    </div>
  );
}

export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Encaissé : mois + table */}
      <section className="space-y-3">
        <EnteteSection />
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-xs">
            <div className="bg-neutral-50 px-3 py-2">
              <Skeleton className="h-4 w-1/2" />
            </div>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="border-b border-neutral-100 px-3 py-2.5">
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* À encaisser */}
      <section className="space-y-3">
        <EnteteSection />
        <Skeleton className="h-4 w-72 max-w-full" />
      </section>

      {/* En cours */}
      <section className="space-y-3">
        <EnteteSection />
        <Skeleton className="h-4 w-72 max-w-full" />
      </section>
    </div>
  );
}
