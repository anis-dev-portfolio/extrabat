"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { LIMITES } from "@/lib/validation";
import { ajouterOuvrier, type OuvrierState } from "./actions";

const initial: OuvrierState = { error: null, ok: false };

export function FormOuvrier() {
  const [state, formAction, pending] = useActionState(ajouterOuvrier, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success("Ouvrier ajouté.");
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Nom" htmlFor="nom">
          <Input
            id="nom"
            name="nom"
            required
            maxLength={LIMITES.NOM}
            placeholder="Prénom Nom"
          />
        </Field>
        <Field label="Téléphone" htmlFor="telephone" aide="Facultatif.">
          <Input
            id="telephone"
            name="telephone"
            type="tel"
            maxLength={LIMITES.TELEPHONE}
            placeholder="06 12 34 56 78"
          />
        </Field>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <Button type="submit" variante="secondaire" disabled={pending}>
        <Plus className="size-4" aria-hidden="true" />
        {pending ? "Ajout…" : "Ajouter l'ouvrier"}
      </Button>
    </form>
  );
}
