"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { LIMITES } from "@/lib/validation";
import { modifierOrganisation, type OrganisationState } from "./actions";

const initial: OrganisationState = { error: null, ok: false, saisie: null };

export function OrganisationForm({
  valeurs,
}: {
  valeurs: {
    nom: string;
    adresse: string;
    siret: string;
    telephone: string;
    emailContact: string;
    siteWeb: string;
    assuranceDecennale: string;
    mentionsLegales: string;
  };
}) {
  const [state, formAction, pending] = useActionState(
    modifierOrganisation,
    initial,
  );

  useEffect(() => {
    if (state.ok) toast.success("Organisation mise à jour.");
  }, [state]);

  // React réinitialise les inputs non contrôlés après l'action : en cas
  // d'erreur, state.saisie re-remplit les champs texte avec ce qui vient
  // d'être tapé (sinon valeurs en base). Le logo (input file) ne peut pas
  // être re-rempli — il devra être re-sélectionné.
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Nom" htmlFor="nom">
        <Input
          id="nom"
          name="nom"
          required
          maxLength={LIMITES.NOM}
          defaultValue={state.saisie?.nom ?? valeurs.nom}
        />
      </Field>

      <Field label="Adresse" htmlFor="adresse">
        <Input
          id="adresse"
          name="adresse"
          maxLength={LIMITES.ADRESSE}
          defaultValue={state.saisie?.adresse ?? valeurs.adresse}
          placeholder="14 rue des Charpentiers, 93100 Montreuil"
        />
      </Field>

      <Field label="SIRET" htmlFor="siret">
        <Input
          id="siret"
          name="siret"
          maxLength={LIMITES.SIRET}
          defaultValue={state.saisie?.siret ?? valeurs.siret}
          placeholder="123 456 789 00012"
        />
      </Field>

      {/* Contacts & mentions — imprimés sur le compte-rendu remis au client. */}
      <div className="space-y-4 border-t border-neutral-100 pt-4">
        <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
          Contacts & mentions (compte-rendu)
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Téléphone" htmlFor="telephone">
            <Input
              id="telephone"
              name="telephone"
              type="tel"
              maxLength={LIMITES.TELEPHONE}
              defaultValue={state.saisie?.telephone ?? valeurs.telephone}
              placeholder="01 23 45 67 89"
            />
          </Field>

          <Field label="Email de contact" htmlFor="emailContact">
            <Input
              id="emailContact"
              name="emailContact"
              type="email"
              maxLength={LIMITES.EMAIL}
              defaultValue={state.saisie?.emailContact ?? valeurs.emailContact}
              placeholder="contact@exemple.fr"
            />
          </Field>
        </div>

        <Field label="Site web" htmlFor="siteWeb">
          <Input
            id="siteWeb"
            name="siteWeb"
            maxLength={LIMITES.SITE_WEB}
            defaultValue={state.saisie?.siteWeb ?? valeurs.siteWeb}
            placeholder="www.exemple.fr"
          />
        </Field>

        <Field
          label="Assurance décennale"
          htmlFor="assuranceDecennale"
          aide="Assureur et n° de police — rassure le client sur le compte-rendu."
        >
          <Input
            id="assuranceDecennale"
            name="assuranceDecennale"
            maxLength={LIMITES.ASSURANCE}
            defaultValue={
              state.saisie?.assuranceDecennale ?? valeurs.assuranceDecennale
            }
            placeholder="AXA — police n° 123456789"
          />
        </Field>

        <Field
          label="Mentions légales"
          htmlFor="mentionsLegales"
          aide="Bloc libre imprimé en pied de compte-rendu (RCS, forme juridique, capital…)."
        >
          <Textarea
            id="mentionsLegales"
            name="mentionsLegales"
            maxLength={LIMITES.MENTIONS_LEGALES}
            defaultValue={state.saisie?.mentionsLegales ?? valeurs.mentionsLegales}
            rows={3}
          />
        </Field>
      </div>

      <Field
        label="Logo"
        htmlFor="logo"
        aide="PNG, JPEG ou WebP, 2 Mo maximum. Remplace le logo actuel."
      >
        <input
          id="logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="block w-full cursor-pointer rounded-md border border-neutral-300 bg-white text-sm text-neutral-600 shadow-xs file:mr-3 file:cursor-pointer file:rounded-l-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2.5 file:text-sm file:font-medium file:text-neutral-800 hover:file:bg-neutral-200"
        />
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
