import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  MapPin,
  Navigation,
  TriangleAlert,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { visiteLabel } from "@/lib/metier";
import { formatJourCourtFr } from "@/lib/format";
import {
  ajouterJoursLocal,
  debutJourLocal,
  fenetreSemaine,
  instantLocal,
  minutesVersLabel,
} from "@/lib/planning";
import { mapsItineraireHref } from "@/lib/maps";
import { boutonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BadgeEnvoi } from "@/components/conducteur/badge-envoi";
import { BoutonAppel } from "@/components/conducteur/bouton-appel";
import { cn } from "@/lib/ui";
import { PrechargeVisites } from "./precharge";

export const metadata: Metadata = { title: "Mes visites" };

// Agenda terrain du conducteur : ses visites de la semaine, groupées par
// échéance (bornes de jour Europe/Paris — jamais l'heure du serveur), avec les
// visites déjà réalisées conservées dans leur journée (fait vs à faire).
export default async function MesVisitesPage() {
  const user = await requireRole(["CONDUCTEUR"]);

  const maintenant = new Date();
  const debutAujourdhui = debutJourLocal(maintenant);
  const debutDemain = ajouterJoursLocal(debutAujourdhui, 1);
  const debutApresDemain = ajouterJoursLocal(debutAujourdhui, 2);
  const finSemaine = fenetreSemaine(maintenant).fin;

  // À faire (toutes les PLANIFIEES, y compris en retard) + fait de la semaine
  // en cours (les réalisées plus anciennes vivent dans l'Historique).
  const visites = await prisma.visite.findMany({
    where: {
      conducteurId: user.id,
      dossier: { organisationId: user.organisationId },
      OR: [
        { statut: "PLANIFIEE" },
        { statut: "REALISEE", datePlanifiee: { gte: debutAujourdhui } },
      ],
    },
    orderBy: { datePlanifiee: "asc" },
    select: visiteAgendaSelect,
  });

  const groupes = {
    enRetard: [] as VisiteAgenda[],
    aujourdhui: [] as VisiteAgenda[],
    demain: [] as VisiteAgenda[],
    cetteSemaine: [] as VisiteAgenda[],
    plusTard: [] as VisiteAgenda[],
  };
  for (const v of visites) {
    const d = v.datePlanifiee;
    if (d < debutAujourdhui) {
      if (v.statut === "PLANIFIEE") groupes.enRetard.push(v);
    } else if (d < debutDemain) groupes.aujourdhui.push(v);
    else if (d < debutApresDemain) groupes.demain.push(v);
    else if (d < finSemaine) groupes.cetteSemaine.push(v);
    else groupes.plusTard.push(v);
  }

  const aFaire = visites.filter((v) => v.statut === "PLANIFIEE").length;
  const faitesAujourdhui = groupes.aujourdhui.filter(
    (v) => v.statut === "REALISEE",
  ).length;

  // Itinéraire du jour : uniquement les visites restant à faire, dans l'ordre
  // chronologique des plages (début de plage, déjà l'ordre de la requête) —
  // aucun calcul d'ordre de tournée (cf. lib/geo.ts).
  const restantesAujourdhui = groupes.aujourdhui.filter(
    (v) => v.statut === "PLANIFIEE",
  );
  const hrefItineraire = mapsItineraireHref(
    restantesAujourdhui.map((v) => v.dossier.adresse),
  );

  // Fiches des visites à faire, préchargées pour l'accès hors-ligne.
  const urlsAPrecharger = visites
    .filter((v) => v.statut === "PLANIFIEE")
    .slice(0, 20)
    .map((v) => `/app/visites/${v.id}`);

  return (
    <div className="space-y-6">
      <PrechargeVisites urls={urlsAPrecharger} />
      <div className="space-y-1">
        <h1 className="font-display text-xl font-bold tracking-tight text-neutral-900">
          Mes visites
        </h1>
        <p className="text-sm text-neutral-500">
          {aFaire === 0
            ? "Aucune visite à faire"
            : `${aFaire} visite${aFaire > 1 ? "s" : ""} à faire`}
          {faitesAujourdhui > 0 &&
            ` · ${faitesAujourdhui} faite${faitesAujourdhui > 1 ? "s" : ""} aujourd'hui`}
        </p>
      </div>

      {visites.length === 0 ? (
        <EmptyState
          titre="Aucune visite planifiée"
          description="Vos prochaines visites apparaîtront ici dès qu'elles seront planifiées par le bureau."
        />
      ) : (
        <div className="space-y-6">
          <Groupe titre="En retard" visites={groupes.enRetard} accent avecJour />
          <Groupe
            titre="Aujourd'hui"
            visites={groupes.aujourdhui}
            action={
              hrefItineraire ? (
                <a
                  href={hrefItineraire}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={boutonClasses("secondaire", "sm")}
                >
                  <Navigation className="size-3.5 shrink-0" aria-hidden="true" />
                  Itinéraire du jour
                </a>
              ) : null
            }
          />
          <Groupe titre="Demain" visites={groupes.demain} />
          <Groupe titre="Cette semaine" visites={groupes.cetteSemaine} avecJour />
          <Groupe titre="Plus tard" visites={groupes.plusTard} avecJour />
        </div>
      )}
    </div>
  );
}

