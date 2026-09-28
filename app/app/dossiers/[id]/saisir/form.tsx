"use client";

import { useActionState } from "react";
import { saisirResultat, type SaisirResultatState } from "../../actions";
import { Button } from "@/components/ui/button";
import { ChipsInput } from "@/components/ui/chips-input";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PIECES_SUGGEREES } from "@/lib/metier";

const initial: SaisirResultatState = { error: null, saisie: null };

// Empêche la touche Entrée de soumettre le formulaire depuis un champ mono-ligne
// (même protection que le formulaire terrain conducteur).
function bloquerEntree(e: React.KeyboardEvent) {
  if (e.key === "Enter") e.preventDefault();
}

export function SaisirForm({ dossierId }: { dossierId: string }) {
  const action = saisirResultat.bind(null, dossierId);
  const [state, formAction, pending] = useActionState(action, initial);

  // React réinitialise les inputs non contrôlés après l'action : les
  // defaultValue nourris par state.saisie re-remplissent le formulaire après
  // une erreur serveur (résumé/conclusion longs — perte douloureuse). Les
  // pièces (ChipsInput) portent leur propre état React et survivent seules.
  return (
    <form action={formAction} className="space-y-4">
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-neutral-800">
          Pièces endommagées
        </legend>
        <ChipsInput name="piece" suggestions={PIECES_SUGGEREES} />
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Taux d'humidité (%)" htmlFor="tauxHumidite">
          <Input
            id="tauxHumidite"
            name="tauxHumidite"
            type="number"
            min={0}
            max={100}
            step={1}
            defaultValue={state.saisie?.tauxHumidite ?? ""}
            onKeyDown={bloquerEntree}
          />
        </Field>
        <Field label="Jours estimés" htmlFor="joursReparationEstimes">
          <Input
            id="joursReparationEstimes"
            name="joursReparationEstimes"
            type="number"
            min={0}
            step={1}
            defaultValue={state.saisie?.joursReparationEstimes ?? ""}
            onKeyDown={bloquerEntree}
          />
        </Field>
      </div>

      <Field label="Résumé" htmlFor="resume">
        <Textarea
          id="resume"
          name="resume"
          rows={3}
          defaultValue={state.saisie?.resume ?? ""}
        />
      </Field>

      <Field label="Conclusion / recommandations" htmlFor="conclusion">
        <Textarea
          id="conclusion"
          name="conclusion"
          rows={3}
          defaultValue={state.saisie?.conclusion ?? ""}
        />
      </Field>

      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Enregistrement…" : "Enregistrer le compte-rendu"}
      </Button>
    </form>
  );
}
