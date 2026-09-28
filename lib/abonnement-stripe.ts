// Fail-closed au build : un import depuis un composant client casse la
// compilation (module SERVEUR UNIQUEMENT — secret Stripe).
import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, stripeEstConfigure } from "@/lib/stripe";
import { finDeGrace } from "@/lib/abonnement";
import { estContrainteUnique } from "@/lib/erreurs";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { StatutAbonnement } from "@/lib/generated/prisma/enums";

// Miroir local ← Stripe. SERVEUR UNIQUEMENT (secret Stripe). Deux chemins
// d'écriture, tous deux idempotents :
//   1. Webhooks (appliquerEvenementStripe) — le chemin nominal.
//   2. Réconciliation à l'ouverture de la page Abonnement par un ADMIN
//      (reconcilierAbonnement) + liaison au retour de Checkout
//      (lierDepuisCheckoutSession) — le filet qui couvre un webhook perdu,
//      sans cron (un endroit, basse fréquence).
// On ne fait JAMAIS d'appel API Stripe sur le chemin d'une navigation
// ordinaire : les guards lisent le miroir, déjà chargé par getCurrentUser().

// Champs d'abonnement d'une organisation tels que lus/écrits par ce module.
export type OrgAbonnement = {
  id: string;
  statutAbonnement: StatutAbonnement;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  impayeDepuis: Date | null;
  suspenduLe: Date | null;
};

export const SELECT_ORG_ABONNEMENT = {
  id: true,
  statutAbonnement: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  impayeDepuis: true,
  suspenduLe: true,
} as const;

// Infos de facturation affichées sur la page Abonnement (lues chez Stripe au
// moment de la réconciliation — jamais stockées : Stripe est la source de
// vérité, le local n'a besoin que du statut).
export type InfosFacturation = {
  prix: string | null; // « 39,00 € / mois »
  prochainPrelevement: Date | null;
  carte: { marque: string; fin: string } | null;
  resiliationPrevue: Date | null; // annulation programmée en fin de période
};

// Un champ Stripe « expandable » est un id ou l'objet complet selon la requête.
function idStripe(
  valeur: string | { id: string } | null | undefined,
): string | null {
  if (!valeur) return null;
  return typeof valeur === "string" ? valeur : valeur.id;
}

// Statut miroir dérivé du statut d'abonnement Stripe. SUSPENDU n'est jamais
// écrit ici : il est dérivé paresseusement de l'impayé + grâce
// (statutAbonnementEffectif) — Stripe ne connaît pas notre délai de grâce.
// `incomplete`/`paused` ne basculent rien : on garde le miroir courant.
function statutDepuisStripe(
  statut: Stripe.Subscription.Status,
): Exclude<StatutAbonnement, "EXONERE" | "SUSPENDU"> | null {
  switch (statut) {
    case "active":
    case "trialing":
      return "ACTIF";
    case "past_due":
    case "unpaid":
      return "IMPAYE";
    case "canceled":
    case "incomplete_expired":
      return "RESILIE";
    default:
      return null;
  }
}

type CibleMiroir = Pick<
  OrgAbonnement,
  "statutAbonnement" | "impayeDepuis" | "suspenduLe"
>;

// État du miroir à écrire pour un statut d'abonnement lu CHEZ STRIPE — une
// seule règle, partagée par les webhooks d'échéance et la réconciliation. On
// garde le PREMIER impayeDepuis (les échecs suivants des Smart Retries ne
// repoussent pas la grâce) et on horodate le passage effectif en lecture
// seule, constaté paresseusement (pas de cron) : la grâce est écoulée depuis
// finDeGrace().
function cibleDepuisStatutStripe(
  org: CibleMiroir,
  statut: Stripe.Subscription.Status,
  maintenant: Date,
): CibleMiroir {
  const cible: CibleMiroir = {
    statutAbonnement: statutDepuisStripe(statut) ?? org.statutAbonnement,
    impayeDepuis: null,
    suspenduLe: null,
  };
  if (cible.statutAbonnement === "IMPAYE") {
    cible.impayeDepuis = org.impayeDepuis ?? maintenant;
    cible.suspenduLe =
      org.suspenduLe ??
      (maintenant.getTime() >= finDeGrace(cible.impayeDepuis).getTime()
        ? finDeGrace(cible.impayeDepuis)
        : null);
  }
  return cible;
}

