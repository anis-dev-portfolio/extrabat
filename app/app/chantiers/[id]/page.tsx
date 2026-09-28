import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  FolderOpen,
  HardHat,
  Pencil,
  Phone,
  Printer,
} from "lucide-react";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  dureeEnJours,
  etatChantier,
  type EtatChantier,
} from "@/lib/chantiers";
import { debutJourLocal } from "@/lib/planning";
import { formatEuros } from "@/lib/finances";
import { formatDateFr, formatJourCourtFr, formatJourLongFr } from "@/lib/format";
import { boutonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EtatChantierBadge } from "@/components/ui/statut-badge";
import { cn } from "@/lib/ui";
import { ActionsChantier } from "./actions-chantier";
import { titreChantier } from "./titre";

const MS_JOUR = 86_400_000;

// Teinte de la portion écoulée du rail de planning — alignée sur le code
// couleur des états (jamais le turquoise, réservé marque/actions).
const RAIL_FILL: Record<EtatChantier, string> = {
  A_VENIR: "bg-blue-400",
  EN_COURS: "bg-orange-400",
  A_CLOTURER: "bg-red-400",
  TERMINE: "bg-green-500",
};

// Initiales (≤ 2 lettres) pour la pastille d'un ouvrier.
function initiales(nom: string): string {
  return nom
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase() ?? "")
    .join("");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return titreChantier(id, "Chantier");
}

