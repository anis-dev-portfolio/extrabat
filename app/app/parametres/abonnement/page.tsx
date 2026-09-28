import type { Metadata } from "next";
import { BadgeCheck, Download, Mail, Phone } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  STATUT_ABONNEMENT_LABELS,
  finDeGrace,
  statutAbonnementEffectif,
} from "@/lib/abonnement";
import {
  SELECT_ORG_ABONNEMENT,
  lierDepuisCheckoutSession,
  listerFactures,
  reconcilierAbonnement,
  type FactureLigne,
  type InfosFacturation,
} from "@/lib/abonnement-stripe";
import { stripeEstConfigure } from "@/lib/stripe";
import { SUPPORT } from "@/lib/support";
import { formatDateFr } from "@/lib/format";
import type { StatutAbonnement } from "@/lib/generated/prisma/enums";
import { Badge, type BadgeTon } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { boutonClasses } from "@/components/ui/button";
import { EnteteParametres } from "../entete";
import { BoutonCheckout, BoutonPortail } from "./boutons";

const TON_STATUT: Record<StatutAbonnement, BadgeTon> = {
  EXONERE: "neutre",
  ACTIF: "vert",
  IMPAYE: "ambre",
  SUSPENDU: "rouge",
  RESILIE: "rouge",
};

function LigneInfo({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-sm text-neutral-500">{libelle}</dt>
      <dd className="text-right text-sm font-medium text-neutral-900">
        {valeur}
      </dd>
    </div>
  );
}

// Détail de la carte Abonnement selon le statut EFFECTIF (SUSPENDU dérivé de
// l'impayé + grâce écoulée). Le paiement reste possible dans tous les états —
// c'est la seule « mutation » jamais bloquée.
function CorpsAbonnement({
  effectif,
  impayeDepuis,
  suspenduLe,
  facturation,
  stripeActif,
  aAbonnement,
}: {
  effectif: StatutAbonnement;
  impayeDepuis: Date | null;
  suspenduLe: Date | null;
  facturation: InfosFacturation | null;
  stripeActif: boolean;
  aAbonnement: boolean;
}) {
  if (!stripeActif) {
    return (
      <p className="text-sm text-neutral-500">
        La facturation en ligne n&apos;est pas encore activée pour ExtraBat.
        Pour toute question sur votre abonnement, utilisez la fiche contact
        ci-contre.
      </p>
    );
  }

  if (effectif === "EXONERE") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-neutral-500">
          Aucune facturation n&apos;est active pour votre compte. La mise en
          place du paiement mensuel se fait ici, en accord avec votre contact
          ExtraBat.
        </p>
        <BoutonCheckout variante="secondaire" />
      </div>
    );
  }

  if (effectif === "RESILIE") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-700">
          Abonnement résilié — l&apos;accès est en lecture seule. Vos données
          sont intégralement conservées : en vous réabonnant, tout redevient
          disponible à l&apos;identique, immédiatement.
        </p>
        <BoutonCheckout />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {effectif === "IMPAYE" && impayeDepuis && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Échec du paiement le {formatDateFr(impayeDepuis)} — mettez à jour
          votre moyen de paiement avant le {formatDateFr(finDeGrace(impayeDepuis))},
          sinon l&apos;accès passera en lecture seule.
        </p>
      )}
      {effectif === "SUSPENDU" && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Accès en lecture seule
          {suspenduLe ? ` depuis le ${formatDateFr(suspenduLe)}` : ""} suite à
          un impayé
          {impayeDepuis ? ` du ${formatDateFr(impayeDepuis)}` : ""}. Le
          règlement de la facture en retard réactive immédiatement toutes les
          fonctions.
        </p>
      )}

      {facturation && (
        <dl className="divide-y divide-neutral-100">
          {facturation.prix && (
            <LigneInfo libelle="Formule" valeur={facturation.prix} />
          )}
          {facturation.prochainPrelevement && (
            <LigneInfo
              libelle="Prochain prélèvement"
              valeur={formatDateFr(facturation.prochainPrelevement)}
            />
          )}
          {facturation.carte && (
            <LigneInfo
              libelle="Moyen de paiement"
              valeur={`${facturation.carte.marque} •••• ${facturation.carte.fin}`}
            />
          )}
          {facturation.resiliationPrevue && (
            <LigneInfo
              libelle="Fin de l'abonnement"
              valeur={formatDateFr(facturation.resiliationPrevue)}
            />
          )}
        </dl>
      )}

      {aAbonnement && (
        <BoutonPortail
          variante={effectif === "ACTIF" ? "secondaire" : "primaire"}
        />
      )}
    </div>
  );
}

// Regroupe les factures par mois civil, en conservant l'ordre décroissant
// renvoyé par Stripe — la compta télécharge « toutes les factures du mois ».
function grouperParMois(
  factures: FactureLigne[],
): { mois: string; factures: FactureLigne[] }[] {
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  });
  const groupes: { mois: string; factures: FactureLigne[] }[] = [];
  for (const facture of factures) {
    const mois = fmt.format(facture.date);
    const dernier = groupes.at(-1);
    if (dernier && dernier.mois === mois) dernier.factures.push(facture);
    else groupes.push({ mois, factures: [facture] });
  }
  return groupes;
}

