import { Skeleton, SkeletonTexte } from "@/components/ui/skeleton";

// Squelette de la page Statistiques : en-tête + sélecteur de période + baromètre
// 6 tuiles + sections (tuiles + graphes) — même trame que la page.
function TuileSquelette() {
  return (
    <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-xs">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-6 w-16" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Sélecteur de période */}
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>

      {/* Baromètre : 6 tuiles */}
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <TuileSquelette key={i} />
        ))}
      </section>

      {/* Ce qui coince : 4 tuiles */}
      <section className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <TuileSquelette key={i} />
          ))}
        </div>
      </section>

      {/* Graphe (donut / barres) */}
      <section className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5 shadow-xs">
          <Skeleton className="h-40 w-full" />
          <SkeletonTexte lignes={2} />
        </div>
      </section>
    </div>
  );
}
