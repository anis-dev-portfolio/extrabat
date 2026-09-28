import { Skeleton, SkeletonTexte } from "@/components/ui/skeleton";

// Squelette générique du sous-arbre /app : affiché pendant que Prisma répond
// (tout est force-dynamic). Les écrans denses gardent une structure crédible.
export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
          >
            <Skeleton className="h-5 w-28" />
            <SkeletonTexte lignes={3} />
          </div>
        ))}
      </div>
    </div>
  );
}
