"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/ui";

// Texte long tronqué à 3 lignes avec bascule locale « Voir plus / Voir
// moins ». Le bouton n'apparaît que si le texte est réellement tronqué
// (scrollHeight > clientHeight, mesuré après rendu). Aucune action serveur :
// la fiche reste un composant serveur, seul ce fragment est client.
export function TexteTronque({
  texte,
  className,
}: {
  texte: string;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [ouvert, setOuvert] = useState(false);
  const [tronque, setTronque] = useState(false);

  // Mesuré après rendu, UNIQUEMENT dans l'état clampé (sinon scrollHeight ==
  // clientHeight et on conclurait à tort « non tronqué »). Re-mesuré si le
  // texte change (correction du compte-rendu → router.refresh) ou à la
  // fermeture. Pas d'observer de redimensionnement : un « Voir plus » qui
  // apparaît/disparaît au resize serait plus déroutant qu'utile. Tolérance de
  // 1 px (arrondis navigateur).
  useEffect(() => {
    const el = ref.current;
    if (!el || ouvert) return;
    setTronque(el.scrollHeight > el.clientHeight + 1);
  }, [texte, ouvert]);

  return (
    <div className="space-y-0.5">
      <p ref={ref} className={cn(!ouvert && "line-clamp-3", className)}>
        {texte}
      </p>
      {/* `ouvert` maintient le bouton une fois déplié (le texte déplié n'est
          plus mesuré comme tronqué). */}
      {(tronque || ouvert) && (
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          className="cursor-pointer text-xs font-medium text-neutral-500 underline underline-offset-2 transition-colors hover:text-neutral-800"
        >
          {ouvert ? "Voir moins" : "Voir plus"}
        </button>
      )}
    </div>
  );
}
