"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/ui";

// Sélecteur en puces : suggestions cliquables + ajout libre. Deux modes :
// - non contrôlé (name requis) : les valeurs sont soumises via des
//   <input hidden> homonymes — côté serveur : formData.getAll(name) ;
// - contrôlé (valeurs + onValeursChange) : le parent porte l'état (ex.
//   formulaire terrain, dont l'état alimente le brouillon local).
// Stockage inchangé (String[]).
export function ChipsInput({
  name,
  suggestions = [],
  valeursInitiales = [],
  valeurs: valeursControlees,
  onValeursChange,
  placeholder = "Autre pièce…",
  taille = "md",
}: {
  name?: string;
  suggestions?: readonly string[];
  valeursInitiales?: string[];
  valeurs?: string[];
  onValeursChange?: (valeurs: string[]) => void;
  placeholder?: string;
  // « pouce » : cibles tactiles ≥ 44 px pour le formulaire terrain.
  taille?: "md" | "pouce";
}) {
  const [valeursInternes, setValeursInternes] =
    useState<string[]>(valeursInitiales);
  const [saisie, setSaisie] = useState("");

  const controle = valeursControlees !== undefined;
  const valeurs = controle ? valeursControlees : valeursInternes;
  const setValeurs = (suivantes: string[]) => {
    if (!controle) setValeursInternes(suivantes);
    onValeursChange?.(suivantes);
  };

  const pouce = taille === "pouce";
  const restantes = suggestions.filter((s) => !valeurs.includes(s));

  function ajouter(brute: string) {
    const valeur = brute.trim().slice(0, 60);
    if (!valeur || valeurs.includes(valeur)) return;
    setValeurs([...valeurs, valeur]);
  }

  function retirer(valeur: string) {
    setValeurs(valeurs.filter((v) => v !== valeur));
  }

  return (
    <div className="space-y-2">
      {valeurs.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {valeurs.map((valeur) => (
            <li key={valeur}>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 pl-3 text-sm font-medium text-primary-900",
                  pouce ? "h-11" : "h-11 sm:h-8",
                )}
              >
                {valeur}
                <button
                  type="button"
                  onClick={() => retirer(valeur)}
                  aria-label={`Retirer ${valeur}`}
                  className={cn(
                    "flex cursor-pointer items-center justify-center rounded-full text-primary-700 transition-colors hover:text-primary-950",
                    pouce ? "size-11" : "size-11 sm:size-8",
                  )}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </span>
              {name && <input type="hidden" name={name} value={valeur} />}
            </li>
          ))}
        </ul>
      )}

      {restantes.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {restantes.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => ajouter(suggestion)}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1 rounded-full border border-neutral-300 bg-white px-3 text-sm text-neutral-700 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-900",
                  pouce ? "h-11" : "h-11 sm:h-8",
                )}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              ajouter(saisie);
              setSaisie("");
            }
          }}
          // Texte tapé mais non validé : engagé en puce à la perte de focus,
          // sinon il serait silencieusement perdu à la soumission du form.
          onBlur={() => {
            ajouter(saisie);
            setSaisie("");
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className={cn(
            "w-full max-w-56 rounded-md border border-neutral-300 bg-white px-3 shadow-xs placeholder:text-neutral-400",
            // Texte 16 px sur mobile — évite le zoom automatique d'iOS au
            // focus des champs < 16 px (même règle que le formulaire terrain).
            pouce ? "h-11 text-base" : "h-11 text-base sm:h-9 sm:text-sm",
          )}
        />
        <button
          type="button"
          onClick={() => {
            ajouter(saisie);
            setSaisie("");
          }}
          disabled={!saisie.trim()}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-50",
            pouce ? "h-11" : "h-11 sm:h-9",
          )}
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}
