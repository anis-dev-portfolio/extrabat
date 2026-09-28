import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// En-tête commun des sous-pages Paramètres : retour au hub + titre.
export function EnteteParametres({
  titre,
  description,
}: {
  titre: string;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <Link
        href="/app/parametres"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Paramètres
      </Link>
      <h1 className="text-xl font-bold tracking-tight">{titre}</h1>
      {description && <p className="text-sm text-neutral-500">{description}</p>}
    </div>
  );
}
