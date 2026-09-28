import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarPlus,
  CircleSlash,
  ClipboardCheck,
  Droplets,
  HardHat,
} from "lucide-react";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import {
  chargerATraiter,
  type ChantierAClouturer,
  type DossierAClasser,
  type DossierAReplanifier,
  type DossierEmpeche,
} from "@/lib/a-traiter";
import {
  DOSSIER_STATUT_LABELS,
  suggestStatutApresVisite,
  visiteLabel,
} from "@/lib/metier";
import { periodeJoursFr } from "@/lib/chantiers";
import { formatDateFr, formatDateTimeFr } from "@/lib/format";
import { boutonClasses } from "@/components/ui/button";
import { CarteRepliable } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { BadgeAlerte, DOSSIER_STATUT_UI } from "@/components/ui/statut-badge";
import { Taux } from "@/components/ui/taux";
import { cn } from "@/lib/ui";

export const metadata: Metadata = { title: "À traiter" };

// File « À traiter » : le détail des trois populations comptées par le badge
// du shell (lib/a-traiter.ts). Page en LECTURE — les actions (classement,
// planification) vivent sur la fiche dossier et le sélecteur de créneaux.
export default async function ATraiterPage() {
  const user = await requireRole(BACK_OFFICE_ROLES);
  const { aClasser, aReplanifier, empeches, aClouturer, maintenant } =
    await chargerATraiter(
      user.organisationId,
      user.organisation.delaiSechageJours,
    );
  const total =
    aClasser.length +
    aReplanifier.length +
    empeches.length +
    aClouturer.length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">À traiter</h1>
        <p className="text-sm text-neutral-500">
          Tout ce qui attend une action du back-office : comptes-rendus de
          visite à classer, contre-visites dont le délai de séchage est écoulé
          sans planification, visites empêchées à re-planifier et chantiers dont
          la date de fin est passée sans clôture.
        </p>
      </div>

      {total === 0 ? (
        <EmptyState
          titre="Tout est traité"
          description="Aucun compte-rendu à classer, aucune contre-visite à re-planifier, aucun empêchement signalé, aucun chantier à clôturer. La file se remplit dès qu'une visite est réalisée, qu'un délai de séchage arrive à échéance, qu'un conducteur signale un empêchement ou qu'un chantier dépasse sa date de fin."
        />
      ) : (
        <div className="space-y-5">
          <CarteRepliable
            cleMemoire="a-traiter:a-classer"
            defautOuvert={aClasser.length > 0}
            titre={
              <span className="flex items-center gap-2">
                <ClipboardCheck
                  className="size-4 shrink-0 text-violet-600"
                  aria-hidden="true"
                />
                Comptes-rendus à classer
              </span>
            }
            action={<PastilleCompte compte={aClasser.length} accent="violet" />}
          >
            {aClasser.length === 0 ? (
              <VideSection>
                Aucun compte-rendu en attente de classement.
              </VideSection>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {aClasser.map((dossier) => (
                  <LigneAClasser
                    key={dossier.id}
                    dossier={dossier}
                    seuil={user.organisation.seuilHumidite}
                  />
                ))}
              </ul>
            )}
          </CarteRepliable>

          <CarteRepliable
            cleMemoire="a-traiter:a-replanifier"
            defautOuvert={aReplanifier.length > 0}
            titre={
              <span className="flex items-center gap-2">
                <Droplets
                  className="size-4 shrink-0 text-amber-600"
                  aria-hidden="true"
                />
                Contre-visites à re-planifier
              </span>
            }
            action={<PastilleCompte compte={aReplanifier.length} accent="rouge" />}
          >
            {aReplanifier.length === 0 ? (
              <VideSection>
                Aucune contre-visite en retard de planification.
              </VideSection>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {aReplanifier.map((dossier) => (
                  <LigneAReplanifier
                    key={dossier.id}
                    dossier={dossier}
                    maintenant={maintenant}
                  />
                ))}
              </ul>
            )}
          </CarteRepliable>

          <CarteRepliable
            cleMemoire="a-traiter:empeches"
            defautOuvert={empeches.length > 0}
            titre={
              <span className="flex items-center gap-2">
                <CircleSlash
                  className="size-4 shrink-0 text-red-600"
                  aria-hidden="true"
                />
                Visites empêchées — à re-planifier
              </span>
            }
            action={<PastilleCompte compte={empeches.length} accent="rouge" />}
          >
            {empeches.length === 0 ? (
              <VideSection>
                Aucun empêchement signalé par les conducteurs.
              </VideSection>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {empeches.map((dossier) => (
                  <LigneEmpechee key={dossier.id} dossier={dossier} />
                ))}
              </ul>
            )}
          </CarteRepliable>

          <CarteRepliable
            cleMemoire="a-traiter:a-clouturer"
            defautOuvert={aClouturer.length > 0}
            titre={
              <span className="flex items-center gap-2">
                <HardHat
                  className="size-4 shrink-0 text-amber-600"
                  aria-hidden="true"
                />
                Chantiers à clôturer
              </span>
            }
            action={<PastilleCompte compte={aClouturer.length} accent="rouge" />}
          >
            {aClouturer.length === 0 ? (
              <VideSection>
                Aucun chantier dont la date de fin est dépassée.
              </VideSection>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {aClouturer.map((chantier) => (
                  <LigneAClouturer
                    key={chantier.id}
                    chantier={chantier}
                    maintenant={maintenant}
                  />
                ))}
              </ul>
            )}
          </CarteRepliable>
        </div>
      )}
    </div>
  );
}

