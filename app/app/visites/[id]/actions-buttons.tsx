"use client";

import { Navigation, Phone } from "lucide-react";
import { mapsRechercheHref } from "@/lib/maps";
import { telHref } from "@/components/conducteur/bouton-appel";

// Barre d'actions terrain, fixée au-dessus de la bottom-nav (zone du pouce) :
// appel direct (tel: — nettoyage partagé telHref, source unique dans
// bouton-appel.tsx) + itinéraire (lien Maps universel, ouvre l'app native
// quand disponible), et — pendant la saisie — le bouton Envoyer du formulaire
// passé en children (le <button type="submit"> reste DANS le <form>, la barre
// n'est qu'un conteneur positionné).

// Cibles ≥ 44 px, padding réduit (jusqu'à 3 boutons côte à côte sur 360 px).
const lienBarreClass =
  "flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border border-neutral-300 bg-white text-sm font-medium text-neutral-800 shadow-xs transition-colors hover:bg-neutral-100 active:bg-neutral-200";

export function BarreVisite({
  telephone,
  adresse,
  children,
}: {
  telephone: string;
  adresse: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 border-t border-neutral-200 bg-white/95 backdrop-blur-sm print:hidden">
      <div className="mx-auto flex w-full max-w-2xl gap-2 px-4 py-2.5">
        <a href={telHref(telephone)} className={lienBarreClass}>
          <Phone className="size-4 shrink-0" aria-hidden="true" />
          Appeler
        </a>
        <a
          href={mapsRechercheHref(adresse)}
          target="_blank"
          rel="noopener noreferrer"
          className={lienBarreClass}
        >
          <Navigation className="size-4 shrink-0" aria-hidden="true" />
          Itinéraire
        </a>
        {children}
      </div>
    </div>
  );
}
