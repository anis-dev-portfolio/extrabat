"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getStripe, getStripePriceId, stripeEstConfigure } from "@/lib/stripe";
import { SELECT_ORG_ABONNEMENT } from "@/lib/abonnement-stripe";
import { ErreurMetier, messageFromError } from "@/lib/erreurs";

export type AbonnementState = { error: string | null };

// ⚠️ Ces actions utilisent requireRole, PAS requireRoleActif : le paiement est
// la seule mutation jamais bloquée par la suspension — sinon le client ne peut
// pas se réactiver lui-même.

// Base des URLs de retour Stripe. Les Server Actions sont des POST same-origin
// (Next vérifie l'Origin) : l'en-tête est fiable ; à défaut, l'hôte transmis
// par le proxy (Vercel).
async function urlBase(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

// Ouvre une session Stripe Checkout (mode subscription) pour mettre en place
// le paiement mensuel. La session est créée CÔTÉ SERVEUR (secret) et son URL
// est à usage unique ; l'organisation voyage en client_reference_id pour que
// le webhook sache qui lier. redirect() hors de tout try/catch (il lève).
// Signature sans (prev, formData) : l'action n'en lit rien, et un zéro-arg
// reste assignable au type d'action attendu par useActionState.
export async function ouvrirCheckout(): Promise<AbonnementState> {
  const user = await requireRole(["ASSISTANTE", "ADMIN"]);

  if (!stripeEstConfigure()) {
    return { error: "La facturation en ligne n'est pas encore activée." };
  }

  let url: string;
  try {
    const org = await prisma.organisation.findUniqueOrThrow({
      where: { id: user.organisationId },
      select: SELECT_ORG_ABONNEMENT,
    });
    // Garde-fou anti double abonnement : tant que l'abonnement existant n'est
    // pas résilié, tout passe par le Customer Portal (y compris régler un
    // impayé) — jamais une deuxième souscription.
    if (org.stripeSubscriptionId && org.statutAbonnement !== "RESILIE") {
      throw new ErreurMetier(
        "Un abonnement est déjà en place — passez par « Gérer le paiement et les factures ».",
      );
    }

    const base = await urlBase();
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      client_reference_id: user.organisationId,
      // Ré-abonnement après résiliation : on garde le même customer Stripe
      // (historique de factures continu) ; sinon Checkout le crée, prérempli
      // avec l'email de l'utilisateur connecté (ADMIN ou ASSISTANTE).
      customer: org.stripeCustomerId ?? undefined,
      customer_email: org.stripeCustomerId ? undefined : user.email,
      line_items: [{ price: getStripePriceId(), quantity: 1 }],
      locale: "fr",
      // session_id : filet de liaison au retour (page Abonnement) si le
      // webhook n'est pas encore passé — indispensable en dev local.
      success_url: `${base}/app/parametres/abonnement?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/app/parametres/abonnement`,
      subscription_data: {
        metadata: { organisationId: user.organisationId },
      },
    });
    if (!session.url) {
      throw new Error("Session Checkout créée sans URL de paiement.");
    }
    url = session.url;
  } catch (e) {
    return { error: messageFromError(e) };
  }

  redirect(url);
}

// Ouvre le Customer Portal Stripe : changer de carte, voir/télécharger les
// factures, historique — zéro UI de facturation à construire côté app.
export async function ouvrirPortail(): Promise<AbonnementState> {
  const user = await requireRole(["ASSISTANTE", "ADMIN"]);

  if (!stripeEstConfigure()) {
    return { error: "La facturation en ligne n'est pas encore activée." };
  }

  let url: string;
  try {
    const org = await prisma.organisation.findUniqueOrThrow({
      where: { id: user.organisationId },
      select: { stripeCustomerId: true },
    });
    if (!org.stripeCustomerId) {
      throw new ErreurMetier(
        "Aucun paiement n'est encore en place pour votre organisation.",
      );
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${await urlBase()}/app/parametres/abonnement`,
    });
    url = session.url;
  } catch (e) {
    return { error: messageFromError(e) };
  }

  redirect(url);
}