// Fiche chantier : le planning (rail début → fin), l'équipe, le client et les
// actions du cycle de vie. Le détail des travaux vit sur le devis (remis aux
// ouvriers à part) — referme la boucle avec la fiche dossier.
export default async function FicheChantierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole(BACK_OFFICE_ROLES);

  const chantier = await prisma.chantier.findFirst({
    where: { id, organisationId: user.organisationId },
    include: {
      dossier: {
        select: {
          id: true,
          nomClient: true,
          adresse: true,
          telephone: true,
          infosAcces: true,
          // Règlement (lecture seule) d'un chantier terminé — l'action
          // « marquer payé » vit sur la fiche dossier.
          montantDevis: true,
          payeLe: true,
        },
      },
      affectations: {
        include: {
          ouvrier: { select: { id: true, nom: true, telephone: true, actif: true } },
        },
        orderBy: { ouvrier: { nom: "asc" } },
      },
    },
  });
  if (!chantier) notFound();

  const { dossier } = chantier;
  const maintenant = new Date();
  const etat = etatChantier(chantier, maintenant);
  const nbJours = dureeEnJours(chantier);

  // Progression du chantier, en jours civils Paris (mêmes bornes minuit que
  // dateDebut/dateFin — Math.round absorbe les jours de 23/25 h).
  const ajd = debutJourLocal(maintenant);
  const diffJours = (a: Date, b: Date) =>
    Math.round((a.getTime() - b.getTime()) / MS_JOUR);
  const jourCourant = diffJours(ajd, chantier.dateDebut) + 1; // 1..nbJours si en cours
  const joursAvantDebut = diffJours(chantier.dateDebut, ajd);
  const joursApresFin = diffJours(ajd, chantier.dateFin);

  // Fraction remplie du rail selon l'état (0 à venir, X/N en cours, plein sinon).
  const pct =
    etat === "A_VENIR"
      ? 0
      : etat === "EN_COURS"
        ? Math.min(1, Math.max(0, jourCourant / nbJours))
        : 1;

  // Phrase contextuelle sous le badge d'état — l'info que l'assistante lit
  // en un coup d'œil (« combien de temps encore », « en retard de combien »).
  const phrase =
    etat === "A_VENIR"
      ? joursAvantDebut <= 1
        ? "Commence demain"
        : `Commence dans ${joursAvantDebut} jours`
      : etat === "EN_COURS"
        ? `Jour ${jourCourant} sur ${nbJours}`
        : etat === "A_CLOTURER"
          ? joursApresFin <= 1
            ? "Fin dépassée hier — à clôturer"
            : `Fin dépassée depuis ${joursApresFin} jours — à clôturer`
          : `Clos après ${nbJours} jour${nbJours > 1 ? "s" : ""} de travaux`;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Link
          href="/app/chantiers"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Chantiers
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-bold tracking-tight">
            Chantier — {dossier.nomClient}
          </h1>
          <EtatChantierBadge etat={etat} />
        </div>
        <p className="text-sm text-neutral-500">{dossier.adresse}</p>
      </div>

      {/* ── Planning : le rail début → fin, signature de la fiche ──────── */}
      <Card>
        <CardHeader
          titre="Planning"
          action={
            <Badge ton="neutre">
              {nbJours} jour{nbJours > 1 ? "s" : ""}
            </Badge>
          }
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <EtatChantierBadge etat={etat} />
            <span
              className={cn(
                "text-sm font-medium tabular-nums",
                etat === "A_CLOTURER" ? "text-red-700" : "text-neutral-600",
              )}
            >
              {phrase}
            </span>
          </div>

          <div>
            <div className="flex items-baseline justify-between text-[0.6875rem] font-medium uppercase tracking-wide text-neutral-400">
              <span>Début</span>
              <span>Fin</span>
            </div>
            <div className="flex items-baseline justify-between text-sm font-semibold text-neutral-900 tabular-nums">
              <span>{formatJourCourtFr(chantier.dateDebut)}</span>
              <span>{formatJourCourtFr(chantier.dateFin)}</span>
            </div>
            <div className="relative mt-2.5 h-2 rounded-full bg-neutral-200">
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full",
                  RAIL_FILL[etat],
                )}
                style={{ width: `${pct * 100}%` }}
              />
              {etat === "EN_COURS" && (
                <span
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-500 shadow-sm"
                  style={{ left: `${pct * 100}%` }}
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              titre="Ouvriers"
              action={
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600 tabular-nums">
                  {chantier.affectations.length}
                </span>
              }
            />
            <CardBody>
              {chantier.affectations.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center">
                  <HardHat className="size-6 text-neutral-300" aria-hidden="true" />
                  <p className="text-sm font-medium text-neutral-700">
                    Aucun ouvrier affecté
                  </p>
                  {!chantier.termineLe && (
                    <Link
                      href={`/app/chantiers/${chantier.id}/modifier`}
                      className={boutonClasses("secondaire", "sm")}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      Affecter des ouvriers
                    </Link>
                  )}
                </div>
              ) : (
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {chantier.affectations.map(({ ouvrier }) => (
                    <li
                      key={ouvrier.id}
                      className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3"
                    >
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700"
                        aria-hidden="true"
                      >
                        {initiales(ouvrier.nom)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-neutral-900">
                          <span className="truncate">{ouvrier.nom}</span>
                          {!ouvrier.actif && <Badge ton="neutre">Inactif</Badge>}
                        </p>
                        {ouvrier.telephone ? (
                          <a
                            href={`tel:${ouvrier.telephone}`}
                            className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-neutral-500 tabular-nums transition-colors hover:text-primary-800"
                          >
                            <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                            {ouvrier.telephone}
                          </a>
                        ) : (
                          <p className="mt-0.5 text-sm text-neutral-400">
                            Pas de téléphone
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader titre="Client & accès" />
            <CardBody className="space-y-2 text-sm">
              <p className="font-medium text-neutral-900">{dossier.nomClient}</p>
              <p className="text-neutral-600">{dossier.adresse}</p>
              <a
                href={`tel:${dossier.telephone}`}
                className="inline-flex items-center gap-1.5 text-neutral-600 tabular-nums transition-colors hover:text-primary-800"
              >
                <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                {dossier.telephone}
              </a>
              {dossier.infosAcces && (
                <p className="text-neutral-600">
                  <span className="text-xs font-medium text-neutral-500 uppercase">
                    Accès :
                  </span>{" "}
                  {dossier.infosAcces}
                </p>
              )}
              {/* Règlement (lecture seule) : le jalon financier vit sur la
                  fiche dossier — ici on ne fait que le refléter. */}
              {chantier.termineLe && (
                <p className="flex flex-wrap items-center gap-1.5 border-t border-neutral-100 pt-2">
                  <span className="text-xs font-medium text-neutral-500 uppercase">
                    Règlement :
                  </span>
                  {dossier.montantDevis == null ? (
                    <Badge ton="neutre">Devis non saisi</Badge>
                  ) : (
                    <>
                      <Badge ton={dossier.payeLe ? "vert" : "ambre"}>
                        {dossier.payeLe
                          ? `Payé le ${formatDateFr(dossier.payeLe)}`
                          : "À encaisser"}
                      </Badge>
                      <span className="text-sm text-neutral-600 tabular-nums">
                        {formatEuros(dossier.montantDevis)} HT
                      </span>
                    </>
                  )}
                </p>
              )}
              <p className="pt-1">
                <Link
                  href={`/app/dossiers/${dossier.id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-800 hover:underline"
                >
                  <FolderOpen className="size-3.5" aria-hidden="true" />
                  Fiche dossier
                </Link>
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader titre="Actions" />
            <CardBody className="space-y-2">
              <Link
                href={`/app/chantiers/${chantier.id}/fiches`}
                className={cn(boutonClasses("secondaire"), "w-full")}
              >
                <Printer className="size-4" aria-hidden="true" />
                Fiches ouvrier
              </Link>
              {!chantier.termineLe && (
                <Link
                  href={`/app/chantiers/${chantier.id}/modifier`}
                  className={cn(boutonClasses("secondaire"), "w-full")}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  Modifier
                </Link>
              )}
              <ActionsChantier
                chantierId={chantier.id}
                termine={chantier.termineLe !== null}
                nomClient={dossier.nomClient}
              />
              <p className="text-xs text-neutral-500">
                {chantier.termineLe ? (
                  <>
                    Chantier terminé le{" "}
                    {formatJourLongFr(chantier.termineLe)} — le dossier est
                    classé « Terminé ».
                  </>
                ) : (
                  <>
                    « Marquer terminé » clôt aussi le dossier ; « Supprimer »
                    renvoie le dossier dans la file « Prêt pour travaux ».
                  </>
                )}
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
