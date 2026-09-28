import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Droplets, Phone } from "lucide-react";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  dateContreVisiteConseillee,
  dossierEnTravaux,
  visiteLabel,
} from "@/lib/metier";
import {
  ajouterJoursLocal,
  dateVersParamJour,
  debutJourLocal,
  instantLocal,
  parseParamJour,
} from "@/lib/planning";
import { formatDateFr } from "@/lib/format";
import { telHref } from "@/components/conducteur/bouton-appel";
import { EmptyState } from "@/components/ui/empty-state";
import { chargerCreneaux } from "./actions";
import { PlanifierSelecteur } from "./form";
import { titreDossier } from "../titre";
import { visiteDejaPlanifiee } from "@/lib/visites";

const RETOURS = new Set(["dossiers", "dossier", "planning"]);

// Titre statique quel que soit le mode (planifier/replanifier) : le mode
// dépend d'un searchParam, jamais reflété dans le titre d'onglet.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return titreDossier(id, "Planifier une visite");
}

// Sélecteur de PLAGE : agenda 14 jours calculé par chargerCreneaux (./actions —
// LA source unique, aussi appelée par le client à chaque réglage
// conducteur/fenêtre, sans re-render serveur de la page) → l'assistante choisit
// une plage horaire (De/À, ou un raccourci Matin/Après-midi) et voit les
// visites déjà posées dans cette plage (frise). Deux visites proches peuvent
// partager une plage — jamais bloquant. Absence/hors-horaires restent des
// avertissements forçables. Le champ soumis est un ISO UTC calculé CÔTÉ SERVEUR
// (le début de plage) — le bug datetime-local/fuseau est éliminé par
// construction. Mode replanification : ?visite=<id> pré-remplit et exclut la
// visite.
export default async function PlanifierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    conducteur?: string;
    jour?: string;
    visite?: string;
    retour?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireRole(BACK_OFFICE_ROLES);

  // 6 lectures qui ne dépendent que de params/searchParams : une seule salve.
  // Les requêtes visite portent leur PROPRE scoping org (dossier: { organisationId })
  // — elles ne peuvent plus s'appuyer sur le check préalable du dossier.
  const [dossier, org, conducteurs, visiteARemplacer, dernierePosee, dejaPlanifiee] =
    await Promise.all([
      prisma.dossier.findFirst({
        where: { id, organisationId: user.organisationId },
        select: {
          id: true,
          nomClient: true,
          adresse: true,
          telephone: true,
          statut: true,
          classeHumiditeLe: true,
          latitude: true,
          longitude: true,
          _count: { select: { visites: true } },
        },
      }),
      prisma.organisation.findUniqueOrThrow({
        where: { id: user.organisationId },
        select: {
          heureOuverture: true,
          heureFermeture: true,
          dureeVisiteDefautMinutes: true,
        },
      }),
      prisma.user.findMany({
        where: { organisationId: user.organisationId, role: "CONDUCTEUR" },
        orderBy: { nom: "asc" },
        select: { id: true, nom: true },
      }),
      // Mode replanification : la visite doit appartenir AU dossier.
      sp.visite
        ? prisma.visite.findFirst({
            where: {
              id: sp.visite,
              dossierId: id,
              statut: "PLANIFIEE",
              dossier: { organisationId: user.organisationId },
            },
            select: {
              id: true,
              numero: true,
              conducteurId: true,
              dureeMinutes: true,
              datePlanifiee: true,
            },
          })
        : null,
      prisma.visite.findFirst({
        where: {
          dossierId: id,
          dossier: { organisationId: user.organisationId },
        },
        orderBy: { numero: "desc" },
        select: { conducteurId: true, dureeMinutes: true },
      }),
      // Garde « une seule visite PLANIFIEE à la fois » (voir plus bas).
      visiteDejaPlanifiee(prisma, user.organisationId, id),
    ]);
  if (!dossier) notFound();
  // Dossier passé aux travaux : le cycle expertise est clos, plus de visite à
  // planifier (même garde dans l'action planifierVisite).
  if (dossierEnTravaux(dossier.statut)) {
    redirect(`/app/dossiers/${dossier.id}`);
  }
  // Dossier annulé : à reprendre d'abord — retour à la fiche (même garde dans
  // planifierVisite et chargerCreneaux). redirect() HORS de tout try/catch.
  if (dossier.statut === "ANNULE") {
    redirect(`/app/dossiers/${dossier.id}`);
  }
  // UNE seule visite PLANIFIEE à la fois par dossier (même garde dans
  // planifierVisite et chargerCreneaux) : planifier une 2ᵉ n'a pas de page —
  // retour à la fiche, où vivent replanifier/annuler. La replanification de
  // la visite existante (?visite=<id>) reste accessible.
  if (!visiteARemplacer && dejaPlanifiee) {
    redirect(`/app/dossiers/${dossier.id}`);
  }

  const replanification = visiteARemplacer !== null;

  // Contre-visite : pré-sélectionner le conducteur (et la durée) de la
  // dernière visite du dossier — celui qui connaît le chantier. Sans objet en
  // replanification (la visite à remplacer porte déjà ces réglages).
  const derniereVisite = replanification ? null : dernierePosee;

  const retour = RETOURS.has(sp.retour ?? "") ? sp.retour! : "dossiers";
  const numeroSuggere = visiteARemplacer
    ? visiteARemplacer.numero
    : dossier._count.visites + 1;

  const titre = replanification ? "Replanifier la visite" : "Planifier une visite";

  if (conducteurs.length === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <EntetePlanifier titre={titre} dossier={dossier} numero={numeroSuggere} />
        <EmptyState
          titre="Aucun conducteur dans l'organisation"
          description="Autorisez un conducteur dans Paramètres → Utilisateurs (il sera créé à sa première connexion), puis revenez planifier."
        />
      </div>
    );
  }

  // Sélections courantes (searchParams > visite à replanifier > dernière
  // visite du dossier > défauts org).
  const conducteur =
    conducteurs.find((c) => c.id === sp.conducteur) ??
    conducteurs.find((c) => c.id === visiteARemplacer?.conducteurId) ??
    conducteurs.find((c) => c.id === derniereVisite?.conducteurId) ??
    conducteurs[0];

  // Amplitude de plage pré-remplie : la visite à replanifier > la dernière
  // visite du dossier > le défaut de l'org.
  const amplitudeDefaut =
    visiteARemplacer?.dureeMinutes ??
    derniereVisite?.dureeMinutes ??
    org.dureeVisiteDefautMinutes;

  const maintenant = new Date();
  const aujourdhui = debutJourLocal(maintenant);

  // Contre-visite d'un dossier en attente humidité : ouvrir la fenêtre autour
  // de la date conseillée (échéance − 3 j) pour montrer la fin du séchage —
  // les jours antérieurs sont marqués, jamais bloqués.
  const echeanceSechage = dateContreVisiteConseillee(dossier);
  const debutSechage = echeanceSechage ? debutJourLocal(echeanceSechage) : null;
  const debutConseille =
    debutSechage && debutSechage.getTime() > aujourdhui.getTime()
      ? (() => {
          const recule = ajouterJoursLocal(debutSechage, -3);
          return recule.getTime() > aujourdhui.getTime() ? recule : aujourdhui;
        })()
      : aujourdhui;

  // Replanification : pré-sélectionner la plage de la visite (minutes brutes —
  // le sélecteur les aligne sur la grille des marques du jour, robuste quelles
  // que soient les heures d'ouverture de l'org).
  const selectionInitiale = visiteARemplacer
    ? {
        cle: dateVersParamJour(debutJourLocal(visiteARemplacer.datePlanifiee)),
        deMin: instantLocal(visiteARemplacer.datePlanifiee).minutes,
        aMin:
          instantLocal(visiteARemplacer.datePlanifiee).minutes +
          visiteARemplacer.dureeMinutes,
      }
    : null;

  // Replanification sans ?jour : ouvrir la fenêtre sur le jour de la visite.
  const jourDebut =
    parseParamJour(sp.jour) ??
    (visiteARemplacer
      ? debutJourLocal(visiteARemplacer.datePlanifiee)
      : debutConseille);

  // Agenda initial par LA même lecture que le client (zéro duplication) : le
  // contexte des jours arrive en props, le premier rendu reste 100 % serveur.
  const resultat = await chargerCreneaux({
    dossierId: dossier.id,
    conducteurId: conducteur.id,
    jour: dateVersParamJour(jourDebut),
    visiteId: visiteARemplacer?.id ?? null,
  });
  // La page a déjà validé dossier/conducteur/durée : un échec ici est un bug.
  if (!resultat.ok) throw new Error(resultat.error);

  const dossierPoint =
    dossier.latitude !== null && dossier.longitude !== null
      ? { latitude: dossier.latitude, longitude: dossier.longitude }
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <EntetePlanifier titre={titre} dossier={dossier} numero={numeroSuggere} />

      <PlanifierSelecteur
        dossierId={dossier.id}
        visiteId={visiteARemplacer?.id ?? null}
        retour={retour}
        conducteurs={conducteurs}
        conducteurIdInitial={conducteur.id}
        jourInitial={dateVersParamJour(jourDebut)}
        aujourdhui={dateVersParamJour(aujourdhui)}
        joursInitiaux={resultat.jours}
        bornesInitiales={resultat.bornes}
        horairesDefinisInitial={resultat.horairesDefinis}
        amplitudeDefaut={amplitudeDefaut}
        selectionInitiale={selectionInitiale}
        nomClient={dossier.nomClient}
        dossierPosition={dossierPoint}
      >
        {echeanceSechage && (
          <p className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <Droplets className="size-4 shrink-0" aria-hidden="true" />
            <span>
              Contre-visite conseillée à partir du{" "}
              <strong className="font-semibold">
                {formatDateFr(echeanceSechage)}
              </strong>{" "}
              (fin du délai de séchage). Les jours antérieurs sont marqués d&apos;une
              goutte — planifiables quand même.
            </span>
          </p>
        )}
      </PlanifierSelecteur>
    </div>
  );
}

function EntetePlanifier({
  titre,
  dossier,
  numero,
}: {
  titre: string;
  dossier: {
    id: string;
    nomClient: string;
    adresse: string;
    telephone: string;
  };
  numero: number;
}) {
  return (
    <div className="space-y-1">
      <Link
        href="/app/dossiers"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Dossiers
      </Link>
      <h1 className="text-xl font-bold tracking-tight">{titre}</h1>
      <p className="text-sm text-neutral-500">
        {dossier.nomClient} ·{" "}
        {/* tel: — un clic = un appel pour caler le créneau avec le client. */}
        <a
          href={telHref(dossier.telephone)}
          className="inline-flex items-center gap-1 font-medium text-primary-800 tabular-nums hover:underline"
        >
          <Phone className="size-3.5" aria-hidden="true" />
          {dossier.telephone}
        </a>{" "}
        · {dossier.adresse} — {visiteLabel(numero)}
      </p>
    </div>
  );
}
