import { cn } from "@/lib/ui";

// Bloc de chargement (pattern des loading.tsx).
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("shimmer rounded-md", className)}
    />
  );
}

export function SkeletonTexte({
  lignes = 3,
  className,
}: {
  lignes?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lignes }, (_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4", i === lignes - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}