// Applique une transition d'abonnement UNE SEULE FOIS par événement Stripe :
// l'insertion de l'id d'événement et la mise à jour du miroir partagent la
// même transaction — une re-livraison (Stripe livre parfois deux fois) heurte
// la clé primaire et est ignorée. Les transitions elles-mêmes sont écrites
// pour être rejouables sans effet de bord.
async function transitionIdempotente(
  evenementId: string,
  organisationId: string,
  data: Prisma.OrganisationUpdateInput,
): Promise<void> {
  const deja = await prisma.stripeEventTraite.findUnique({
    where: { id: evenementId },
    select: { id: true },
  });
  if (deja) return;

  try {
    await prisma.$transaction([
      prisma.stripeEventTraite.create({ data: { id: evenementId } }),
      prisma.organisation.update({
        where: { id: organisationId },
        data,
      }),
    ]);
  } catch (e) {
    // Deux livraisons simultanées du même événement : la seconde perd la
    // course sur la clé primaire — déjà traité, rien à faire.
    if (estContrainteUnique(e)) return;
    throw e;
  }
}

async function orgParCustomer(
  customerId: string | null,
): Promise<OrgAbonnement | null> {
  if (!customerId) return null;
  return prisma.organisation.findUnique({
    where: { stripeCustomerId: customerId },
    select: SELECT_ORG_ABONNEMENT,
  });
}

// Traite un événement webhook Stripe (strict minimum d'événements écoutés).
// Un événement qui ne concerne aucune organisation connue est ignoré sans
// erreur (ex. résiliation d'un vieil abonnement après ré-abonnement, événement
// d'un autre environnement). Toute erreur levée ici fait répondre 500 au
// webhook — Stripe re-livrera.
export async function appliquerEvenementStripe(
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    // Souscription aboutie : lie customer/subscription à l'organisation
    // (passée en client_reference_id à la création de la session) → ACTIF.
    // Vaut aussi ré-abonnement après RESILIE (nouvelle subscription).
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription") return;

      const organisationId = session.client_reference_id;
      const customerId = idStripe(session.customer);
      const subscriptionId = idStripe(session.subscription);
      if (!organisationId || !customerId || !subscriptionId) {
        console.error(
          `Webhook Stripe ${event.id} : session Checkout incomplète (org/customer/subscription manquant).`,
        );
        return;
      }

      const org = await prisma.organisation.findUnique({
        where: { id: organisationId },
        select: { id: true },
      });
      if (!org) {
        console.error(
          `Webhook Stripe ${event.id} : organisation ${organisationId} inconnue.`,
        );
        return;
      }

      // Livraison tardive : si l'abonnement a été résilié entre-temps (son
      // `customer.subscription.deleted` a pu arriver AVANT cet événement),
      // le lier le ressusciterait en ACTIF. Stripe fait foi, pas l'ordre.
      const abonnement = await getStripe().subscriptions.retrieve(subscriptionId);
      if (statutDepuisStripe(abonnement.status) === "RESILIE") {
        console.warn(
          `Webhook Stripe ${event.id} : abonnement ${subscriptionId} déjà terminé (${abonnement.status}) — non lié.`,
        );
        return;
      }

      await transitionIdempotente(event.id, org.id, {
        statutAbonnement: "ACTIF",
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        impayeDepuis: null,
        suspenduLe: null,
      });
      return;
    }

    // Échéance payée ou échouée. Stripe ne garantit PAS l'ordre de
    // livraison : un vieux `payment_failed` re-livré après le `paid` qui l'a
    // régularisé repassait l'org en IMPAYE — puis en lecture seule à la fin
    // de la grâce — alors qu'elle était à jour. Le TYPE d'événement n'est donc
    // qu'un signal : l'état appliqué est celui de l'abonnement relu chez
    // Stripe à cet instant, avec la même règle que la réconciliation. Dans
    // n'importe quel ordre, les événements convergent vers le même miroir.
    // Une org RESILIE ne se réactive pas par une vieille facture — seule la
    // voie du nouveau Checkout la fait revenir.
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const org = await orgParCustomer(idStripe(invoice.customer));
      if (!org || !org.stripeSubscriptionId) return;
      if (
        org.statutAbonnement === "RESILIE" ||
        org.statutAbonnement === "EXONERE"
      ) {
        return;
      }

      // Appel API en échec → exception → 500 : Stripe re-livrera.
      const abonnement = await getStripe().subscriptions.retrieve(
        org.stripeSubscriptionId,
      );
      await transitionIdempotente(
        event.id,
        org.id,
        cibleDepuisStatutStripe(org, abonnement.status, new Date()),
      );
      return;
    }

    // Abonnement annulé → lecture seule. Matché sur l'id d'abonnement (pas le
    // customer) : la résiliation tardive d'un ANCIEN abonnement ne doit pas
    // couper une org qui s'est déjà ré-abonnée. `canceled` est terminal chez
    // Stripe : l'ordre de livraison n'y change rien.
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const org = await prisma.organisation.findUnique({
        where: { stripeSubscriptionId: subscription.id },
        select: { id: true },
      });
      if (!org) return;

      await transitionIdempotente(event.id, org.id, {
        statutAbonnement: "RESILIE",
        impayeDepuis: null,
        suspenduLe: null,
      });
      return;
    }

    default:
      return;
  }
}

