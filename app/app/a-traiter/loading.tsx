import { Skeleton } from "@/components/ui/skeleton";

// Squelette de la file « À traiter » : en-tête + 4 cartes repliables (en-tête
// cliquable + quelques lignes) — même trame que la page.
export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {Array.from({ length: 4 }, (_, c) => (
        <section
          key={c}
          className="rounded-lg border border-neutral-200 bg-white shadow-xs"
        >
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <Skeleton className="h-5 w-56 max-w-full" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          <div className="border-t border-neutral-100">
            {Array.from({ length: 2 }, (_, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
                <Skeleton className="h-8 w-24 shrink-0" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