/* ── Comptes-rendus à classer ───────────────────────────────────────── */

// Le lien principal mène à la fiche dossier : c'est là que vit l'action de
// classement (confirmation de la suggestion dérivée du taux).
function LigneAClasser({
  dossier,
  seuil,
}: {
  dossier: DossierAClasser;
  seuil: number;
}) {
  const derniere = dossier.visites[0] ?? null;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2">
          <Link
            href={`/app/dossiers/${dossier.id}`}
            className="text-sm font-semibold text-primary-800 hover:underline"
          >
            {dossier.nomClient}
          </Link>
          {derniere && (
            <SuggestionClassement taux={derniere.tauxHumidite} seuil={seuil} />
          )}
        </p>
        <p className="truncate text-xs text-neutral-500">{dossier.adresse}</p>
        {derniere ? (
          <p className="text-xs text-neutral-600 tabular-nums">
            {visiteLabel(derniere.numero)}
            {derniere.dateRealisee &&
              ` · réalisée le ${formatDateTimeFr(derniere.dateRealisee)}`}
            {` · ${derniere.conducteur.nom}`}
            {derniere.tauxHumidite != null && (
              <>
                {" · taux "}
                <Taux taux={derniere.tauxHumidite} seuil={seuil} />
              </>
            )}
          </p>
        ) : (
          <p className="text-xs text-neutral-500">
            Aucune visite réalisée trouvée sur ce dossier.
          </p>
        )}
      </div>
      <Link
        href={`/app/dossiers/${dossier.id}`}
        className={boutonClasses("primaire", "sm")}
      >
        Classer le compte-rendu
      </Link>
    </li>
  );
}

// Suggestion DÉRIVÉE du taux (même règle que le classement de la fiche) —
// l'assistante confirme sur la fiche, rien n'est décidé ici.
function SuggestionClassement({
  taux,
  seuil,
}: {
  taux: number | null;
  seuil: number;
}) {
  const statut = suggestStatutApresVisite(taux, seuil);
  const { badge, Icone } = DOSSIER_STATUT_UI[statut];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        badge,
      )}
    >
      <Icone className="size-3.5 shrink-0" aria-hidden="true" />
      Suggestion : {DOSSIER_STATUT_LABELS[statut].toLowerCase()}
    </span>
  );
}

/* ── Contre-visites à re-planifier ──────────────────────────────────── */

