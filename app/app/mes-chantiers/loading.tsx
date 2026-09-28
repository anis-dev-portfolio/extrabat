import { Skeleton } from "@/components/ui/skeleton";

// Squelette de la liste des chantiers de l'ouvrier : reproduit la structure
// réelle (titre, sous-titre, groupes de cartes) pour un chargement sans saut.
export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-56" />
      </div>
      {Array.from({ length: 2 }, (_, g) => (
        <div key={g} className="space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <div className="space-y-2">
            {Array.from({ length: g === 0 ? 1 : 2 }, (_, i) => (
              <div
                key={i}
                className="flex min-h-20 items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
