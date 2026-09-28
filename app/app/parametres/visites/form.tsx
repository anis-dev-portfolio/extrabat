"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { AMPLITUDES_PLAGE, minutesVersHeure } from "@/lib/planning";

// « 1 h », « 1 h 30 », « 2 h » — amplitude d'une plage (durée cumulée).
function amplitudeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}
import {
  modifierDefautsVisites,
  type DefautsVisitesState,
} from "./actions";

const initial: DefautsVisitesState = { error: null, ok: false };

export function DefautsVisitesForm({
  valeurs,
}: {
  valeurs: {
    dureeVisiteDefautMinutes: number;
    heureOuverture: number;
    heureFermeture: number;
  };
}) {
  const [state, formAction, pending] = useActionState(
    modifierDefautsVisites,
    initial,
  );

  useEffect(() => {
    if (state.ok) toast.success("Défauts de planification enregistrés.");
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <Field
        label="Amplitude de plage par défaut"
        htmlFor="dureeVisiteDefautMinutes"
        aide="Pré-remplit la plage horaire du formulaire de planification. Les visites déjà planifiées ne changent pas."
      >
        <Select
          id="dureeVisiteDefautMinutes"
          name="dureeVisiteDefautMinutes"
          defaultValue={String(valeurs.dureeVisiteDefautMinutes)}
          className="max-w-44"
        >
          {AMPLITUDES_PLAGE.map((d) => (
            <option key={d} value={d}>
              {amplitudeLabel(d)}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid max-w-sm grid-cols-2 gap-3">
        <Field label="Ouverture du planning" htmlFor="heureOuverture">
          <Input
            id="heureOuverture"
            name="heureOuverture"
            type="time"
            required
            defaultValue={minutesVersHeure(valeurs.heureOuverture)}
            className="tabular-nums"
          />
        </Field>
        <Field label="Fermeture" htmlFor="heureFermeture">
          <Input
            id="heureFermeture"
            name="heureFermeture"
            type="time"
            required
            defaultValue={minutesVersHeure(valeurs.heureFermeture)}
            className="tabular-nums"
          />
        </Field>
      </div>
      <p className="text-xs text-neutral-500">
        Bornes d&apos;affichage de la grille du planning — aussi utilisées comme
        horaires de repli pour un conducteur sans horaires définis.
      </p>

      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
