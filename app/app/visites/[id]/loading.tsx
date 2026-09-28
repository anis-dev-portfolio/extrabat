import { Skeleton, SkeletonTexte } from "@/components/ui/skeleton";

// Squelette de la fiche visite terrain : retour, en-tête, carte d'infos,
// début de formulaire — la page réelle se met en place sans saut.
export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-5 w-28 rounded-full" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4">
        <SkeletonTexte lignes={2} />
        <SkeletonTexte lignes={2} />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-48" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-24 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}
