"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { LIMITES } from "@/lib/validation";

// Contrat commun des actions d'ajout d'absence — structurellement identique à
// DispoState (conducteurs) et OuvrierState (ouvriers).
export type AbsenceFormState = { error: string | null; ok: boolean };

const initial: AbsenceFormState = { error: null, ok: false };

// Formulaire d'absence partagé (conducteurs & ouvriers) : la server action et
// le champ caché d'identité (conducteurId / ouvrierId) sont passés en props.
// Dates saisies via le DatePicker maison (valeurs postées par inputs cachés).
// Les deux dates sont liées côté client : « Au » ne peut pas précéder « Du »
// (réalignement à la saisie du début + alerte) — simple garde-fou, la
// validation serveur reste la source de vérité.
export function FormAbsence({
  action,
  champId,
  valeurId,
  motifPlaceholder,
}: {
  action: (
    prev: AbsenceFormState,
    formData: FormData,
  ) => Promise<AbsenceFormState>;
  // Nom du champ caché attendu par l'action ("conducteurId" / "ouvrierId").
  champId: string;
  valeurId: string;
  motifPlaceholder: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

  useEffect(() => {
    if (state.ok) {
      toast.success("Absence enregistrée.");
      formRef.current?.reset();
      setDateDebut("");
      setDateFin("");
    }
  }, [state]);

  // Le calendrier ne borne pas la sélection : on signale l'incohérence et on
  // bloque l'envoi (le serveur refuserait de toute façon).
  const finAvantDebut =
    dateDebut !== "" && dateFin !== "" && dateFin < dateDebut;

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name={champId} value={valeurId} />
      <input type="hidden" name="dateDebut" value={dateDebut} />
      <input type="hidden" name="dateFin" value={dateFin} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Du" htmlFor="dateDebut">
          <DatePicker
            id="dateDebut"
            ariaLabel="Date de début de l'absence"
            value={dateDebut}
            onChange={(debut) => {
              setDateDebut(debut);
              // La fin ne peut pas précéder le nouveau début : on la réaligne.
              if (debut && dateFin && dateFin < debut) setDateFin(debut);
            }}
          />
        </Field>
        <Field label="Au (inclus)" htmlFor="dateFin">
          <DatePicker
            id="dateFin"
            ariaLabel="Date de fin de l'absence"
            panneauADroite
            value={dateFin}
            onChange={setDateFin}
          />
        </Field>
      </div>
      {finAvantDebut && (
        <p role="alert" className="text-sm text-red-700">
          La date de fin doit être après (ou égale à) la date de début.
        </p>
      )}
      <Field
        label="Motif"
        htmlFor="motif"
        aide={`Facultatif, ${LIMITES.MOTIF} caractères max.`}
      >
        <Input
          id="motif"
          name="motif"
          maxLength={LIMITES.MOTIF}
          placeholder={motifPlaceholder}
        />
      </Field>

      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        variante="secondaire"
        disabled={pending || !dateDebut || !dateFin || finAvantDebut}
      >
        <Plus className="size-4" aria-hidden="true" />
        {pending ? "Ajout…" : "Ajouter l'absence"}
      </Button>
    </form>
  );
}
