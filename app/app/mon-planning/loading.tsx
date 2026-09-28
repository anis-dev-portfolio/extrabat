import { Skeleton } from "@/components/ui/skeleton";

// Squelette du planning personnel : titre + navigation + 7 jours.
export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-11 w-28" />
        <Skeleton className="h-11 w-24" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className="space-y-2 rounded-lg border border-neutral-200 bg-white p-3"
          >
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
