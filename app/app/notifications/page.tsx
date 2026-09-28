import type { Metadata } from "next";
import { requireUser, isBackOffice } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  chantierIdNotification,
  compterNotificationsNonLues,
  libelleNotification,
  visiteIdNotification,
} from "@/lib/notifications";
import { formatDateTimeFr } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { CarteNotification } from "./carte-notification";
import { BoutonToutMarquerLu } from "./marquer-lu";

const NOTIFICATIONS_MAX = 50;

export const metadata: Metadata = { title: "Notifications" };

// Notifications par destinataire, tous rôles : le conducteur voit ce que le
// bureau a changé dans SON planning, l'ouvrier ce qui bouge sur SES chantiers
// (affectation, document à signer), le back-office ce qui remonte du terrain
// (document signé, chantier terminé) — jamais rien de déclenché par le temps
// qui passe. Non-lues d'abord, puis de la plus récente à la plus ancienne.
// Le marquage lu est EXPLICITE (bouton par item + tout marquer).
export default async function NotificationsPage() {
  const user = await requireUser();

  const [notifications, nonLues, total] = await Promise.all([
    prisma.notification.findMany({
      where: { destinataireId: user.id },
      orderBy: [{ lu: "asc" }, { createdAt: "desc" }],
      take: NOTIFICATIONS_MAX,
    }),
    compterNotificationsNonLues(user.id),
    prisma.notification.count({ where: { destinataireId: user.id } }),
  ]);

  // Lien de navigation de chaque notification, calculé une fois par page —
  // et UNIQUEMENT si la cible existe encore et appartient toujours à ce
  // destinataire (visite réassignée, chantier retiré, dossier supprimé…).
  const hrefParNotif = await calculerLiens(user, notifications);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-neutral-500">
            {total === 0
              ? "Aucune notification"
              : nonLues === 0
                ? "Tout est lu"
                : `${nonLues} non lue${nonLues > 1 ? "s" : ""}`}
          </p>
        </div>
        {nonLues > 0 && <BoutonToutMarquerLu />}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          titre="Aucune notification"
          description="Vous serez averti ici dès qu'un événement vous concerne : planning modifié, document à signer, retour du terrain."
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            // Libellé et date formatés ICI (serveur) : la carte cliente ne
            // dépend ni de lib/notifications (qui importe prisma) ni du
            // fuseau du navigateur.
            <CarteNotification
              key={n.id}
              id={n.id}
              type={n.type}
              lu={n.lu}
              libelle={libelleNotification(n.type, n.meta)}
              dateLabel={formatDateTimeFr(n.createdAt)}
              href={hrefParNotif.get(n.id) ?? null}
            />
          ))}
          {total > notifications.length && (
            <p className="pt-2 text-center text-xs text-neutral-500">
              {notifications.length} notifications affichées sur {total} (non
              lues en premier).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

type NotificationChargee = {
  id: string;
  meta: unknown;
  dossierId: string | null;
};

type UtilisateurLiens = {
  id: string;
  role: import("@/lib/generated/prisma/enums").Role;
  organisationId: string;
};

// Liens par rôle : conducteur → fiche visite (si la visite existe encore ET
// est toujours la sienne), ouvrier → fiche chantier (si toujours affecté),
// back-office → fiche dossier (dossierId, SetNull si supprimé). Une seule
// requête de validation par page.
async function calculerLiens(
  user: UtilisateurLiens,
  notifications: readonly NotificationChargee[],
): Promise<Map<string, string>> {
  const liens = new Map<string, string>();

  if (isBackOffice(user.role)) {
    for (const n of notifications) {
      if (n.dossierId) liens.set(n.id, `/app/dossiers/${n.dossierId}`);
    }
    return liens;
  }

  if (user.role === "CONDUCTEUR") {
    const visiteIdParNotif = new Map(
      notifications.map((n) => [n.id, visiteIdNotification(n.meta)]),
    );
    const visiteIds = [
      ...new Set(
        [...visiteIdParNotif.values()].filter((id): id is string => id !== null),
      ),
    ];
    const valides =
      visiteIds.length > 0
        ? await prisma.visite.findMany({
            where: {
              id: { in: visiteIds },
              conducteurId: user.id,
              dossier: { organisationId: user.organisationId },
            },
            select: { id: true },
          })
        : [];
    const idsValides = new Set(valides.map((v) => v.id));
    for (const [notifId, visiteId] of visiteIdParNotif) {
      if (visiteId && idsValides.has(visiteId)) {
        liens.set(notifId, `/app/visites/${visiteId}`);
      }
    }
    return liens;
  }

  if (user.role === "OUVRIER") {
    const chantierIdParNotif = new Map(
      notifications.map((n) => [n.id, chantierIdNotification(n.meta)]),
    );
    const chantierIds = [
      ...new Set(
        [...chantierIdParNotif.values()].filter(
          (id): id is string => id !== null,
        ),
      ),
    ];
    const valides =
      chantierIds.length > 0
        ? await prisma.chantier.findMany({
            where: {
              id: { in: chantierIds },
              organisationId: user.organisationId,
              affectations: {
                some: { ouvrier: { userId: user.id, actif: true } },
              },
            },
            select: { id: true },
          })
        : [];
    const idsValides = new Set(valides.map((c) => c.id));
    for (const [notifId, chantierId] of chantierIdParNotif) {
      if (chantierId && idsValides.has(chantierId)) {
        liens.set(notifId, `/app/mes-chantiers/${chantierId}`);
      }
    }
  }

  return liens;
}
