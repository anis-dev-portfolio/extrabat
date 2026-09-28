import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { appliquerEvenementStripe } from "@/lib/abonnement-stripe";

// Webhooks Stripe — la plomberie critique du miroir d'abonnement. Route
// Handler HORS de /app : pas de session utilisateur, l'authentification est la
// VÉRIFICATION DE SIGNATURE (STRIPE_WEBHOOK_SECRET). Même leçon que la PWA :
// tout ce qui doit survivre aux contextes sans session passe par une route.
//
// En dev local : `stripe listen --forward-to localhost:3000/api/stripe/webhook`
// (le secret whsec_… affiché par la CLI va dans STRIPE_WEBHOOK_SECRET).
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    // Pas de 200 : si Stripe est branché mais l'env incomplet, l'événement
    // doit rester visible en échec côté Stripe, pas disparaître en silence.
    return NextResponse.json(
      { error: "Webhook Stripe non configuré." },
      { status: 503 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Signature absente." }, { status: 400 });
  }

  // La vérification exige le CORPS BRUT (le moindre re-sérialisage JSON casse
  // la signature) — d'où req.text() et jamais req.json().
  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      await req.text(),
      signature,
      secret,
    );
  } catch {
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  try {
    await appliquerEvenementStripe(event);
  } catch (e) {
    // 500 → Stripe re-livrera l'événement (l'idempotence rend le rejeu sûr).
    console.error(`Webhook Stripe ${event.id} (${event.type}) en échec :`, e);
    return NextResponse.json({ error: "Traitement échoué." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
