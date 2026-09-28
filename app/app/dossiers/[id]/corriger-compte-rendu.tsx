"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { corrigerCompteRendu, type CorrigerCompteRenduState } from "./actions";
import { Button, TACTILE_MOBILE } from "@/components/ui/button";
import { ChipsInput } from "@/components/ui/chips-input";
import { Field, Input, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { PIECES_SUGGEREES } from "@/lib/metier";

const initial: CorrigerCompteRenduState = {
  error: null,
  ok: false,
  info: null,
};

// Empêche la touche Entrée de soumettre le formulaire depuis un champ
// mono-ligne (même protection que la saisie initiale).
function bloquerEntree(e: React.KeyboardEvent) {
  if (e.key === "Enter") e.preventDefault();
}

// Correction back-office d'un compte-rendu déjà saisi (visite REALISEE) :
// bouton discret « Corriger » qui déplie un formulaire pré-rempli — mêmes
// champs que la saisie (app/app/dossiers/[id]/saisir). Ne touche jamais
// dateRealisee ni le statut du dossier ; si le nouveau taux change le
// classement suggéré, l'action renvoie une info toastée et l'assistante
// confirme via l'UI de classement de la fiche.
export function CorrigerCompteRendu({
  visiteId,
  valeurs,
}: {
  visiteId: string;
  valeurs: {
    pieces: string[];
    taux: number | null;
    jours: number | null;
    resume: string | null;
    conclusion: string | null;
  };
}) {
  const [ouvert, setOuvert] = useState(false);
  const action = corrigerCompteRendu.bind(null, visiteId);
  const [state, formAction, pending] = useActionState(action, initial);
  const router = useRouter();

  useEffect(() => {
    if (!state.ok) return;
    toast.success("Compte-rendu corrigé.");
    // Re-suggestion de classement : information durable (l'assistante doit
    // pouvoir la lire), jamais bloquante.
    if (state.info) toast.info(state.info, { duration: 8000 });
    setOuvert(false);
    router.refresh();
  }, [state, router]);

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-800"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
        Corriger
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="w-full space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4"
    >
      <p className="text-sm font-semibold text-neutral-900">
        Corriger le compte-rendu
      </p>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-neutral-800">
          Pièces endommagées
        </legend>
        <ChipsInput
          name="piece"
          suggestions={PIECES_SUGGEREES}
          valeursInitiales={valeurs.pieces}
        />
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Taux d'humidité (%)"
          htmlFor={`tauxHumidite-${visiteId}`}
        >
          <Input
            id={`tauxHumidite-${visiteId}`}
            name="tauxHumidite"
            type="number"
            min={0}
            max={100}
            step={1}
            defaultValue={valeurs.taux ?? ""}
            onKeyDown={bloquerEntree}
          />
        </Field>
        <Field
          label="Jours estimés"
          htmlFor={`joursReparationEstimes-${visiteId}`}
        >
          <Input
            id={`joursReparationEstimes-${visiteId}`}
            name="joursReparationEstimes"
            type="number"
            min={0}
            step={1}
            defaultValue={valeurs.jours ?? ""}
            onKeyDown={bloquerEntree}
          />
        </Field>
      </div>

      <Field label="Résumé" htmlFor={`resume-${visiteId}`}>
        <Textarea
          id={`resume-${visiteId}`}
          name="resume"
          rows={3}
          defaultValue={valeurs.resume ?? ""}
        />
      </Field>

      <Field
        label="Conclusion / recommandations"
        htmlFor={`conclusion-${visiteId}`}
      >
        <Textarea
          id={`conclusion-${visiteId}`}
          name="conclusion"
          rows={3}
          defaultValue={valeurs.conclusion ?? ""}
        />
      </Field>

      <p className="text-xs text-neutral-500">
        La correction est tracée dans l&apos;historique du dossier. La date de
        réalisation et le statut du dossier ne changent pas.
      </p>

      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" taille="sm" className={TACTILE_MOBILE} disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer la correction"}
        </Button>
        <Button
          variante="fantome"
          taille="sm"
          className={TACTILE_MOBILE}
          disabled={pending}
          onClick={() => setOuvert(false)}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
