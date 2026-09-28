import type { Metadata } from "next";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { BoutonSupprimer } from "@/components/ui/bouton-supprimer";
import { FormAbsence } from "@/components/absences/form-absence";
import { ListeAbsences } from "@/components/absences/liste-absences";
import { EnteteParametres } from "../entete";
import { FormOuvrier } from "./form-ouvrier";
import { BoutonNouveauMotDePasse, FormAccesOuvrier } from "./acces-app";
import { SelecteurOuvrier } from "./selecteur";
import { BasculeActif } from "./bascule-actif";
import {
  ajouterAbsenceOuvrier,
  retirerAbsenceOuvrier,
  retirerAccesOuvrier,
  supprimerOuvrier,
} from "./actions";

export const metadata: Metadata = { title: "Ouvriers" };

// Équipe d'ouvriers terrain. Absences en jours entiers : le planning
// chantiers avertit si on affecte un ouvrier absent. L'accès à l'application
// (espace mobile « Mes chantiers » + signature des PV) est un OPT-IN par
// fiche, donné ICI (jamais depuis la page Utilisateurs — la liaison
// compte ↔ fiche est garantie par construction).
export default async function OuvriersPage({
  searchParams,
}: {
  searchParams: Promise<{ ouvrier?: string }>;
}) {
  const user = await requireRole(BACK_OFFICE_ROLES);
  const { ouvrier: ouvrierParam } = await searchParams;

  const ouvriers = await prisma.ouvrier.findMany({
    where: { organisationId: user.organisationId },
    orderBy: [{ actif: "desc" }, { nom: "asc" }],
    select: {
      id: true,
      nom: true,
      telephone: true,
      actif: true,
      userId: true,
      membreAutorise: { select: { email: true } },
      user: { select: { email: true } },
    },
  });

  const selectionne =
    ouvriers.find((o) => o.id === ouvrierParam) ?? ouvriers[0] ?? null;

  const absences = selectionne
    ? await prisma.absenceOuvrier.findMany({
        where: {
          ouvrierId: selectionne.id,
          ouvrier: { organisationId: user.organisationId },
        },
        orderBy: { dateDebut: "desc" },
      })
    : [];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <EnteteParametres
        titre="Ouvriers"
        description="L'équipe terrain des chantiers. Pas de compte : les ouvriers reçoivent une fiche imprimée depuis le planning chantiers."
      />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* ── Équipe ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader titre="Équipe" />
          <CardBody className="space-y-4">
            {ouvriers.length === 0 ? (
              <p className="py-2 text-sm text-neutral-500">
                Aucun ouvrier pour l&apos;instant — ajoutez le premier
                ci-dessous.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {ouvriers.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className={o.actif ? "" : "text-neutral-400"}>
                      <p className="text-sm font-medium">
                        {o.nom}
                        {!o.actif && (
                          <Badge ton="neutre" className="ml-2">
                            Inactif
                          </Badge>
                        )}
                        {o.actif && o.userId && (
                          <Badge ton="vert" className="ml-2">
                            Accès app
                          </Badge>
                        )}
                        {o.actif && !o.userId && o.membreAutorise && (
                          <Badge ton="ambre" className="ml-2">
                            Invitation envoyée
                          </Badge>
                        )}
                      </p>
                      <p
                        className={
                          o.actif
                            ? "text-sm text-neutral-500 tabular-nums"
                            : "text-sm tabular-nums"
                        }
                      >
                        {o.telephone ?? "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <BasculeActif id={o.id} actif={o.actif} nom={o.nom} />
                      <BoutonSupprimer
                        action={supprimerOuvrier}
                        id={o.id}
                        titre="Supprimer cet ouvrier ?"
                        succes="Ouvrier supprimé."
                        ariaLabel={`Supprimer ${o.nom}`}
                        description={`${o.nom} sera définitivement supprimé (possible uniquement s'il n'a jamais été affecté à un chantier — sinon, désactivez-le).`}
                        className="flex size-11 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-700 sm:size-8"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <FormOuvrier />
          </CardBody>
        </Card>

        {/* ── Accès app + absences de l'ouvrier sélectionné ─────────── */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader titre="Accès à l'application" />
            <CardBody className="space-y-4">
              {!selectionne ? (
                <EmptyState
                  titre="Aucun ouvrier"
                  description="Ajoutez d'abord un ouvrier pour lui donner un accès."
                />
              ) : (
                <>
                  <SelecteurOuvrier
                    ouvriers={ouvriers}
                    valeur={selectionne.id}
                  />
                  <AccesApp ouvrier={selectionne} />
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader titre="Absences" />
            <CardBody className="space-y-4">
              {!selectionne ? (
                <EmptyState
                  titre="Aucun ouvrier"
                  description="Ajoutez d'abord un ouvrier pour gérer ses absences."
                />
              ) : (
                <>
                  <FormAbsence
                    action={ajouterAbsenceOuvrier}
                    champId="ouvrierId"
                    valeurId={selectionne.id}
                    motifPlaceholder="Congés, arrêt maladie…"
                  />

                  <ListeAbsences
                    absences={absences}
                    actionRetirer={retirerAbsenceOuvrier}
                    consequenceRetrait="l'ouvrier redeviendra disponible à l'affectation sur cette période."
                  />
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

// État de l'accès app de la fiche sélectionnée — trois situations, toujours
// honnêtes : compte actif (1re connexion faite), invitation en attente
// (retirable), pas d'accès (formulaire). La COUPURE d'un compte actif passe
// par la désactivation de la fiche (les guards exigent actif).
function AccesApp({
  ouvrier,
}: {
  ouvrier: {
    id: string;
    nom: string;
    actif: boolean;
    userId: string | null;
    membreAutorise: { email: string } | null;
    user: { email: string } | null;
  };
}) {
  if (ouvrier.userId) {
    return (
      <div className="space-y-2">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge ton="vert">Compte actif</Badge>
          <span className="font-medium text-neutral-800">
            {ouvrier.user?.email ?? ouvrier.membreAutorise?.email ?? ""}
          </span>
        </p>
        <p className="text-xs text-neutral-500">
          {ouvrier.nom} voit ses chantiers, son planning et signe les PV de fin
          de travaux depuis son téléphone. Pour couper l&apos;accès (départ de
          l&apos;entreprise), désactivez la fiche : la coupure est immédiate.
        </p>
        <BoutonNouveauMotDePasse ouvrierId={ouvrier.id} nom={ouvrier.nom} />
      </div>
    );
  }

  if (ouvrier.membreAutorise) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Badge ton="ambre">Prêt à se connecter</Badge>
            <span className="font-medium text-neutral-800">
              {ouvrier.membreAutorise.email}
            </span>
          </p>
          <BoutonSupprimer
            action={retirerAccesOuvrier}
            id={ouvrier.id}
            titre="Retirer cet accès ?"
            succes="Accès retiré."
            ariaLabel={`Retirer l'accès de ${ouvrier.nom}`}
            description={`${ouvrier.membreAutorise.email} ne pourra plus se connecter. Vous pourrez redonner un accès à tout moment.`}
            className="flex size-11 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-700 sm:size-8"
          />
        </div>
        <p className="text-xs text-neutral-500">
          Le compte existe déjà : {ouvrier.nom} peut se connecter maintenant
          avec cet email et le mot de passe affiché à la création de
          l&apos;accès (perdu ? créez-en un nouveau). Le badge passera à
          « Compte actif » après sa première connexion.
        </p>
        <BoutonNouveauMotDePasse ouvrierId={ouvrier.id} nom={ouvrier.nom} />
      </div>
    );
  }

  if (!ouvrier.actif) {
    return (
      <p className="text-sm text-neutral-500">
        Fiche désactivée — réactivez l&apos;ouvrier avant de lui donner un
        accès.
      </p>
    );
  }

  return <FormAccesOuvrier ouvrierId={ouvrier.id} />;
}
