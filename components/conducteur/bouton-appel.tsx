import { Phone } from "lucide-react";
import { cn } from "@/lib/ui";

// Numéro nettoyé pour un lien tel: (garde le + international, enlève
// espaces/séparateurs). SOURCE UNIQUE du nettoyage tel: — consommé aussi par
// la barre d'actions terrain (app/app/visites/[id]/actions-buttons.tsx).
export function telHref(telephone: string): string {
  return `tel:${telephone.replace(/[^\d+]/g, "")}`;
}

// Bouton d'appel en 1 tap pour les cartes de l'agenda conducteur. Rendu comme
// élément FRÈRE du Link de la carte (jamais un lien imbriqué dans un lien) ;
// cible tactile ≥ 44 px (size-11). Composant serveur : simple ancre tel:.
export function BoutonAppel({
  telephone,
  nom,
  className,
}: {
  telephone: string;
  nom: string;
  className?: string;
}) {
  return (
    <a
      href={telHref(telephone)}
      aria-label={`Appeler ${nom}`}
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-xs transition-colors hover:bg-neutral-100 active:bg-neutral-200",
        className,
      )}
    >
      <Phone className="size-5" aria-hidden="true" />
    </a>
  );
}