// select minimal : les cartes n'affichent ni resume/conclusion (≤ 5000 car.
// chacun) ni piecesEndommagees — on ne transfère que les champs rendus.
const visiteAgendaSelect = {
  id: true,
  statut: true,
  numero: true,
  datePlanifiee: true,
  dureeMinutes: true, // amplitude de la plage → « 10h – 12h »
  dossier: { select: { nomClient: true, adresse: true, telephone: true } },
} satisfies Prisma.VisiteSelect;

type VisiteAgenda = Prisma.VisiteGetPayload<{
  select: typeof visiteAgendaSelect;
}>;

function Groupe({
  titre,
  visites,
  accent = false,
  avecJour = false,
  action,
}: {
  titre: string;
  visites: VisiteAgenda[];
  accent?: boolean;
  avecJour?: boolean;
  action?: React.ReactNode;
}) {
  if (visites.length === 0) return null;
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          className={cn(
            "flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase",
            accent ? "text-red-700" : "text-neutral-500",
          )}
        >
          {accent && <TriangleAlert className="size-3.5" aria-hidden="true" />}
          {titre}
          <span className="font-normal">· {visites.length}</span>
        </h2>
        {action}
      </div>
      <div className="space-y-2">
        {visites.map((v) => (
          <CarteVisite key={v.id} visite={v} accent={accent} avecJour={avecJour} />
        ))}
      </div>
    </section>
  );
}

// Carte au pouce : le Link couvre la zone principale (heure en colonne
// d'agenda, client, adresse), le bouton d'appel est un élément FRÈRE dans la
// carte (jamais de lien imbriqué dans un lien — HTML invalide). Visite
// réalisée = atténuée + coche verte (le fait reste visible dans le jour).
function CarteVisite({
  visite,
  accent,
  avecJour,
}: {
  visite: VisiteAgenda;
  accent: boolean;
  avecJour: boolean;
}) {
  const faite = visite.statut === "REALISEE";
  // Plage d'arrivée (fenêtre) : début en gros, fin dessous — le conducteur
  // passe QUELQUE PART dans cette plage (l'assistante ordonne la tournée).
  const debutMin = instantLocal(visite.datePlanifiee).minutes;
  const finMin = debutMin + visite.dureeMinutes;
  return (
    <div
      className={cn(
        "flex min-h-20 items-stretch rounded-lg border bg-white shadow-xs",
        accent ? "border-red-200" : "border-neutral-200",
        faite && "bg-neutral-50",
      )}
    >
      <Link
        href={`/app/visites/${visite.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-l-lg p-4 transition-[color,background-color,transform] duration-150 active:scale-[0.99] active:bg-neutral-100"
      >
        <div className="w-16 shrink-0 text-center leading-tight">
          <p
            className={cn(
              "font-display text-lg font-bold tabular-nums",
              faite ? "text-neutral-400" : accent ? "text-red-700" : "text-neutral-900",
            )}
          >
            {minutesVersLabel(debutMin)}
          </p>
          <p
            className={cn(
              "text-xs font-medium tabular-nums",
              faite ? "text-neutral-400" : "text-neutral-500",
            )}
          >
            → {minutesVersLabel(finMin)}
          </p>
          {avecJour && (
            <p className="text-xs text-neutral-500">
              {formatJourCourtFr(visite.datePlanifiee)}
            </p>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-0.5">
          <p
            className={cn(
              "truncate font-medium",
              faite ? "text-neutral-500" : "text-neutral-900",
            )}
          >
            {visite.dossier.nomClient}
          </p>
          <p className="flex items-center gap-1 text-sm text-neutral-500">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{visite.dossier.adresse}</span>
          </p>
          <p className="truncate text-xs text-neutral-500">
            {visiteLabel(visite.numero)}
          </p>
          {/* Compte-rendu en file locale : statut honnête, invisible sinon. */}
          <BadgeEnvoi visiteId={visite.id} />
        </div>

        {faite ? (
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-green-700">
            <CheckCircle2 className="size-5" aria-hidden="true" />
            Réalisée
          </span>
        ) : (
          <ChevronRight
            className="size-5 shrink-0 text-neutral-400"
            aria-hidden="true"
          />
        )}
      </Link>

      {/* Appel client en 1 tap, cible ≥ 44 px, hors du Link. */}
      <div className="flex items-center border-l border-neutral-200/70 px-2.5">
        <BoutonAppel
          telephone={visite.dossier.telephone}
          nom={visite.dossier.nomClient}
        />
      </div>
    </div>
  );
}
