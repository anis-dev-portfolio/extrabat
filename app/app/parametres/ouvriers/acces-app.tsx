"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Send } from "lucide-react";
import { Button, TACTILE_MOBILE } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { LIMITES } from "@/lib/validation";
import {
  donnerAccesOuvrier,
  nouveauMotDePasseOuvrier,
  type AccesOuvrierState,
} from "./actions";

const initial: AccesOuvrierState = { error: null, ok: false, motDePasse: null };

// Mot de passe tout juste tiré (création d'accès ou renouvellement) : c'est
// la SEULE fois où il est visible — il n'est stocké nulle part en clair.
// L'assistante le note ou le dicte, puis referme le panneau.
function PanneauMotDePasse({
  motDePasse,
  onTermine,
}: {
  motDePasse: string;
  onTermine: () => void;
}) {
  return (
    <div
      role="status"
      className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3"
    >
      <p className="text-sm text-neutral-800">
        Mot de passe de connexion :{" "}
        <span className="font-mono text-base font-semibold tracking-wide select-all">
          {motDePasse}
        </span>
      </p>
      <p className="text-xs text-neutral-600">
        Communiquez-le à l&apos;ouvrier maintenant : il ne sera plus affiché.
        Il pourra le changer depuis Paramètres → Mot de passe.
      </p>
      <Button
        type="button"
        taille="sm"
        variante="secondaire"
        className={TACTILE_MOBILE}
        onClick={onTermine}
      >
        C&apos;est noté
      </Button>
    </div>
  );
}

// Formulaire « Donner un accès » ancré sur la fiche ouvrier sélectionnée :
// crée le compte Supabase Auth (mot de passe PROPRE à cet ouvrier, tiré au
// hasard côté serveur — pas d'invitation par email à gérer sur un chantier)
// + le MembreAutorise(OUVRIER, ouvrierId) qui lie le futur compte à la fiche.
// L'action ne revalide pas la page : on garde le mot de passe à l'écran, et
// on rafraîchit quand l'assistante confirme l'avoir noté.
export function FormAccesOuvrier({ ouvrierId }: { ouvrierId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    donnerAccesOuvrier,
    initial,
  );

  if (state.ok && state.motDePasse) {
    return (
      <PanneauMotDePasse
        motDePasse={state.motDePasse}
        onTermine={() => router.refresh()}
      />
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="ouvrierId" value={ouvrierId} />
      <Field
        label="Email de connexion"
        htmlFor="email-acces"
        aide="Son espace n'affiche que ses chantiers — jamais de montants."
      >
        <Input
          id="email-acces"
          name="email"
          type="email"
          required
          maxLength={LIMITES.EMAIL}
          placeholder="prenom.nom@exemple.fr"
        />
      </Field>

      <p className="text-xs text-neutral-500">
        Un mot de passe propre à cet ouvrier est créé et affiché une seule
        fois.
      </p>

      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        variante="secondaire"
        disabled={pending}
        className={TACTILE_MOBILE}
      >
        <Send className="size-4" aria-hidden="true" />
        {pending ? "Création…" : "Donner un accès"}
      </Button>
    </form>
  );
}

// « Nouveau mot de passe » : mot de passe perdu, ou compte créé à l'époque du
// mot de passe partagé. L'ancien cesse aussitôt de fonctionner.
export function BoutonNouveauMotDePasse({
  ouvrierId,
  nom,
}: {
  ouvrierId: string;
  nom: string;
}) {
  const [confirmation, setConfirmation] = useState(false);
  const [motDePasse, setMotDePasse] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function renouveler() {
    setConfirmation(false);
    startTransition(async () => {
      const res = await nouveauMotDePasseOuvrier(ouvrierId);
      if (res.error || !res.motDePasse) {
        toast.error(res.error ?? "Le mot de passe n'a pas pu être changé.");
        return;
      }
      setMotDePasse(res.motDePasse);
    });
  }

  if (motDePasse) {
    return (
      <PanneauMotDePasse
        motDePasse={motDePasse}
        onTermine={() => setMotDePasse(null)}
      />
    );
  }

  return (
    <>
      <Button
        type="button"
        taille="sm"
        variante="secondaire"
        disabled={pending}
        className={TACTILE_MOBILE}
        onClick={() => setConfirmation(true)}
      >
        <KeyRound className="size-4" aria-hidden="true" />
        {pending ? "Création…" : "Nouveau mot de passe"}
      </Button>
      {confirmation && (
        <ConfirmDialog
          ouvert
          onFermer={() => setConfirmation(false)}
          titre="Créer un nouveau mot de passe ?"
          description={`L'ancien mot de passe de ${nom} ne fonctionnera plus. Le nouveau sera affiché une seule fois.`}
          labelConfirmer="Créer"
          onConfirmer={renouveler}
        />
      )}
    </>
  );
}
