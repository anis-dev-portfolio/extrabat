import { requireUser, isBackOffice } from "@/lib/auth";
import { compterATraiter } from "@/lib/a-traiter";
import { compterNotificationsNonLues } from "@/lib/notifications";
import { ShellBackOffice } from "@/components/shell/shell-back-office";
import { ShellConducteur } from "@/components/shell/shell-conducteur";
import { ShellOuvrier } from "@/components/shell/shell-ouvrier";
import { BandeauAbonnement } from "@/components/shell/bandeau-abonnement";
import { Toaster } from "@/components/ui/toaster";
import { RejeuEnvois } from "./rejeu";
import { MiseAJourPwa } from "./pwa-update";
import { ToastSucces } from "./toast-succes";

// Whole /app subtree is auth-gated and per-user — never statically prerendered.
export const dynamic = "force-dynamic";

// Badge « À traiter » du shell : comptage caché par org dans lib/a-traiter.ts
// (invalidé par revalidateTag depuis app/app/dossiers/actions.ts et
// lib/envoi-compte-rendu.ts, appelée par les route handlers /api/visites/[id]/*).
// La page /app/a-traiter liste le détail des deux populations comptées ici.

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Guard the entire /app subtree; individual pages add their own role checks.
  const user = await requireUser();
  const backOffice = isBackOffice(user.role);
  const aTraiter = backOffice
    ? await compterATraiter(
        user.organisationId,
        user.organisation.delaiSechageJours,
      )
    : 0;
  // Pastille de la cloche (conducteur, ouvrier ET back-office — le terrain
  // notifie désormais le bureau : document signé, chantier terminé) :
  // comptage direct (index dédié), recalculé à chaque requête.
  const notificationsNonLues = await compterNotificationsNonLues(user.id);

  // Bandeau abonnement (impayé / lecture seule) au-dessus de chaque page.
  // user.organisation est déjà chargée par getCurrentUser() : statut lu en
  // mémoire, aucune requête. La coupure réelle vit dans requireRoleActif.
  const contenu = (
    <>
      <BandeauAbonnement organisation={user.organisation} role={user.role} />
      {children}
    </>
  );

  return (
    <>
      {backOffice ? (
        <ShellBackOffice
          nom={user.nom}
          role={user.role}
          organisation={user.organisation.nom}
          aTraiter={aTraiter}
          notificationsNonLues={notificationsNonLues}
        >
          {contenu}
        </ShellBackOffice>
      ) : user.role === "OUVRIER" ? (
        <ShellOuvrier nom={user.nom} notificationsNonLues={notificationsNonLues}>
          {contenu}
        </ShellOuvrier>
      ) : (
        <ShellConducteur nom={user.nom} notificationsNonLues={notificationsNonLues}>
          {contenu}
        </ShellConducteur>
      )}
      <Toaster />
      <ToastSucces />
      <RejeuEnvois />
      <MiseAJourPwa />
    </>
  );
}
