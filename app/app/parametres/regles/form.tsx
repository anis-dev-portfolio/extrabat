"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import {
  SEUIL_HUMIDITE_MIN,
  SEUIL_HUMIDITE_MAX,
  DELAI_SECHAGE_MIN,
  DELAI_SECHAGE_MAX,
} from "@/lib/metier";
import { modifierRegles, type ReglesState } from "./actions";

const initial: ReglesState = { error: null, ok: false };

export function ReglesForm({
  valeurs,
}: {
  valeurs: { seuilHumidite: number; delaiSechageJours: number };
}) {
  const [state, formAction, pending] = useActionState(modifierRegles, initial);

  useEffect(() => {
    if (state.ok) toast.success("Règles de classement enregistrées.");
  }, [state]);

  return (
    <form action={formAction} className="space-y-5">
      <Field
        label="Seuil d'humidité (%)"
        htmlFor="seuilHumidite"
        aide="Au-delà de ce taux, le dossier est classé « en attente de séchage » et une contre-visite est conseillée. En deçà, il passe « prêt pour travaux »."
      >
        <Input
          id="seuilHumidite"
          name="seuilHumidite"
          type="number"
          inputMode="numeric"
          required
          min={SEUIL_HUMIDITE_MIN}
          max={SEUIL_HUMIDITE_MAX}
          step={1}
          defaultValue={valeurs.seuilHumidite}
          className="max-w-32 tabular-nums"
        />
      </Field>

      <Field
        label="Délai de séchage conseillé (jours)"
        htmlFor="delaiSechageJours"
        aide="Temps d'attente conseillé avant la contre-visite d'un dossier en attente de séchage. Passé ce délai sans visite planifiée, le dossier remonte dans « À traiter »."
      >
        <Input
          id="delaiSechageJours"
          name="delaiSechageJours"
          type="number"
          inputMode="numeric"
          required
          min={DELAI_SECHAGE_MIN}
          max={DELAI_SECHAGE_MAX}
          step={1}
          defaultValue={valeurs.delaiSechageJours}
          className="max-w-32 tabular-nums"
        />
      </Field>

      <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
        Ces réglages n&apos;affectent que les <strong>nouveaux</strong>{" "}
        classements et les échéances à venir : les dossiers déjà classés
        conservent leur statut, l&apos;assistante restant seule à confirmer
        chaque classement.
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
