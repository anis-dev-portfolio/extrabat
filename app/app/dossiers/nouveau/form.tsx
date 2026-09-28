"use client";

import { useActionState } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { creerDossier, type CreerDossierState } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { AdresseAutocomplete } from "@/components/ui/adresse-autocomplete";
import { DOSSIER_STATUT_LABELS } from "@/lib/metier";
import { LIMITES } from "@/lib/validation";

const initial: CreerDossierState = { error: null, doublon: null, saisie: null };

export function NouveauDossierForm() {
  const [state, formAction, pending] = useActionState(creerDossier, initial);

  // React réinitialise les inputs non contrôlés après l'action : les
  // defaultValue nourris par state.saisie re-remplissent le formulaire
  // (indispensable pour « Créer quand même » après l'avertissement doublon).
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Nom du client" htmlFor="nomClient">
        <Input
          id="nomClient"
          name="nomClient"
          required
          maxLength={LIMITES.NOM}
          defaultValue={state.saisie?.nomClient ?? ""}
        />
      </Field>

      <Field
        label="Adresse"
        htmlFor="adresse"
        aide="Choisissez une suggestion pour situer le dossier sur les tournées."
      >
        <AdresseAutocomplete
          id="adresse"
          required
          defaultValue={state.saisie?.adresse ?? ""}
        />
      </Field>

      <Field label="Téléphone" htmlFor="telephone">
        <Input
          id="telephone"
          name="telephone"
          type="tel"
          required
          maxLength={LIMITES.TELEPHONE}
          defaultValue={state.saisie?.telephone ?? ""}
        />
      </Field>

      <Field
        label="Email (optionnel)"
        htmlFor="email"
        aide="Second canal de contact du client."
      >
        <Input
          id="email"
          name="email"
          type="email"
          maxLength={LIMITES.EMAIL}
          defaultValue={state.saisie?.email ?? ""}
          placeholder="client@exemple.fr"
        />
      </Field>

      <Field
        label="Infos d'accès"
        htmlFor="infosAcces"
        aide="Facultatif : étage, code interphone, consignes…"
      >
        <Textarea
          id="infosAcces"
          name="infosAcces"
          maxLength={LIMITES.INFOS_ACCES}
          rows={3}
          defaultValue={state.saisie?.infosAcces ?? ""}
        />
      </Field>

      {/* Doublon potentiel : avertir, jamais bloquer (même philosophie que le
          forçage de créneau). Seul le bouton « Créer quand même » poste
          forcerDoublon — le submit principal re-déclenche la détection. */}
      {state.doublon && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            Un dossier existe déjà pour ce client ou cette adresse.
          </p>
          <p className="text-sm text-amber-900">
            <Link
              href={`/app/dossiers/${state.doublon.id}`}
              target="_blank"
              className="font-semibold underline underline-offset-2 hover:text-amber-950"
            >
              {state.doublon.nomClient}
            </Link>{" "}
            — {state.doublon.adresse} ·{" "}
            {DOSSIER_STATUT_LABELS[state.doublon.statut]}
          </p>
          <p className="text-xs text-amber-800">
            Vérifiez le dossier existant (il s&apos;ouvre dans un nouvel
            onglet) avant de créer un doublon.
          </p>
          <Button
            type="submit"
            name="forcerDoublon"
            value="1"
            variante="secondaire"
            disabled={pending}
            className="w-full"
          >
            Créer quand même
          </Button>
        </div>
      )}

      {state.error && (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Création…" : "Créer le dossier"}
      </Button>
    </form>
  );
}
