import { Skeleton, SkeletonTexte } from "@/components/ui/skeleton";

// Squelette de la fiche dossier : en-tête (retour, titre + badge, adresse)
// puis la grille 1/3 latérale (Client, Actions, Pièces jointes, Historique) +
// 2/3 principale (Visites, Notes) — même trame que la page.
function CarteSquelette({ lignes = 3 }: { lignes?: number }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white shadow-xs">
      <header className="border-b border-neutral-100 px-4 py-3">
        <Skeleton className="h-5 w-32" />
      </header>
      <div className="p-4">
        <SkeletonTexte lignes={lignes} />
      </div>
    </section>
  );
}

export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5">
          <CarteSquelette lignes={4} />
          <CarteSquelette lignes={2} />
          <CarteSquelette lignes={3} />
        </div>
        <div className="flex flex-col gap-5 lg:col-span-2">
          <CarteSquelette lignes={6} />
          <CarteSquelette lignes={3} />
        </div>
      </div>
    </div>
  );
}
