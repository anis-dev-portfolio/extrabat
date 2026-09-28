// Fail-closed au build : un import (même transitif) depuis un composant
// client casse la compilation au lieu d'exposer le secret — même garde que
// lib/supabase/admin.ts.
import "server-only";
import Stripe from "stripe";

// Client Stripe côté serveur. STRIPE_SECRET_KEY est SERVEUR UNIQUEMENT (même
// règle que SUPABASE_SERVICE_ROLE_KEY) : ce module ne doit jamais être importé
// depuis un composant client. Instanciation paresseuse : l'app doit builder et
// tourner sans Stripe configuré (orgs EXONERE, dev local sans facturation).

let client: Stripe | null = null;

// Stripe est-il configuré dans cet environnement ? Sans ces variables, la page
// Abonnement n'affiche que la fiche contact et aucune UI de facturation.
export function stripeEstConfigure(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

export function getStripe(): Stripe {
  const cle = process.env.STRIPE_SECRET_KEY;
  if (!cle) {
    throw new Error(
      "STRIPE_SECRET_KEY manquante : la facturation Stripe n'est pas configurée.",
    );
  }
  // Pas d'apiVersion épinglée ici : le SDK épingle lui-même la version d'API
  // correspondant à ses types — les deux restent alignés à chaque mise à jour.
  client ??= new Stripe(cle);
  return client;
}

// ID du tarif mensuel (défini dans Stripe, jamais dans le code : changer le
// prix ne doit pas demander un déploiement).
export function getStripePriceId(): string {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    throw new Error(
      "STRIPE_PRICE_ID manquant : la facturation Stripe n'est pas configurée.",
    );
  }
  return priceId;
}
