import Link from "next/link";
import { AlertTriangle, OctagonAlert, Phone } from "lucide-react";
import {
  finDeGrace,
  statutAbonnementEffectif,
  type AbonnementOrganisation,
} from "@/lib/abonnement";
import { SUPPORT } from "@/lib/support";
import { formatDateFr } from "@/lib/format";
import type { Role } from "@/lib/generated/prisma/enums";

// Bandeau persistant du shell /app selon le statut EFFECTIF de l'abonnement
// (SUSPENDU dérivé paresseusement de l'impayé + grâce). Confort, pas
// sécurité : la coupure réelle vit dans requireRoleActif / garderConducteur.
// Rien pour ACTIF/EXONERE ; l'IMPAYE n'est montré qu'à l'ADMIN (les autres
// rôles gardent un accès normal et n'ont pas à voir la facturation) ; la
// suspension est montrée à tous, avec un message adapté au rôle.
export function BandeauAbonnement({
  organisation,
  role,
}: {
  organisation: AbonnementOrganisation;
  role: Role;
}) {
  const effectif = statutAbonnementEffectif(organisation);

  if (effectif === "IMPAYE" && role === "ADMIN" && organisation.impayeDepuis) {
    return (
      <div
        role="alert"
        className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden"
      >
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          Échec du paiement le {formatDateFr(organisation.impayeDepuis)} —
          mettez à jour votre moyen de paiement avant le{" "}
          {formatDateFr(finDeGrace(organisation.impayeDepuis))}, sinon
          l&apos;accès passera en lecture seule.
        </span>
        <Link
          href="/app/parametres/abonnement"
          className="font-medium underline underline-offset-2 hover:text-amber-950"
        >
          Régulariser le paiement
        </Link>
      </div>
    );
  }

  if (effectif !== "SUSPENDU" && effectif !== "RESILIE") return null;

  const motif = effectif === "RESILIE" ? "Abonnement résilié" : "Compte suspendu";

  // ASSISTANTE / CONDUCTEUR ne peuvent rien payer : message neutre, sans
  // détail de facturation — c'est l'administrateur qui régularise.
  if (role !== "ADMIN") {
    return (
      <div
        role="alert"
        className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 print:hidden"
      >
        <OctagonAlert className="size-4 shrink-0" aria-hidden="true" />
        <span>
          {motif} — la consultation reste possible, mais plus aucune
          modification. Contactez votre administrateur.
        </span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 print:hidden"
    >
      <OctagonAlert className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">
        {motif} — vos données sont intactes mais l&apos;accès est en lecture
        seule.{" "}
        {effectif === "RESILIE"
          ? "Réabonnez-vous pour tout réactiver à l'identique."
          : "Le règlement du paiement en retard réactive tout immédiatement."}
      </span>
      <span className="flex items-center gap-3">
        <Link
          href="/app/parametres/abonnement"
          className="font-medium underline underline-offset-2 hover:text-red-900"
        >
          Régulariser le paiement
        </Link>
        {/* Le moment où parler à un humain compte le plus. */}
        <a
          href={`tel:${SUPPORT.telephoneLien}`}
          className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:text-red-900"
        >
          <Phone className="size-3.5" aria-hidden="true" />
          {SUPPORT.nom} : {SUPPORT.telephoneAffiche}
        </a>
      </span>
    </div>
  );
}
