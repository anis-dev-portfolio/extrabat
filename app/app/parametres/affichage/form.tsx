"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { modifierAffichage, type AffichageState } from "./actions";

const initial: AffichageState = { error: null, ok: false };

const TRI_LABELS: { valeur: string; label: string }[] = [
  { valeur: "priorite", label: "Priorité (urgence par colonne)" },
  { valeur: "recent", label: "Activité récente" },
  { valeur: "creation", label: "Date de création" },
  { valeur: "nom", label: "Nom du client" },
];

export function AffichageForm({
  valeurs,
}: {
  valeurs: { vueDossiersDefaut: string; triDossiersDefaut: string };
}) {
  const [state, formAction, pending] = useActionState(
    modifierAffichage,
    initial,
  );

  useEffect(() => {
    if (state.ok) toast.success("Préférences d'affichage enregistrées.");
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <Field
        label="Vue par défaut de la page Dossiers"
        htmlFor="vueDossiersDefaut"
        aide="Ce que l'on voit en ouvrant Dossiers. Chacun peut ensuite basculer librement — ce n'est que le point de départ."
      >
        <Select
          id="vueDossiersDefaut"
          name="vueDossiersDefaut"
          defaultValue={valeurs.vueDossiersDefaut}
          className="max-w-56"
        >
          <option value="kanban">Kanban (colonnes par statut)</option>
          <option value="liste">Liste (tableau)</option>
        </Select>
      </Field>

      <Field
        label="Tri par défaut de la vue liste"
        htmlFor="triDossiersDefaut"
        aide="Ordre des dossiers dans la vue liste. Le kanban garde toujours son ordre de priorité par colonne."
      >
        <Select
          id="triDossiersDefaut"
          name="triDossiersDefaut"
          defaultValue={valeurs.triDossiersDefaut}
          className="max-w-56"
        >
          {TRI_LABELS.map((t) => (
            <option key={t.valeur} value={t.valeur}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>

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
