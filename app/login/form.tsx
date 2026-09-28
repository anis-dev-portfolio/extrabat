"use client";

import { useActionState } from "react";
import { TriangleAlert } from "lucide-react";
import { login, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const initialState: LoginState = { error: null, saisie: null };

export function LoginForm({ messageInitial }: { messageInitial?: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);
  const message = state.error ?? messageInitial ?? null;

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          // Une erreur (« Identifiants invalides ») ne doit pas vider l'email :
          // la saisie renvoyée par l'action re-remplit l'input non contrôlé.
          defaultValue={state.saisie?.email ?? ""}
          className="h-11"
        />
      </Field>

      <Field label="Mot de passe" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11"
        />
      </Field>

      {message && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {message}
        </p>
      )}

      <Button type="submit" taille="pouce" disabled={pending} className="w-full">
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
