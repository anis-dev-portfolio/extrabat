import { Skeleton } from "@/components/ui/skeleton";

// Squelette de la fiche chantier : retour + en-tête (titre + badge d'état +
// adresse), carte Planning pleine largeur (rail début → fin), puis grille
// 2/3–1/3 : tuiles Ouvriers en 2 colonnes à gauche, cartes Client & accès et
// Actions à droite — même trame que la page pour un chargement sans saut.
export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-5 w-20" />
        <div className="flex flex-wrap items-center gap-2.5">
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>

      {/* Planning : le rail début → fin, signature de la fiche */}
      <div className="rounded-lg border border-neutral-200 bg-white shadow-xs">
        <div className="flex items-center justify-between gap-4 border-b border-neutral-100 px-4 py-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-8" />
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="mt-2.5 h-2 w-full rounded-full" />
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Ouvriers : tuiles en 2 colonnes */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-neutral-200 bg-white shadow-xs">
            <div className="flex items-center justify-between gap-4 border-b border-neutral-100 px-4 py-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-8 rounded-full" />
            </div>
            <div className="p-4">
              <div className="grid gap-2.5 sm:grid-cols-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3"
                  >
                    <Skeleton className="size-9 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {/* Client & accès */}
          <div className="rounded-lg border border-neutral-200 bg-white shadow-xs">
            <div className="border-b border-neutral-100 px-4 py-3">
              <Skeleton className="h-5 w-28" />
            </div>
            <div className="space-y-2.5 p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>

          {/* Actions */}
          <div className="rounded-lg border border-neutral-200 bg-white shadow-xs">
            <div className="border-b border-neutral-100 px-4 py-3">
              <Skeleton className="h-5 w-20" />
            </div>
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
