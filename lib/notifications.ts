import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { TypeNotification } from "@/lib/generated/prisma/enums";
import { visiteLabel } from "@/lib/metier";
import { periodeJoursFr } from "@/lib/chantiers";
import { formatPlageDateTimeFr } from "@/lib/format";
import { metaObjet, texte, nombre, dateDe } from "@/lib/meta-json";

// Notifications in-app du conducteur — « le bureau a touché à mon planning ».
// Créées UNIQUEMENT par une action humaine (planifier / replanifier /
// annuler) : jamais de notification déclenchée par le temps qui passe (les
// relances/alertes automatiques sont une feature parquée).
//
// À appeler DANS la transaction de la mutation (passer `tx`), pour que la
// notification et la mutation soient atomiques — même pattern que
// enregistrerEvenement (lib/evenements.ts). L'appartenance org du
// destinataire est garantie par l'appelant : le conducteur a déjà été validé
// (rôle + organisationId) par l'action qui planifie/replanifie/annule.
export async function creerNotification(
  tx: Prisma.TransactionClient,
  notification: {
    destinataireId: string;
    // Acteur de la mutation : on ne se notifie JAMAIS soi-même (un admin qui
    // planifie sa propre visite n'a pas besoin d'en être averti) — la garde
    // vit ici pour qu'aucun appelant ne puisse l'oublier.
    acteurId: string;
    type: TypeNotification;
    dossierId?: string;
    meta?: Prisma.InputJsonValue;
  },
): Promise<void> {
  const { acteurId, ...data } = notification;
  if (acteurId === data.destinataireId) return;
  await tx.notification.create({ data });
}

// Variante multi-destinataires : notifie CHAQUE utilisateur back-office de
// l'organisation (le modèle Notification est mono-destinataire — on crée N
// lignes dans la transaction). Utilisée par les mutations TERRAIN (document
// signé, chantier terminé par l'ouvrier) : le bureau doit le voir sans
// ouvrir le dossier. L'acteur (l'ouvrier) n'est jamais back-office, mais la
// garde anti-auto-notification de creerNotification s'applique quand même.
export async function notifierBackOffice(
  tx: Prisma.TransactionClient,
  notification: {
    organisationId: string;
    acteurId: string;
    type: TypeNotification;
    dossierId?: string;
    meta?: Prisma.InputJsonValue;
  },
): Promise<void> {
  const { organisationId, ...reste } = notification;
  const destinataires = await tx.user.findMany({
    where: { organisationId, role: { in: ["ASSISTANTE", "ADMIN"] } },
    select: { id: true },
  });
  for (const d of destinataires) {
    await creerNotification(tx, { ...reste, destinataireId: d.id });
  }
}

// Pastille de la cloche du shell conducteur (app/app/layout.tsx). Comptage
// direct à chaque requête : un seul count servi par l'index
// (destinataireId, lu, createdAt) — pas de cache à invalider, le compteur est
// toujours juste au chargement. Hors-ligne (page servie par le cache PWA), il
// peut être périmé : best-effort assumé.
export async function compterNotificationsNonLues(
  userId: string,
): Promise<number> {
  return prisma.notification.count({
    where: { destinataireId: userId, lu: false },
  });
}

/* ── Présentation (libellés français des notifications) ─────────────── */

// « Dupont, 12 rue des Lilas » — le libellé reste autonome même si le dossier
// a été supprimé depuis (dossierId SetNull) : client et adresse vivent en meta.
function clientAdresse(m: Record<string, unknown>): string {
  return [texte(m, "nomClient"), texte(m, "adresse")]
    .filter((v): v is string => v !== null)
    .join(", ");
}

// Id de la visite concernée, si la notification en porte un. La visite peut
// avoir été supprimée depuis (annulation) : l'appelant vérifie l'existence
// avant d'en faire un lien.
export function visiteIdNotification(meta: unknown): string | null {
  return texte(metaObjet(meta), "visiteId");
}

// Id du chantier concerné (notifications ouvrier). Même contrat que
// visiteIdNotification : l'appelant vérifie existence ET affectation avant
// d'en faire un lien.
export function chantierIdNotification(meta: unknown): string | null {
  return texte(metaObjet(meta), "chantierId");
}

