"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Field, Select } from "@/components/ui/field";
import { cn } from "@/lib/ui";

// Contrôles du sélecteur de plage : conducteur + navigation ±14 j. Chaque
// changement remonte au parent (PlanifierSelecteur, form.tsx) qui recharge
// l'agenda via la Server Action de lecture — l'état client du formulaire (jour
// déplié, plage choisie) est préservé. L'AMPLITUDE de la plage n'est plus ici :
// elle se choisit dans le jour (De/À), sans re-render serveur.
export function ControlesPlanifier({
  conducteurs,
  conducteurId,
  jourPrecedent,
  jourSuivant,
  peutReculer,
  onChanger,
}: {
  conducteurs: { id: string; nom: string }[];
  conducteurId: string;
  jourPrecedent: string;
  jourSuivant: string;
  peutReculer: boolean;
  onChanger: (patch: { conducteurId?: string; jour?: string }) => void;
}) {
  const boutonNav =
    "flex size-10 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-600 shadow-xs transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Conducteur" htmlFor="conducteur" className="min-w-48">
        <Select
          id="conducteur"
          value={conducteurId}
          onChange={(v) => onChanger({ conducteurId: v })}
        >
          {conducteurs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="14 jours précédents"
          disabled={!peutReculer}
          onClick={() => onChanger({ jour: jourPrecedent })}
          className={boutonNav}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="14 jours suivants"
          onClick={() => onChanger({ jour: jourSuivant })}
          className={cn(boutonNav, "cursor-pointer")}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