const SESSION_ID_RE = /^cs_[a-zA-Z0-9_]+$/;

// Filet au retour de Checkout (success_url porte ?session_id=…) : lie la
// session à l'organisation SANS attendre le webhook — couvre le webhook non
// configuré en dev local et la latence de livraison. Best-effort et
// idempotent : vérifie que la session appartient bien à l'org de l'ADMIN
// connecté (un session_id forgé dans l'URL ne lie rien).
export async function lierDepuisCheckoutSession(
  organisationId: string,
  sessionId: string,
): Promise<void> {
  if (!stripeEstConfigure() || !SESSION_ID_RE.test(sessionId)) return;

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (
      session.client_reference_id !== organisationId ||
      session.mode !== "subscription" ||
      session.status !== "complete"
    ) {
      return;
    }
    const customerId = idStripe(session.customer);
    const subscriptionId = idStripe(session.subscription);
    if (!customerId || !subscriptionId) return;

    // Une URL de succès peut être ROUVERTE bien plus tard (historique,
    // autocomplétion). Sans ces gardes, la rejouer forçait ACTIF et remettait
    // à zéro la grâce d'impayé (répétable), voire re-liait un ancien
    // abonnement annulé à la place de l'actuel. Donc : déjà lié → rien (la
    // réconciliation de la page fait foi) ; sinon, on ne lie qu'un abonnement
    // réellement en vigueur chez Stripe.
    const org = await prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { stripeSubscriptionId: true },
    });
    if (org?.stripeSubscriptionId === subscriptionId) return;
    const abonnement = await getStripe().subscriptions.retrieve(subscriptionId);
    if (abonnement.status !== "active" && abonnement.status !== "trialing") {
      return;
    }

    await prisma.organisation.update({
      where: { id: organisationId },
      data: {
        statutAbonnement: "ACTIF",
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        impayeDepuis: null,
        suspenduLe: null,
      },
    });
  } catch (e) {
    // Le webhook reste le chemin nominal : on n'échoue jamais la page pour ça.
    console.error("Liaison Checkout → organisation échouée :", e);
  }
}

const INTERVALLES_FR: Record<string, string> = {
  day: "jour",
  week: "semaine",
  month: "mois",
  year: "an",
};

const MARQUES_CARTE: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  cartes_bancaires: "Cartes Bancaires",
};

function moyenDePaiement(
  subscription: Stripe.Subscription,
): InfosFacturation["carte"] {
  // default_payment_method de l'abonnement (posé par Checkout), sinon celui
  // du customer (invoice_settings) — les deux sont demandés en expand.
  let pm = subscription.default_payment_method;
  if (!pm || typeof pm === "string") {
    const customer = subscription.customer;
    if (typeof customer === "object" && !("deleted" in customer)) {
      pm = customer.invoice_settings?.default_payment_method ?? pm;
    }
  }
  if (!pm || typeof pm === "string" || !pm.card) return null;
  return {
    marque: MARQUES_CARTE[pm.card.brand] ?? pm.card.brand,
    fin: pm.card.last4,
  };
}

