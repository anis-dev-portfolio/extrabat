"use client";

import { useActionState } from "react";
import { CreditCard, ReceiptText } from "lucide-react";
import { Button, type BoutonVariante } from "@/components/ui/button";
import {
  ouvrirCheckout,
  ouvrirPortail,
  type AbonnementState,
} from "./actions";

// Boutons de la carte Abonnement : chaque clic crée une session Stripe côté
// serveur puis redirige (Checkout ou Customer Portal). useActionState pour
// afficher un éventuel refus (Stripe non configuré, abonnement déjà en
// place…) au lieu d'échouer en silence.
const INITIAL: AbonnementState = { error: null };

function FormStripe({
  action,
  libelle,
  Icone,
  variante,
}: {
  action: () => Promise<AbonnementState>;
  libelle: string;
  Icone: typeof CreditCard;
  variante: BoutonVariante;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="space-y-2">
      <Button type="submit" variante={variante} disabled={pending}>
        <Icone className="size-4" aria-hidden="true" />
        {pending ? "Redirection vers Stripe…" : libelle}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function BoutonCheckout({
  variante = "primaire",
}: {
  variante?: BoutonVariante;
}) {
  return (
    <FormStripe
      action={ouvrirCheckout}
      libelle="Mettre en place le paiement"
      Icone={CreditCard}
      variante={variante}
    />
  );
}

export function BoutonPortail({
  variante = "secondaire",
}: {
  variante?: BoutonVariante;
}) {
  return (
    <FormStripe
      action={ouvrirPortail}
      libelle="Gérer le paiement et les factures"
      Icone={ReceiptText}
      variante={variante}
    />
  );
}
