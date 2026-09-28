import { Skeleton } from "@/components/ui/skeleton";

// Squelette de l'historique : titre, champ de recherche, groupe mensuel.
export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="flex min-h-20 items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-2/5" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
