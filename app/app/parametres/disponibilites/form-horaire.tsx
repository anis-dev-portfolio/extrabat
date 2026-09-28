"use client";

import { useActionState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { JOURS_SEMAINE } from "@/lib/planning";
import { ajouterHoraire, type DispoState } from "./actions";

const initial: DispoState = { error: null, ok: false };

export function FormHoraire({ conducteurId }: { conducteurId: string }) {
  const [state, formAction, pending] = useActionState(ajouterHoraire, initial);

  useEffect(() => {
    if (state.ok) toast.success("Plage horaire ajoutée.");
  }, [state]);

  return (
    <form
      action={formAction}
      className="space-y-2 border-t border-neutral-100 pt-4"
    >
      <p className="text-sm font-medium text-neutral-800">Ajouter une plage</p>
      <input type="hidden" name="conducteurId" value={conducteurId} />
      <div className="flex flex-wrap items-end gap-2">
        <Select
          name="jourSemaine"
          defaultValue="1"
          aria-label="Jour de la semaine"
          className="w-32"
        >
          {JOURS_SEMAINE.map(({ jour, label }) => (
            <option key={jour} value={jour}>
              {label}
            </option>
          ))}
        </Select>
        <Input
          name="heureDebut"
          type="time"
          required
          defaultValue="08:00"
          aria-label="Heure de début"
          className="w-28 tabular-nums"
        />
        <span className="pb-2.5 text-sm text-neutral-400">→</span>
        <Input
          name="heureFin"
          type="time"
          required
          defaultValue="17:00"
          aria-label="Heure de fin"
          className="w-28 tabular-nums"
        />
        <Button type="submit" variante="secondaire" disabled={pending}>
          <Plus className="size-4" aria-hidden="true" />
          {pending ? "Ajout…" : "Ajouter"}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
