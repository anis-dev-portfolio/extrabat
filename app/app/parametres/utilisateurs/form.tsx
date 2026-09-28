"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { ajouterMembreAutorise, type MembreActionState } from "./actions";

const initial: MembreActionState = { error: null, ok: false };

export function AjouterMembreForm() {
  const [state, formAction, pending] = useActionState(
    ajouterMembreAutorise,
    initial,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success("Email autorisé.");
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input
          name="email"
          type="email"
          required
          maxLength={200}
          placeholder="email@exemple.fr"
          aria-label="Email à autoriser"
          className="min-w-52 flex-1"
        />
        <Select
          name="role"
          defaultValue="CONDUCTEUR"
          aria-label="Rôle prévu"
          className="w-40"
        >
          <option value="CONDUCTEUR">Conducteur</option>
          <option value="ASSISTANTE">Assistante</option>
          <option value="ADMIN">Admin</option>
        </Select>
        <Button type="submit" disabled={pending}>
          {pending ? "Ajout…" : "Autoriser"}
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
