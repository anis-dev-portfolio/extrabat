import { Skeleton } from "@/components/ui/skeleton";

// Squelette du segment Paramètres (hub ET sous-pages) : gabarit commun =
// conteneur centré + en-tête (fil de retour/sous-titre, titre, description) +
// cartes à en-tête. Les largeurs réelles varient (max-w-lg → 5xl) : max-w-3xl
// est le médian — le recentrage se fait sans saut vertical.
export default function Loading() {
  return (
    <div aria-busy="true" className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      {/* Carte principale : en-tête + corps type formulaire */}
      <div className="rounded-lg border border-neutral-200 bg-white shadow-xs">
        <div className="border-b border-neutral-100 px-4 py-3">
          <Skeleton className="h-5 w-44" />
        </div>
        <div className="space-y-4 p-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-10 w-36" />
        </div>
      </div>

      {/* Carte secondaire (le hub et plusieurs sous-pages en ont une) */}
      <div className="rounded-lg border border-neutral-200 bg-white shadow-xs">
        <div className="border-b border-neutral-100 px-4 py-3">
          <Skeleton className="h-5 w-36" />
        </div>
        <div className="space-y-2 p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}