function infosFacturation(
  subscription: Stripe.Subscription,
  statutMiroir: StatutAbonnement,
): InfosFacturation {
  const item = subscription.items.data[0];
  const price = item?.price;

  let prix: string | null = null;
  if (price && price.unit_amount !== null) {
    const montant = new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: price.currency.toUpperCase(),
    }).format(price.unit_amount / 100);
    const intervalle = price.recurring
      ? (INTERVALLES_FR[price.recurring.interval] ?? price.recurring.interval)
      : null;
    prix = intervalle ? `${montant} / ${intervalle}` : montant;
  }

  // API Stripe « basil » : la fin de période courante vit sur l'ITEM
  // d'abonnement, plus sur l'abonnement lui-même.
  const finPeriode = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : null;

  const resiliationPrevue = subscription.cancel_at_period_end
    ? subscription.cancel_at
      ? new Date(subscription.cancel_at * 1000)
      : finPeriode
    : null;

  return {
    prix,
    prochainPrelevement:
      resiliationPrevue || statutMiroir === "RESILIE" ? null : finPeriode,
    carte: moyenDePaiement(subscription),
    resiliationPrevue,
  };
}

// Une facture affichée dans l'app (source Stripe, jamais stockée). Le PDF
// pointe directement chez Stripe (URL signée par Stripe, valable sans session)
// — parfait pour la compta : un clic = le PDF officiel.
export type FactureLigne = {
  id: string;
  numero: string | null;
  date: Date;
  montant: string; // « 39,00 € »
  statutLabel: string;
  payee: boolean;
  pdfUrl: string | null;
};

const STATUT_FACTURE_LABELS: Record<string, string> = {
  paid: "Payée",
  open: "À régler",
  uncollectible: "Irrécouvrable",
  void: "Annulée",
};

function formatMontant(montant: number, devise: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: devise.toUpperCase(),
  }).format(montant / 100);
}

// Historique de facturation d'un customer Stripe, du plus récent au plus
// ancien, pour la compta (la page Abonnement les regroupe par mois). Les
// brouillons (jamais émis) sont exclus. Best-effort et SERVEUR UNIQUEMENT :
// Stripe injoignable → liste vide, la page affiche le reste sans erreur.
export async function listerFactures(
  customerId: string | null,
  limit = 24,
): Promise<FactureLigne[]> {
  if (!stripeEstConfigure() || !customerId) return [];

  try {
    const res = await getStripe().invoices.list({
      customer: customerId,
      limit,
    });
    return res.data
      .filter((inv) => inv.status && inv.status !== "draft")
      .map((inv) => ({
        id: inv.id ?? "",
        numero: inv.number ?? null,
        date: new Date(inv.created * 1000),
        montant: formatMontant(inv.total, inv.currency),
        statutLabel: STATUT_FACTURE_LABELS[inv.status ?? ""] ?? "—",
        payee: inv.status === "paid",
        pdfUrl: inv.invoice_pdf ?? null,
      }));
  } catch (e) {
    console.error("Liste des factures Stripe indisponible :", e);
    return [];
  }
}

export type Reconciliation = {
  org: OrgAbonnement;
  facturation: InfosFacturation | null;
};

// Filet de réconciliation à l'ouverture de la page Abonnement par un ADMIN :
// relit l'abonnement chez Stripe, réaligne le miroir local s'il a dérivé
// (webhook perdu), et en profite pour rapporter les infos d'affichage (prix,
// prochain prélèvement, carte). Best-effort : si Stripe est injoignable, la
// page affiche le miroir local tel quel.
export async function reconcilierAbonnement(
  org: OrgAbonnement,
): Promise<Reconciliation> {
  if (!stripeEstConfigure() || !org.stripeSubscriptionId) {
    return { org, facturation: null };
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await getStripe().subscriptions.retrieve(
      org.stripeSubscriptionId,
      {
        expand: [
          "default_payment_method",
          "customer.invoice_settings.default_payment_method",
        ],
      },
    );
  } catch (e) {
    console.error(
      "Réconciliation Stripe impossible — le miroir local fait foi :",
      e,
    );
    return { org, facturation: null };
  }

  const cible = cibleDepuisStatutStripe(org, subscription.status, new Date());

  let orgAJour = org;
  const aChange =
    cible.statutAbonnement !== org.statutAbonnement ||
    cible.impayeDepuis?.getTime() !== org.impayeDepuis?.getTime() ||
    cible.suspenduLe?.getTime() !== org.suspenduLe?.getTime();
  if (aChange) {
    orgAJour = await prisma.organisation.update({
      where: { id: org.id },
      data: cible,
      select: SELECT_ORG_ABONNEMENT,
    });
  }

  return {
    org: orgAJour,
    facturation: infosFacturation(subscription, orgAJour.statutAbonnement),
  };
}