function LigneAReplanifier({
  dossier,
  maintenant,
}: {
  dossier: DossierAReplanifier;
  maintenant: Date;
}) {
  const retardJours = Math.floor(
    (maintenant.getTime() - dossier.echeanceConseillee.getTime()) / 86_400_000,
  );
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2">
          <Link
            href={`/app/dossiers/${dossier.id}`}
            className="text-sm font-semibold text-primary-800 hover:underline"
          >
            {dossier.nomClient}
          </Link>
          <BadgeAlerte>
            {retardJours >= 1
              ? `En retard de ${retardJours} j`
              : "Échéance dépassée"}
          </BadgeAlerte>
        </p>
        <p className="truncate text-xs text-neutral-500">{dossier.adresse}</p>
        <p className="text-xs text-neutral-600">
          Classé en attente humidité le {formatDateFr(dossier.classeHumiditeLe)}{" "}
          — contre-visite conseillée dès le{" "}
          {formatDateFr(dossier.echeanceConseillee)}.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/app/dossiers/${dossier.id}/planifier?retour=dossier`}
          className={boutonClasses("primaire", "sm")}
        >
          <CalendarPlus className="size-4" aria-hidden="true" />
          Planifier la contre-visite
        </Link>
        <Link
          href={`/app/dossiers/${dossier.id}`}
          className={boutonClasses("fantome", "sm")}
        >
          Voir la fiche
        </Link>
      </div>
    </li>
  );
}

/* ── Visites empêchées — à re-planifier ─────────────────────────────── */

// Le conducteur n'a pas pu effectuer la visite (client absent, accès
// impossible…) : elle a été retirée du planning, le bureau re-planifie.
// L'empêchement est levé (empechementLe nullé) par la planification suivante.
function LigneEmpechee({ dossier }: { dossier: DossierEmpeche }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2">
          <Link
            href={`/app/dossiers/${dossier.id}`}
            className="text-sm font-semibold text-primary-800 hover:underline"
          >
            {dossier.nomClient}
          </Link>
          <BadgeAlerte>Visite empêchée</BadgeAlerte>
        </p>
        <p className="truncate text-xs text-neutral-500">{dossier.adresse}</p>
        <p className="text-xs text-neutral-600">
          Empêchement signalé le {formatDateFr(dossier.empechementLe)}
          {dossier.empechementMotif && ` : ${dossier.empechementMotif}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/app/dossiers/${dossier.id}/planifier?retour=dossier`}
          className={boutonClasses("primaire", "sm")}
        >
          <CalendarPlus className="size-4" aria-hidden="true" />
          Replanifier la visite
        </Link>
        <Link
          href={`/app/dossiers/${dossier.id}`}
          className={boutonClasses("fantome", "sm")}
        >
          Voir la fiche
        </Link>
      </div>
    </li>
  );
}

/* ── Chantiers à clôturer ───────────────────────────────────────────── */

// Chantier dont la date de fin est passée sans marquage « terminé » : le
// back-office doit marquer terminé (ou prolonger) depuis la fiche chantier.
function LigneAClouturer({
  chantier,
  maintenant,
}: {
  chantier: ChantierAClouturer;
  maintenant: Date;
}) {
  const retardJours = Math.floor(
    (maintenant.getTime() - chantier.dateFin.getTime()) / 86_400_000,
  );
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2">
          <Link
            href={`/app/chantiers/${chantier.id}`}
            className="text-sm font-semibold text-primary-800 hover:underline"
          >
            {chantier.nomClient}
          </Link>
          <BadgeAlerte>
            {retardJours >= 1
              ? `Fini depuis ${retardJours} j`
              : "Date de fin dépassée"}
          </BadgeAlerte>
        </p>
        <p className="truncate text-xs text-neutral-500">{chantier.adresse}</p>
        <p className="text-xs text-neutral-600">
          Travaux {periodeJoursFr(chantier.dateDebut, chantier.dateFin)} — à
          marquer terminé ou à prolonger.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/app/chantiers/${chantier.id}`}
          className={boutonClasses("primaire", "sm")}
        >
          <HardHat className="size-4" aria-hidden="true" />
          Ouvrir le chantier
        </Link>
        <Link
          href={`/app/dossiers/${chantier.dossierId}`}
          className={boutonClasses("fantome", "sm")}
        >
          Voir la fiche
        </Link>
      </div>
    </li>
  );
}

/* ── Briques partagées ──────────────────────────────────────────────── */

function PastilleCompte({
  compte,
  accent,
}: {
  compte: number;
  accent: "violet" | "rouge";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        compte === 0
          ? "bg-neutral-200 text-neutral-600"
          : accent === "violet"
            ? "bg-violet-600 text-white"
            : "bg-red-600 text-white",
      )}
    >
      {compte}
    </span>
  );
}

function VideSection({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-4 rounded-lg border border-dashed border-neutral-300 px-3 py-6 text-center text-xs text-neutral-500">
      {children}
    </p>
  );
}
