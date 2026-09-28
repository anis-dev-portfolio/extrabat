import type { Metadata } from "next";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { JOURS_SEMAINE, minutesVersLabel } from "@/lib/planning";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BoutonSupprimer } from "@/components/ui/bouton-supprimer";
import { FormAbsence } from "@/components/absences/form-absence";
import { ListeAbsences } from "@/components/absences/liste-absences";
import { EnteteParametres } from "../entete";
import { SelecteurConducteur } from "./selecteur";
import { FormHoraire } from "./form-horaire";
import { ajouterAbsence, retirerAbsence, retirerHoraire } from "./actions";

export const metadata: Metadata = { title: "Disponibilités" };

// Disponibilités par conducteur : horaires travaillés récurrents (par jour de
// semaine) + absences en jours entiers. Le planning (Vague 3) grise tout ce
// qui est hors de ces plages.
export default async function DisponibilitesPage({
  searchParams,
}: {
  searchParams: Promise<{ conducteur?: string }>;
}) {
  const user = await requireRole(BACK_OFFICE_ROLES);
  const { conducteur: conducteurParam } = await searchParams;

  const conducteurs = await prisma.user.findMany({
    where: { organisationId: user.organisationId, role: "CONDUCTEUR" },
    orderBy: { nom: "asc" },
    select: { id: true, nom: true },
  });

  const selectionne =
    conducteurs.find((c) => c.id === conducteurParam) ?? conducteurs[0] ?? null;

  const [horaires, absences] = selectionne
    ? await Promise.all([
        prisma.horaireRecurrent.findMany({
          where: {
            conducteurId: selectionne.id,
            conducteur: { organisationId: user.organisationId },
          },
          orderBy: [{ jourSemaine: "asc" }, { heureDebut: "asc" }],
        }),
        prisma.absence.findMany({
          where: {
            conducteurId: selectionne.id,
            conducteur: { organisationId: user.organisationId },
          },
          orderBy: { dateDebut: "desc" },
        }),
      ])
    : [[], []];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <EnteteParametres
        titre="Disponibilités & absences"
        description="Le planning grisera tout ce qui sort de ces plages ; une visite reste planifiable en dehors, avec avertissement."
      />

      {conducteurs.length === 0 ? (
        <EmptyState
          titre="Aucun conducteur"
          description="Ajoutez d'abord un conducteur dans Paramètres → Utilisateurs (email autorisé avec le rôle Conducteur)."
        />
      ) : (
        <>
          <SelecteurConducteur
            conducteurs={conducteurs}
            valeur={selectionne!.id}
          />

          <div className="grid items-start gap-5 lg:grid-cols-2">
            {/* ── Horaires récurrents ─────────────────────────────── */}
            <Card>
              <CardHeader titre="Horaires récurrents" />
              <CardBody className="space-y-4">
                {horaires.length === 0 && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Horaires non définis : le planning utilisera les heures
                    d&apos;ouverture de l&apos;organisation, 7 jours sur 7.
                  </p>
                )}

                <ul className="divide-y divide-neutral-100">
                  {JOURS_SEMAINE.map(({ jour, label }) => {
                    const plages = horaires.filter(
                      (h) => h.jourSemaine === jour,
                    );
                    return (
                      <li
                        key={jour}
                        className="flex items-start justify-between gap-3 py-2"
                      >
                        <span
                          className={
                            plages.length > 0
                              ? "w-24 shrink-0 pt-0.5 text-sm font-medium text-neutral-900"
                              : "w-24 shrink-0 pt-0.5 text-sm text-neutral-400"
                          }
                        >
                          {label}
                        </span>
                        {plages.length === 0 ? (
                          <span className="flex-1 pt-0.5 text-sm text-neutral-400">
                            —
                          </span>
                        ) : (
                          <ul className="flex flex-1 flex-wrap gap-1.5">
                            {plages.map((p) => (
                              <li key={p.id}>
                                <span className="inline-flex items-center gap-0.5 rounded-full border border-primary-200 bg-primary-50 py-0.5 pl-2.5 text-sm font-medium text-primary-900 tabular-nums">
                                  {minutesVersLabel(p.heureDebut)} –{" "}
                                  {minutesVersLabel(p.heureFin)}
                                  <BoutonSupprimer
                                    action={retirerHoraire}
                                    id={p.id}
                                    titre="Retirer cette plage horaire ?"
                                    succes="Plage horaire retirée."
                                    ariaLabel={`Retirer la plage ${label} ${minutesVersLabel(p.heureDebut)} – ${minutesVersLabel(p.heureFin)}`}
                                    description={`${label}, ${minutesVersLabel(p.heureDebut)} – ${minutesVersLabel(p.heureFin)} : cette plage ne sera plus comptée comme disponible pour ce conducteur.`}
                                    className="relative flex size-6 items-center justify-center rounded-full text-primary-700 transition-colors before:absolute before:-inset-2.5 hover:text-red-700 sm:before:hidden"
                                    iconeClassName="size-3.5"
                                  />
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <FormHoraire conducteurId={selectionne!.id} />
              </CardBody>
            </Card>

            {/* ── Absences ────────────────────────────────────────── */}
            <Card>
              <CardHeader titre="Absences" />
              <CardBody className="space-y-4">
                <FormAbsence
                  action={ajouterAbsence}
                  champId="conducteurId"
                  valeurId={selectionne!.id}
                  motifPlaceholder="Congés, formation…"
                />

                <ListeAbsences
                  absences={absences}
                  actionRetirer={retirerAbsence}
                  consequenceRetrait="le conducteur redeviendra disponible à la planification sur cette période."
                />
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