// Libellé français d'une notification (pur, pas de JSX) — consommé par la
// page /app/notifications. Les détails viennent de meta quand ils sont
// présents, sinon le libellé reste valable sans eux.
export function libelleNotification(
  type: TypeNotification,
  meta: unknown,
): string {
  const m = metaObjet(meta);
  const numero = nombre(m, "numero");
  const ou = clientAdresse(m);

  switch (type) {
    case "VISITE_ASSIGNEE": {
      const quand = dateDe(m, "datePlanifiee");
      const duree = nombre(m, "dureeMinutes") ?? 0;
      return [
        numero != null
          ? `${visiteLabel(numero)} planifiée`
          : "Nouvelle visite planifiée",
        quand ? ` le ${formatPlageDateTimeFr(quand, duree)}` : "",
        ou ? ` — ${ou}` : "",
      ].join("");
    }

    case "VISITE_REPLANIFIEE": {
      const avant = dateDe(m, "ancienneDate");
      const apres = dateDe(m, "nouvelleDate");
      const dureeAvant = nombre(m, "ancienneDuree") ?? 0;
      const dureeApres = nombre(m, "nouvelleDuree") ?? 0;
      return [
        "Visite replanifiée",
        avant && apres
          ? ` : ${formatPlageDateTimeFr(avant, dureeAvant)} → ${formatPlageDateTimeFr(apres, dureeApres)}`
          : apres
            ? ` au ${formatPlageDateTimeFr(apres, dureeApres)}`
            : "",
        ou ? ` — ${ou}` : "",
      ].join("");
    }

    case "VISITE_ANNULEE": {
      const prevue = dateDe(m, "datePrevue");
      const dureePrevue = nombre(m, "dureePrevue") ?? 0;
      // `reassignee` : la visite n'est pas annulée pour le client, elle a été
      // confiée à un autre conducteur — le libellé le dit honnêtement.
      const base =
        m["reassignee"] === true
          ? "Visite réassignée à un autre conducteur"
          : "Visite annulée";
      return [
        base,
        prevue ? ` (était prévue le ${formatPlageDateTimeFr(prevue, dureePrevue)})` : "",
        ou ? ` — ${ou}` : "",
      ].join("");
    }

    case "CHANTIER_AFFECTE": {
      return [
        "Nouveau chantier",
        periodeChantier(m, " "),
        ou ? ` — ${ou}` : "",
      ].join("");
    }

    case "CHANTIER_REPLANIFIE": {
      return [
        "Chantier replanifié",
        periodeChantier(m, " : travaux "),
        ou ? ` — ${ou}` : "",
      ].join("");
    }

    case "CHANTIER_RETIRE":
      return ["Vous n'êtes plus affecté au chantier", ou ? ` ${ou}` : ""].join(
        "",
      );

    case "DOCUMENT_A_SIGNER_RECU": {
      const doc = texte(m, "nomDocument");
      return [
        "Document à faire signer",
        doc ? ` « ${doc} »` : "",
        ou ? ` — ${ou}` : "",
      ].join("");
    }

    case "DOCUMENT_SIGNE_RECU": {
      const doc = texte(m, "nomDocument");
      const signataire = texte(m, "nomSignataire");
      return [
        "Document signé",
        doc ? ` « ${doc} »` : "",
        signataire ? ` par ${signataire}` : "",
        ou ? ` — ${ou}` : "",
      ].join("");
    }

    case "CHANTIER_TERMINE_TERRAIN": {
      const par = texte(m, "parNom");
      return [
        "Chantier marqué terminé sur le terrain",
        par ? ` par ${par}` : "",
        ou ? ` — ${ou}` : "",
      ].join("");
    }
  }
}

// « du 8 juillet au 12 juillet » depuis meta.dateDebut/dateFin — vide si les
// dates manquent (le libellé reste valable sans elles).
function periodeChantier(m: Record<string, unknown>, prefixe: string): string {
  const debut = dateDe(m, "dateDebut");
  const fin = dateDe(m, "dateFin");
  return debut && fin ? `${prefixe}${periodeJoursFr(debut, fin)}` : "";
}
