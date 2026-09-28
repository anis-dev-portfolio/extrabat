"use client";

import { useActionState, useEffect, useState } from "react";
import { Mail, Pencil, Phone } from "lucide-react";
import {
  modifierDossier,
  type ModifierDossierState,
} from "../actions";
import { Button, TACTILE_MOBILE } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { AdresseAutocomplete } from "@/components/ui/adresse-autocomplete";
import { toast } from "@/components/ui/toaster";
import { telHref } from "@/components/conducteur/bouton-appel";
import { LIMITES } from "@/lib/validation";

const initial: ModifierDossierState = { error: null, ok: false, saisie: null };

// Infos client de la fiche dossier : lecture par défaut, édition sur place
// (faute de frappe dans le téléphone = deux clics, plus un dossier à refaire).
export function ClientDossier({
  dossier,
}: {
  dossier: {
    id: string;
    nomClient: string;
    adresse: string;
    telephone: string;
    email: string | null;
    infosAcces: string | null;
  };
}) {
  const [edition, setEdition] = useState(false);
  const action = modifierDossier.bind(null, dossier.id);
  const [state, formAction, pending] = useActionState(action, initial);

  useEffect(() => {
    if (state === initial) return;
    if (state.ok) {
      toast.success("Infos client mises à jour.");
      setEdition(false);
    }
  }, [state]);

  // React réinitialise les inputs non contrôlés après l'action : après une
  // erreur serveur, la saisie renvoyée par l'action re-remplit le formulaire
  // (sinon les modifications reviendraient aux valeurs du dossier) ; en
  // ouverture normale, valeurs actuelles du dossier.
  const valeurs = state.saisie ?? {
    nomClient: dossier.nomClient,
    adresse: dossier.adresse,
    telephone: dossier.telephone,
    email: dossier.email ?? "",
    infosAcces: dossier.infosAcces ?? "",
  };

  if (!edition) {
    return (
      <div className="space-y-3">
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs text-neutral-500">Adresse</dt>
            <dd className="text-neutral-800">{dossier.adresse}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Téléphone</dt>
            <dd>
              <a
                href={telHref(dossier.telephone)}
                className="inline-flex items-center gap-1.5 font-medium text-primary-800 tabular-nums hover:underline"
              >
                <Phone className="size-3.5" aria-hidden="true" />
                {dossier.telephone}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Email</dt>
            <dd>
              {dossier.email ? (
                <a
                  href={`mailto:${dossier.email}`}
                  className="inline-flex items-center gap-1.5 break-all font-medium text-primary-800 hover:underline"
                >
                  <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                  {dossier.email}
                </a>
              ) : (
                <span className="text-neutral-400">—</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Infos d&apos;accès</dt>
            <dd className="whitespace-pre-wrap text-neutral-800">
              {dossier.infosAcces || (
                <span className="text-neutral-400">—</span>
              )}
            </dd>
          </div>
        </dl>
        <Button
          variante="secondaire"
          taille="sm"
          className={TACTILE_MOBILE}
          onClick={() => setEdition(true)}
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          Modifier
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <Field label="Nom du client" htmlFor="nomClient">
        <Input
          id="nomClient"
          name="nomClient"
          required
          maxLength={LIMITES.NOM}
          defaultValue={valeurs.nomClient}
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
          defaultValue={valeurs.adresse}
        />
      </Field>
      <Field label="Téléphone" htmlFor="telephone">
        <Input
          id="telephone"
          name="telephone"
          type="tel"
          required
          maxLength={LIMITES.TELEPHONE}
          defaultValue={valeurs.telephone}
        />
      </Field>
      <Field label="Email (optionnel)" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          maxLength={LIMITES.EMAIL}
          defaultValue={valeurs.email}
          placeholder="client@exemple.fr"
        />
      </Field>
      <Field label="Infos d'accès" htmlFor="infosAcces">
        <Textarea
          id="infosAcces"
          name="infosAcces"
          maxLength={LIMITES.INFOS_ACCES}
          defaultValue={valeurs.infosAcces}
          placeholder="Étage, code interphone…"
        />
      </Field>

      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" taille="sm" className={TACTILE_MOBILE} disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button
          variante="fantome"
          taille="sm"
          className={TACTILE_MOBILE}
          disabled={pending}
          onClick={() => setEdition(false)}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
