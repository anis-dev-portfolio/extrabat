"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/ui";

// Carte repliable (pattern « disclosure ») — même habillage que <Card>, mais
// l'en-tête est un bouton qui masque/affiche le corps. Le compteur (`action`)
// reste visible plié, pour lire l'essentiel sans déplier. `cleMemoire`
// (optionnel) mémorise l'état plié dans localStorage entre les visites.
export function CarteRepliable({
  titre,
  action,
  children,
  defautOuvert = true,
  cleMemoire,
  className,
}: {
  titre: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  defautOuvert?: boolean;
  cleMemoire?: string;
  className?: string;
}) {
  const [ouvert, setOuvert] = useState(defautOuvert);
  const idContenu = useId();

  // Hydratation depuis localStorage APRÈS le montage : le serveur rend toujours
  // `defautOuvert`, donc aucun écart d'hydratation SSR.
  useEffect(() => {
    if (!cleMemoire) return;
    const v = window.localStorage.getItem(cleMemoire);
    if (v === "0") setOuvert(false);
    else if (v === "1") setOuvert(true);
  }, [cleMemoire]);

  function basculer() {
    setOuvert((prev) => {
      const suivant = !prev;
      if (cleMemoire) {
        window.localStorage.setItem(cleMemoire, suivant ? "1" : "0");
      }
      return suivant;
    });
  }

  return (
    <section
      className={cn(
        "rounded-lg border border-neutral-200 bg-white shadow-xs",
        className,
      )}
    >
      <h2 className="font-display">
        <button
          type="button"
          onClick={basculer}
          aria-expanded={ouvert}
          aria-controls={idContenu}
          className={cn(
            "flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg px-4 py-3 text-left transition-colors hover:bg-neutral-50",
            ouvert && "rounded-b-none",
          )}
        >
          <span className="flex min-w-0 items-center gap-2 text-base font-medium text-neutral-900">
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-neutral-400 transition-transform",
                !ouvert && "-rotate-90",
              )}
              aria-hidden="true"
            />
            <span className="min-w-0">{titre}</span>
          </span>
          {action != null && <span className="shrink-0">{action}</span>}
        </button>
      </h2>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-sortie"
        style={{ gridTemplateRows: ouvert ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden" inert={!ouvert}>
          <div id={idContenu} className="border-t border-neutral-100">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