function CarteFactures({ factures }: { factures: FactureLigne[] }) {
  return (
    <Card>
      <CardHeader
        titre="Factures"
        action={
          <span className="text-xs text-neutral-500">
            Pour votre comptabilité
          </span>
        }
      />
      <CardBody>
        {factures.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Aucune facture disponible pour l&apos;instant. Elles apparaîtront ici
            au fil des prélèvements mensuels, téléchargeables en PDF.
          </p>
        ) : (
          <div className="space-y-5">
            {grouperParMois(factures).map((groupe) => (
              <div key={groupe.mois}>
                <p className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                  <span className="capitalize">{groupe.mois}</span>
                </p>
                <ul className="divide-y divide-neutral-100 overflow-hidden rounded-md border border-neutral-200">
                  {groupe.factures.map((facture) => (
                    <li
                      key={facture.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-neutral-900 tabular-nums">
                            {facture.montant}
                          </span>
                          <Badge ton={facture.payee ? "vert" : "ambre"}>
                            {facture.statutLabel}
                          </Badge>
                        </p>
                        <p className="text-xs text-neutral-500 tabular-nums">
                          {facture.numero ? `${facture.numero} · ` : ""}
                          {formatDateFr(facture.date)}
                        </p>
                      </div>
                      {facture.pdfUrl ? (
                        <a
                          href={facture.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={boutonClasses("secondaire", "sm")}
                        >
                          <Download className="size-4" aria-hidden="true" />
                          PDF
                        </a>
                      ) : (
                        <span className="text-xs text-neutral-400">
                          PDF indisponible
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export const metadata: Metadata = { title: "Abonnement" };

export default async function AbonnementPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const user = await requireRole(["ASSISTANTE", "ADMIN"]);
  const { session_id: sessionId } = await searchParams;

  // Retour de Checkout : lie la session à l'org sans attendre le webhook.
  if (sessionId) {
    await lierDepuisCheckoutSession(user.organisationId, sessionId);
  }

  // Filet de réconciliation : à chaque ouverture de cette page (basse
  // fréquence, ADMIN ou ASSISTANTE), le statut est resynchronisé depuis l'API
  // Stripe — couvre un webhook perdu, sans cron. Partout ailleurs, seul le
  // miroir local est lu.
  const orgDb = await prisma.organisation.findUniqueOrThrow({
    where: { id: user.organisationId },
    select: SELECT_ORG_ABONNEMENT,
  });
  const { org, facturation } = await reconcilierAbonnement(orgDb);
  const effectif = statutAbonnementEffectif(org);
  const stripeActif = stripeEstConfigure();
  // Factures (best-effort, source Stripe) : seulement si un abonnement existe.
  const factures =
    stripeActif && org.stripeCustomerId
      ? await listerFactures(org.stripeCustomerId)
      : [];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <EnteteParametres
        titre="Abonnement & factures"
        description="État de votre abonnement ExtraBat, factures à télécharger et coordonnées de votre contact."
      />

      {sessionId && effectif === "ACTIF" && (
        <p className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <BadgeCheck className="size-4 shrink-0" aria-hidden="true" />
          Paiement mis en place — votre abonnement est actif. Merci !
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            titre="Abonnement"
            action={
              <Badge ton={TON_STATUT[effectif]}>
                {effectif === "EXONERE"
                  ? "—"
                  : STATUT_ABONNEMENT_LABELS[effectif]}
              </Badge>
            }
          />
          <CardBody>
            <CorpsAbonnement
              effectif={effectif}
              impayeDepuis={org.impayeDepuis}
              suspenduLe={org.suspenduLe}
              facturation={facturation}
              stripeActif={stripeActif}
              aAbonnement={Boolean(org.stripeCustomerId)}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader titre="Votre contact ExtraBat" />
          <CardBody className="space-y-4">
            <p className="text-sm text-neutral-500">
              Une question, une demande de modification d&apos;ExtraBat, un
              souci de paiement&nbsp;? Contactez directement votre
              interlocuteur.
            </p>
            <div>
              <p className="font-medium text-neutral-900">{SUPPORT.nom}</p>
              <p className="text-sm text-neutral-500">{SUPPORT.role}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* tel: — un clic = un appel, précieux sur mobile/PWA. */}
              <a
                href={`tel:${SUPPORT.telephoneLien}`}
                className={boutonClasses("primaire")}
              >
                <Phone className="size-4" aria-hidden="true" />
                {SUPPORT.telephoneAffiche}
              </a>
              <a
                href={`mailto:${SUPPORT.email}`}
                className={boutonClasses("secondaire")}
              >
                <Mail className="size-4" aria-hidden="true" />
                {SUPPORT.email}
              </a>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Factures téléchargeables — seulement si un abonnement Stripe existe. */}
      {stripeActif && org.stripeCustomerId && (
        <CarteFactures factures={factures} />
      )}
    </div>
  );
}
