"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { changerMotDePasse, type MotDePasseState } from "./actions";

const initial: MotDePasseState = { error: null, ok: false };

export function MotDePasseForm() {
  const [state, formAction, pending] = useActionState(
    changerMotDePasse,
    initial,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success("Mot de passe changé.");
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <Field
        label="Nouveau mot de passe"
        htmlFor="motDePasse"
        aide="Au moins 10 caractères."
      >
        <Input
          id="motDePasse"
          name="motDePasse"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
        />
      </Field>

      <Field label="Confirmer le mot de passe" htmlFor="confirmation">
        <Input
          id="confirmation"
          name="confirmation"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
        />
      </Field>

      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Changement…" : "Changer le mot de passe"}
      </Button>
    </form>
  );
}
