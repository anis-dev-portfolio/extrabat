"use client";

import { useActionState, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Droplets,
  Minus,
  Navigation,
  Plus,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  planifierVisite,
  replanifierVisite,
  type PlanifierState,
} from "../../actions";
import { chargerCreneaux } from "./actions";
import { ControlesPlanifier } from "./controles";
import { MESSAGE_VISITE_DEJA_PLANIFIEE } from "@/lib/metier";
import { Button } from "@/components/ui/button";
import {
  CarteVisites,
  COULEUR_DOSSIER,
  COULEURS_CARTE,
  type PointCarte,
} from "@/components/carte-visites";
import {
  JOURS_FENETRE_PLANIFICATION,
  ajouterJoursLocal,
  dateVersParamJour,
  minutesVersLabel,
  parseParamJour,
} from "@/lib/planning";
import type { Proximite } from "@/lib/geo";
import { cn } from "@/lib/ui";

// ── Sérialisation serveur (cf. chargerCreneaux dans ./actions) ─────────────

export type MarqueSerialise = { minutes: number; iso: string };

export type VisiteTimeline = {
  debutMin: number;
  finMin: number;
  nomClient: string;
  heureLabel: string; // « 10h – 11h »
};

export type PlageTravaillee = { debutMin: number; finMin: number };

export type Bornes = { debutMin: number; finMin: number };

export type JourSerialise = {
  cle: string;
  label: string; // « lundi 6 juillet » (titre + récap)
  labelCourt: string; // « lun. 6 juil. » (pill)
  avantSechage: boolean; // jour avant la fin du délai de séchage conseillé
  enAbsence: boolean; // conducteur absent ce jour entier
  absenceMotif: string | null;
  // Plages travaillées du jour (repli : ouverture org 7 j/7) — raccourcis,
  // piste de la frise, contrôle « hors horaires ».
  plagesTravaillees: PlageTravaillee[];
  // Marques de 30 min (ouverture→fermeture incluses), chacune avec l'ISO UTC
  // serveur : le « De » choisi fournit la datePlanifiee soumise.
  marques: MarqueSerialise[];
  // Visites déjà posées ce jour-là (frise + chevauchement informatif).
  visitesTimeline: VisiteTimeline[];
  // Signal géo informatif (jamais bloquant). Cf. lib/geo.ts.
  proximite: Proximite;
  proximiteDetail: string | null;
  // Visites localisables du jour, affichées sur la carte du jour déplié.
  visitesCarte: { latitude: number; longitude: number; label: string }[];
  nbSansPosition: number; // visites du jour sans coordonnées (hors carte)
};

const initial: PlanifierState = { error: null, conflits: [] };

// « 2 h », « 1 h 30 », « 45 min » — amplitude d'une plage (durée cumulée).
function amplitudeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

// Nom parlant d'une plage travaillée pour son bouton raccourci.
function nomPlage(p: PlageTravaillee, total: number): string {
  if (total <= 1) return "Journée";
  if (p.finMin <= 13 * 60) return "Matin";
  if (p.debutMin >= 13 * 60) return "Après-midi";
  return "Journée";
}

type Plage = { deMin: number; aMin: number };

// Minute de la grille (marques) la plus proche — toute sélection s'aligne sur
// ces marques pour que le « De » retrouve toujours son ISO serveur, quelles que
// soient les heures d'ouverture de l'org.
function marqueLaPlusProche(grille: number[], min: number): number {
  let best = grille[0];
  let bestDiff = Infinity;
  for (const g of grille) {
    const d = Math.abs(g - min);
    if (d < bestDiff) {
      bestDiff = d;
      best = g;
    }
  }
  return best;
}

// Normalise une plage brute sur la grille : De et À alignés, De strictement
// avant À (au moins une marque d'écart), De jamais sur la dernière marque.
function normaliserPlage(grille: number[], deRaw: number, aRaw: number): Plage {
  let deIdx = grille.indexOf(marqueLaPlusProche(grille, deRaw));
  if (deIdx >= grille.length - 1) deIdx = grille.length - 2;
  let aIdx = grille.indexOf(marqueLaPlusProche(grille, aRaw));
  if (aIdx <= deIdx) aIdx = deIdx + 1;
  return { deMin: grille[deIdx], aMin: grille[aIdx] };
}

// Plages travaillées d'un jour (repli : ouverture de l'org).
function plagesDuJour(jour: JourSerialise, bornes: Bornes): PlageTravaillee[] {
  return jour.plagesTravaillees.length > 0
    ? jour.plagesTravaillees
    : [{ debutMin: bornes.debutMin, finMin: bornes.finMin }];
}

// Première marque ENCORE À VENIR du jour (null : jour entièrement passé).
// Comparée sur l'ISO serveur des marques : indépendant du fuseau du navigateur.
function premiereMarqueFuture(jour: JourSerialise, maintenant: number): number | null {
  return jour.marques.find((m) => Date.parse(m.iso) > maintenant)?.minutes ?? null;
}

// Reste-t-il du temps travaillé à venir ce jour-là ?
function resteDuTemps(jour: JourSerialise, bornes: Bornes, maintenant: number): boolean {
  const futur = premiereMarqueFuture(jour, maintenant);
  return futur !== null && plagesDuJour(jour, bornes).some((p) => p.finMin > futur);
}

// Plage par défaut d'un jour : sa 1re plage travaillée ENCORE À VENIR (dès la
// prochaine marque si elle est entamée), bornée à l'amplitude par défaut de
// l'org, alignée sur la grille. Avant, à 15 h, « aujourd'hui 8h – 9h » était
// proposé — et accepté.
function defautPlage(
  jour: JourSerialise,
  bornes: Bornes,
  amplitude: number,
  maintenant: number,
): Plage {
  const grille = jour.marques.map((m) => m.minutes);
  const plages = plagesDuJour(jour, bornes);
  const futur = premiereMarqueFuture(jour, maintenant);
  const base =
    (futur !== null && plages.find((p) => p.finMin > futur)) || plages[0];
  const debut = futur !== null ? Math.max(base.debutMin, futur) : base.debutMin;
  return normaliserPlage(
    grille,
    debut,
    Math.min(debut + amplitude, base.finMin),
  );
}

// Réglages du sélecteur (conducteur / début de fenêtre) — l'état client qui
// pilote le rechargement de l'agenda. L'AMPLITUDE de la plage n'en fait plus
// partie : elle se choisit dans le jour (frise), sans aller-retour serveur.
type Reglages = { conducteurId: string; jour: string };

// Orchestrateur du sélecteur : possède les réglages ET l'agenda côté client.
// Chaque changement de réglage recharge l'agenda via la Server Action de
// lecture chargerCreneaux (./actions) — plus de re-render serveur de la page à
// chaque réglage, le premier agenda arrive en props (rendu serveur, pas de
// flash vide). L'URL reste synchronisée par history.replaceState (natif,
// supporté par Next 15). Le submit reste STRICTEMENT inchangé : même Server
// Action, re-vérification en transaction.
export function PlanifierSelecteur({
  dossierId,
  visiteId,
  retour,
  conducteurs,
  conducteurIdInitial,
  jourInitial,
  aujourdhui,
  joursInitiaux,
  bornesInitiales,
  horairesDefinisInitial,
  amplitudeDefaut,
  selectionInitiale,
  nomClient,
  dossierPosition,
  children,
}: {
  dossierId: string;
  visiteId: string | null; // non nul = replanification
  retour: string;
  conducteurs: { id: string; nom: string }[];
  conducteurIdInitial: string;
  jourInitial: string;
  aujourdhui: string; // jour civil serveur (borne du recul de fenêtre)
  joursInitiaux: JourSerialise[];
  bornesInitiales: Bornes;
  horairesDefinisInitial: boolean;
  amplitudeDefaut: number; // amplitude de plage pré-remplie (org / visite)
  selectionInitiale: { cle: string; deMin: number; aMin: number } | null;
  nomClient: string;
  dossierPosition: { latitude: number; longitude: number } | null;
  children?: ReactNode; // bandeau séchage (rendu serveur, statique)
}) {
  const [reglages, setReglages] = useState<Reglages>({
    conducteurId: conducteurIdInitial,
    jour: jourInitial,
  });
  // `conducteurId` DANS l'agenda : le bandeau « horaires non définis » lit son
  // nom ET son flag de CE snapshot, jamais du réglage courant.
  const [agenda, setAgenda] = useState({
    conducteurId: conducteurIdInitial,
    jours: joursInitiaux,
    horairesDefinis: horairesDefinisInitial,
    bornes: bornesInitiales,
  });
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Annulation des réponses obsolètes : le DERNIER réglage gagne.
  const requeteId = useRef(0);

  const conducteurNom =
    conducteurs.find((c) => c.id === reglages.conducteurId)?.nom ?? "";
  const agendaConducteurNom =
    conducteurs.find((c) => c.id === agenda.conducteurId)?.nom ?? "";

  // Navigation ±14 j dérivée du réglage courant (mêmes helpers Europe/Paris que
  // le serveur — jourInitial vient toujours de dateVersParamJour).
  const jourDebut = parseParamJour(reglages.jour);
  const jourPrecedent = jourDebut
    ? dateVersParamJour(ajouterJoursLocal(jourDebut, -JOURS_FENETRE_PLANIFICATION))
    : reglages.jour;
  const jourSuivant = jourDebut
    ? dateVersParamJour(ajouterJoursLocal(jourDebut, JOURS_FENETRE_PLANIFICATION))
    : reglages.jour;
  const peutReculer = reglages.jour > aujourdhui;

  async function recharger(cibles: Reglages) {
    const id = ++requeteId.current;
    setChargement(true);
    setErreur(null);
    try {
      const resultat = await chargerCreneaux({
        dossierId,
        conducteurId: cibles.conducteurId,
        jour: cibles.jour,
        visiteId,
      });
      if (id !== requeteId.current) return; // un réglage plus récent est parti
      if (resultat.ok) {
        setAgenda({
          conducteurId: cibles.conducteurId,
          jours: resultat.jours,
          horairesDefinis: resultat.horairesDefinis,
          bornes: resultat.bornes,
        });
      } else {
        setErreur(resultat.error);
      }
    } catch {
      if (id !== requeteId.current) return;
      setErreur(
        "Impossible de recharger l'agenda. Vérifiez votre connexion, puis réessayez.",
      );
    } finally {
      if (id === requeteId.current) setChargement(false);
    }
  }

  function changer(patch: Partial<Reglages>) {
    const cibles = { ...reglages, ...patch };
    setReglages(cibles);
    const params = new URLSearchParams({
      conducteur: cibles.conducteurId,
      jour: cibles.jour,
      retour,
    });
    if (visiteId) params.set("visite", visiteId);
    window.history.replaceState(
      null,
      "",
      `/app/dossiers/${dossierId}/planifier?${params.toString()}`,
    );
    void recharger(cibles);
  }

  return (
    <>
      <ControlesPlanifier
        conducteurs={conducteurs}
        conducteurId={reglages.conducteurId}
        jourPrecedent={jourPrecedent}
        jourSuivant={jourSuivant}
        peutReculer={peutReculer}
        onChanger={changer}
      />

      {children}

      {!agenda.horairesDefinis && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Horaires non définis pour {agendaConducteurNom} : les heures
          d&apos;ouverture de l&apos;organisation sont utilisées, 7 jours sur 7.
          Définissez ses horaires dans Paramètres → Disponibilités.
        </p>
      )}

      {erreur && (
        <p
          role="alert"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {erreur === MESSAGE_VISITE_DEJA_PLANIFIEE ? (
            <>
              <span>{erreur}</span>
              <Link
                href={`/app/dossiers/${dossierId}`}
                className="font-medium underline underline-offset-2 hover:text-red-950"
              >
                Retour à la fiche dossier
              </Link>
            </>
          ) : (
            <>
              <span>{erreur} L&apos;agenda affiché peut être dépassé.</span>
              <button
                type="button"
                onClick={() => void recharger(reglages)}
                className="cursor-pointer font-medium underline underline-offset-2 hover:text-red-950"
              >
                Réessayer
              </button>
            </>
          )}
        </p>
      )}

      {/* Rechargement en cours : agenda estompé mais interactif — le serveur
          re-vérifie de toute façon au submit. */}
      <div
        aria-busy={chargement || undefined}
        className={cn("transition-opacity delay-150", chargement && "opacity-50")}
      >
        {/* Clé = conducteur de l'AGENDA affiché : quand celui du nouveau
            conducteur arrive, on repart d'un formulaire neuf — la case
            « planifier quand même », les conflits renvoyés par le serveur et
            la plage par défaut concernaient l'ANCIEN conducteur. */}
        <PlanifierForm
          key={agenda.conducteurId}
          dossierId={dossierId}
          visiteId={visiteId}
          conducteurId={reglages.conducteurId}
          conducteurNom={conducteurNom}
          retour={retour}
          jours={agenda.jours}
          bornes={agenda.bornes}
          amplitudeDefaut={amplitudeDefaut}
          selectionInitiale={selectionInitiale}
          nomClient={nomClient}
          dossierPosition={dossierPosition}
        />
      </div>
    </>
  );
}

// Sélecteur de plage + soumission : pills des 14 jours → jour déplié avec une
// FRISE INTERACTIVE (glisser les poignées / boutons ± / raccourcis) montrant
// les visites déjà posées et la plage candidate → récap sticky. Le champ soumis
// reste un ISO UTC serveur (la marque « De ») + l'amplitude.
export function PlanifierForm({
  dossierId,
  visiteId,
  conducteurId,
  conducteurNom,
  retour,
  jours,
  bornes,
  amplitudeDefaut,
  selectionInitiale,
  nomClient,
  dossierPosition,
}: {
  dossierId: string;
  visiteId: string | null; // non nul = replanification
  conducteurId: string;
  conducteurNom: string;
  retour: string;
  jours: JourSerialise[];
  bornes: Bornes;
  amplitudeDefaut: number;
  selectionInitiale: { cle: string; deMin: number; aMin: number } | null;
  nomClient: string;
  dossierPosition: { latitude: number; longitude: number } | null;
}) {
  const action = visiteId
    ? replanifierVisite.bind(null, visiteId)
    : planifierVisite.bind(null, dossierId);
  const [state, formAction, pending] = useActionState(action, initial);

  // Jour déplié : la sélection initiale si présente, sinon le 1er jour où il
  // reste du temps travaillé à venir (aujourd'hui après la fermeture → demain).
  const [ouvertCle, setOuvertCle] = useState<string>(
    () =>
      selectionInitiale?.cle ??
      (jours.find((j) => resteDuTemps(j, bornes, Date.now())) ?? jours[0])?.cle ??
      "",
  );
  // Plage candidate (minutes alignées sur la grille — les bornes org sont
  // constantes, donc valable quel que soit le jour déplié).
  const [plage, setPlage] = useState<Plage>(() => {
    const grille = jours[0].marques.map((m) => m.minutes);
    if (selectionInitiale) {
      return normaliserPlage(grille, selectionInitiale.deMin, selectionInitiale.aMin);
    }
    const maintenant = Date.now();
    const jourDefaut =
      jours.find((j) => resteDuTemps(j, bornes, maintenant)) ?? jours[0];
    return defautPlage(jourDefaut, bornes, amplitudeDefaut, maintenant);
  });
  const [forcer, setForcer] = useState(false);

  // Jour déplié, clampé défensivement (la fenêtre a pu bouger).
  const jourOuvert = jours.find((j) => j.cle === ouvertCle) ?? jours[0];

  // ISO UTC serveur du début de plage (champ soumis) — trouvé dans les marques
  // du jour déplié (mêmes minutes chaque jour, bornes org constantes).
  const isoDe = jourOuvert.marques.find((m) => m.minutes === plage.deMin)?.iso ?? "";
  const amplitude = plage.aMin - plage.deMin;

  // Chevauchement INFORMATIF : visites du jour qui recoupent la plage.
  const chevauchantes = jourOuvert.visitesTimeline.filter(
    (v) => plage.deMin < v.finMin && v.debutMin < plage.aMin,
  );

  // Avertissements BLOQUANTS (forçables), calculés côté client — le serveur
  // re-tranche au submit. Le chevauchement n'en fait PAS partie.
  const avertissements: string[] = [];
  if (jourOuvert.enAbsence) {
    avertissements.push(
      `Conducteur absent ce jour${jourOuvert.absenceMotif ? ` (${jourOuvert.absenceMotif})` : ""}`,
    );
  }
  const dansHoraires = jourOuvert.plagesTravaillees.some(
    (p) => plage.deMin >= p.debutMin && plage.aMin <= p.finMin,
  );
  if (!dansHoraires) {
    const plages =
      jourOuvert.plagesTravaillees
        .map((p) => `${minutesVersLabel(p.debutMin)} – ${minutesVersLabel(p.finMin)}`)
        .join(", ") || "aucune plage ce jour";
    avertissements.push(`Hors des horaires du conducteur (ce jour : ${plages})`);
  }
  const conflitsServeur = state.conflits.map((c) =>
    c.type === "ABSENCE"
      ? "Le conducteur est absent sur cette plage"
      : "La plage est hors des horaires du conducteur",
  );
  const tousAvertissements =
    avertissements.length > 0 ? avertissements : conflitsServeur;
  const doitForcer = tousAvertissements.length > 0;

  function choisirJour(cle: string) {
    setOuvertCle(cle);
    setForcer(false);
  }

  function choisirPlage(p: Plage) {
    setPlage(p);
    setForcer(false);
  }

  // Points de la carte du jour déplié : dossier (rouge) + visites déjà posées
  // (bleu). Mémoïsé : identité stable → pas de re-cadrage à chaque réglage.
  const pointsCarte = useMemo<PointCarte[]>(() => {
    const points: PointCarte[] = jourOuvert.visitesCarte.map((v) => ({
      ...v,
      couleur: COULEURS_CARTE[0],
    }));
    if (dossierPosition) {
      points.push({
        ...dossierPosition,
        label: `${nomClient} — à planifier`,
        couleur: COULEUR_DOSSIER,
        principal: true,
      });
    }
    return points;
  }, [jourOuvert, dossierPosition, nomClient]);

  return (
    <form
      action={formAction}
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
    >
      <input type="hidden" name="conducteurId" value={conducteurId} />
      <input type="hidden" name="dureeMinutes" value={amplitude} />
      <input type="hidden" name="retour" value={retour} />
      {/* ISO UTC calculé serveur (marque « De ») : jamais de datetime-local. */}
      <input type="hidden" name="datePlanifiee" value={isoDe} />

      <div className="space-y-4">
        {/* ── Sélecteur de jour : 14 pills ─────────────────────────────── */}
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {jours.map((jour) => (
            <PillJour
              key={jour.cle}
              jour={jour}
              ouvert={jour.cle === jourOuvert.cle}
              onOuvrir={() => choisirJour(jour.cle)}
            />
          ))}
        </div>

        {/* ── Plage du jour déplié ─────────────────────────────────────── */}
        <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-xs">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-800">
            <span className="first-letter:uppercase">{jourOuvert.label}</span>
            {jourOuvert.avantSechage && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                <Droplets className="size-3.5" aria-hidden="true" />
                avant la fin du séchage conseillé
              </span>
            )}
          </p>

          <SelecteurPlage
            jour={jourOuvert}
            bornes={bornes}
            plage={plage}
            onChange={choisirPlage}
          />

          {chevauchantes.length > 0 && (
            <p className="flex flex-wrap items-start gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              <Users className="mt-0.5 size-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
              <span>
                {chevauchantes.length} visite
                {chevauchantes.length > 1 ? "s" : ""} déjà dans cette plage :{" "}
                {chevauchantes
                  .map((v) => `${v.nomClient} (${v.heureLabel})`)
                  .join(", ")}
                . C&apos;est permis — ordonnez la tournée sur la carte.
              </span>
            </p>
          )}

          {/* ── Carte du jour : la réalité géographique, pas un signal ────── */}
          {pointsCarte.length > 0 && (
            <div className="space-y-1.5 border-t border-neutral-100 pt-3">
              <CarteVisites points={pointsCarte} />
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                {dossierPosition && (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: COULEUR_DOSSIER }}
                      aria-hidden="true"
                    />
                    {nomClient} (à planifier)
                  </span>
                )}
                {jourOuvert.visitesCarte.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: COULEURS_CARTE[0] }}
                      aria-hidden="true"
                    />
                    Visites de {conducteurNom} ce jour
                  </span>
                )}
                {jourOuvert.nbSansPosition > 0 && (
                  <span className="text-amber-700">
                    {jourOuvert.nbSansPosition} visite
                    {jourOuvert.nbSansPosition > 1 ? "s" : ""} sans adresse
                    localisable (hors carte)
                  </span>
                )}
              </p>
            </div>
          )}
          {!dossierPosition && (
            <p className="text-xs text-amber-700">
              Adresse du dossier non localisable : modifiez l&apos;adresse
              depuis la fiche dossier en choisissant une suggestion pour la voir
              sur la carte.
            </p>
          )}
        </div>
      </div>

      {/* ── Récapitulatif + forçage + soumission (sticky en desktop) ──── */}
      <aside className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-xs lg:sticky lg:top-6">
        <p className="text-sm text-neutral-800">
          Plage choisie :{" "}
          <strong className="font-semibold">
            <span className="first-letter:uppercase">{jourOuvert.label}</span>,{" "}
            {minutesVersLabel(plage.deMin)} – {minutesVersLabel(plage.aMin)}
          </strong>{" "}
          ({amplitudeLabel(amplitude)}) avec {conducteurNom}.
        </p>

        {jourOuvert.avantSechage && (
          <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <Droplets className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Cette plage précède la fin du délai de séchage conseillé — le taux
            d&apos;humidité risque d&apos;être encore élevé.
          </p>
        )}

        {jourOuvert.proximite === "proche" && (
          <p className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            <Navigation className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {jourOuvert.proximiteDetail} — bon jour pour regrouper les visites.
          </p>
        )}
        {jourOuvert.proximite === "loin" && (
          <p className="flex items-start gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
            <Navigation className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {jourOuvert.proximiteDetail} — à éviter si un autre jour convient.
          </p>
        )}

        {tousAvertissements.length > 0 && (
          <div
            role="alert"
            className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5"
          >
            <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              À vérifier avant de planifier :
            </p>
            <ul className="list-inside list-disc space-y-0.5 text-sm text-amber-900">
              {tousAvertissements.map((raison) => (
                <li key={raison}>{raison}</li>
              ))}
            </ul>
            <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm font-medium text-amber-950">
              <input
                type="checkbox"
                name="forcer"
                value="1"
                checked={forcer}
                onChange={(e) => setForcer(e.target.checked)}
                className="size-4 accent-primary-600"
              />
              Planifier quand même
            </label>
          </div>
        )}

        {state.error && (
          <p role="alert" className="text-sm text-red-700">
            {state.error}
          </p>
        )}

        <Button
          type="submit"
          disabled={pending || !isoDe || amplitude <= 0 || (doitForcer && !forcer)}
          className="w-full"
        >
          {pending
            ? "Planification…"
            : visiteId
              ? "Replanifier la visite"
              : "Planifier la visite"}
        </Button>
      </aside>
    </form>
  );
}

// Pill d'un jour : libellé court + nb de visites déjà posées (point) + goutte
// ambre si le jour précède la fin du séchage conseillé.
function PillJour({
  jour,
  ouvert,
  onOuvrir,
}: {
  jour: JourSerialise;
  ouvert: boolean;
  onOuvrir: () => void;
}) {
  const nb = jour.visitesTimeline.length;
  return (
    <button
      type="button"
      aria-pressed={ouvert}
      onClick={onOuvrir}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 transition-colors",
        ouvert
          ? "border-primary-600 bg-primary-50"
          : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50",
      )}
    >
      <span
        className={cn(
          "text-xs font-medium whitespace-nowrap first-letter:uppercase",
          ouvert ? "text-primary-900" : "text-neutral-800",
        )}
      >
        {jour.labelCourt}
      </span>
      <span className="flex items-center gap-1 text-[11px] leading-none tabular-nums">
        {jour.enAbsence ? (
          <span className="text-amber-600" aria-label="Conducteur absent">
            absent
          </span>
        ) : nb > 0 ? (
          <>
            <span
              className="size-1.5 rounded-full bg-sky-500"
              aria-hidden="true"
            />
            <span className="text-neutral-600">{nb}</span>
            <span className="sr-only">visite{nb > 1 ? "s" : ""} ce jour</span>
          </>
        ) : (
          <span className="text-neutral-400" aria-label="Aucune visite">
            —
          </span>
        )}
        {jour.avantSechage && (
          <Droplets
            className="size-3 text-amber-500"
            aria-label="Avant la fin du séchage conseillé"
          />
        )}
        {jour.proximite && (
          <Navigation
            className={cn(
              "size-3",
              jour.proximite === "proche" ? "text-sky-500" : "text-indigo-500",
            )}
            aria-label={jour.proximiteDetail ?? undefined}
          />
        )}
      </span>
    </button>
  );
}

// ── Sélecteur de plage : frise interactive + raccourcis + boutons ± ─────────
// La sélection EST l'aperçu : la plage candidate se dessine sur la journée, au
// milieu des visites déjà posées. Trois façons de la régler, toutes tactiles :
// glisser les poignées, toucher la frise, les boutons ± (30 min), ou un
// raccourci (Matin/Après-midi/Journée). Tout s'aligne sur la grille des marques
// (30 min) pour que le début porte toujours son ISO serveur.
function SelecteurPlage({
  jour,
  bornes,
  plage,
  onChange,
}: {
  jour: JourSerialise;
  bornes: Bornes;
  plage: Plage;
  onChange: (p: Plage) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<null | "de" | "a">(null);

  const grille = jour.marques.map((m) => m.minutes); // croissant, finMin inclus
  const total = bornes.finMin - bornes.debutMin;

  const pct = (min: number) =>
    total > 0
      ? ((Math.min(Math.max(min, bornes.debutMin), bornes.finMin) - bornes.debutMin) /
          total) *
        100
      : 0;

  const idxDe = grille.indexOf(plage.deMin);
  const idxA = grille.indexOf(plage.aMin);

  // Applique une position (brute) à un bord, alignée sur la grille + écart mini.
  function appliquer(bord: "de" | "a", brut: number) {
    const cible = marqueLaPlusProche(grille, brut);
    if (bord === "de") {
      const maxIdx = idxA - 1; // au moins une marque avant À
      const i = Math.min(grille.indexOf(cible), Math.max(0, maxIdx));
      onChange({ deMin: grille[i], aMin: plage.aMin });
    } else {
      const minIdx = idxDe + 1; // au moins une marque après De
      const i = Math.max(grille.indexOf(cible), Math.min(minIdx, grille.length - 1));
      onChange({ deMin: plage.deMin, aMin: grille[i] });
    }
  }

  function minuteAt(clientX: number): number {
    const el = trackRef.current;
    if (!el) return plage.deMin;
    const rect = el.getBoundingClientRect();
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return bornes.debutMin + ratio * total;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const min = minuteAt(e.clientX);
    // Bord le plus proche du point touché — c'est lui qu'on déplace.
    const bord =
      Math.abs(min - plage.deMin) <= Math.abs(min - plage.aMin) ? "de" : "a";
    dragRef.current = bord;
    e.currentTarget.setPointerCapture(e.pointerId);
    appliquer(bord, min);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    appliquer(dragRef.current, minuteAt(e.clientX));
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  // Traits d'heure pleine.
  const heures: number[] = [];
  for (let m = Math.ceil(bornes.debutMin / 60) * 60; m <= bornes.finMin; m += 60) {
    heures.push(m);
  }

  const leftPct = pct(plage.deMin);
  const widthPct = Math.max(pct(plage.aMin) - leftPct, 1);

  return (
    <div className="space-y-3">
      {/* Raccourcis calés sur les plages travaillées → jamais hors horaires. */}
      {jour.plagesTravaillees.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {jour.plagesTravaillees.map((p, i) => {
            const cible = normaliserPlage(grille, p.debutMin, p.finMin);
            const actif = plage.deMin === cible.deMin && plage.aMin === cible.aMin;
            return (
              <button
                key={i}
                type="button"
                aria-pressed={actif}
                onClick={() => onChange(cible)}
                className={cn(
                  "cursor-pointer rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors tabular-nums",
                  actif
                    ? "border-primary-600 bg-primary-50 text-primary-900"
                    : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50",
                )}
              >
                {nomPlage(p, jour.plagesTravaillees.length)} ·{" "}
                {minutesVersLabel(p.debutMin)} – {minutesVersLabel(p.finMin)}
              </button>
            );
          })}
        </div>
      )}

      {/* Gros affichage De → À + boutons ± (précision au doigt). */}
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2.5 sm:gap-3">
        <ChampHeure
          label="De"
          valeur={plage.deMin}
          moinsOff={idxDe <= 0}
          plusOff={idxDe + 1 >= idxA}
          onMoins={() => onChange({ deMin: grille[idxDe - 1], aMin: plage.aMin })}
          onPlus={() => onChange({ deMin: grille[idxDe + 1], aMin: plage.aMin })}
        />
        <span className="text-neutral-300" aria-hidden="true">
          →
        </span>
        <ChampHeure
          label="À"
          valeur={plage.aMin}
          moinsOff={idxA - 1 <= idxDe}
          plusOff={idxA >= grille.length - 1}
          onMoins={() => onChange({ deMin: plage.deMin, aMin: grille[idxA - 1] })}
          onPlus={() => onChange({ deMin: plage.deMin, aMin: grille[idxA + 1] })}
        />
        <span className="rounded-full bg-primary-100 px-2.5 py-1 text-sm font-semibold text-primary-900 tabular-nums">
          {amplitudeLabel(plage.aMin - plage.deMin)}
        </span>
      </div>

      {/* Frise interactive : glisser / toucher pour régler la plage. */}
      <div>
        <div
          ref={trackRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="group"
          aria-label="Frise de la journée — glissez pour régler la plage"
          className="relative h-20 cursor-ew-resize touch-none select-none overflow-hidden rounded-md border border-neutral-200 bg-neutral-100"
        >
          {/* Plages travaillées en clair (le reste = grisé du fond). */}
          {jour.plagesTravaillees.map((p, i) => (
            <div
              key={`p${i}`}
              className="absolute inset-y-0 bg-white"
              style={{ left: `${pct(p.debutMin)}%`, width: `${pct(p.finMin) - pct(p.debutMin)}%` }}
            />
          ))}
          {/* Traits d'heures + libellés. */}
          {heures.map((m) => (
            <div
              key={`h${m}`}
              aria-hidden="true"
              className="absolute inset-y-0 border-l border-neutral-200/70"
              style={{ left: `${pct(m)}%` }}
            >
              <span className="absolute top-0.5 left-0.5 text-[9px] text-neutral-400 tabular-nums">
                {minutesVersLabel(m)}
              </span>
            </div>
          ))}
          {/* Plage candidate surlignée (sous les visites) + poignées. */}
          <div
            className="absolute inset-y-0 z-0 bg-primary-300/50"
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            aria-hidden="true"
          />
          {/* Visites déjà posées (au-dessus de la plage). */}
          {jour.visitesTimeline.map((v, i) => (
            <div
              key={`v${i}`}
              title={`${v.nomClient} · ${v.heureLabel}`}
              className="absolute top-6 bottom-1 z-10 flex items-center overflow-hidden rounded bg-sky-500/85 px-1"
              style={{ left: `${pct(v.debutMin)}%`, width: `${Math.max(pct(v.finMin) - pct(v.debutMin), 2)}%` }}
            >
              <span className="truncate text-[10px] font-medium text-white">
                {v.nomClient}
              </span>
            </div>
          ))}
          {/* Poignées de la plage (au-dessus de tout, bien visibles). */}
          <Poignee position={leftPct} />
          <Poignee position={leftPct + widthPct} />
        </div>
        <p className="mt-1 text-center text-[11px] text-neutral-400">
          Glissez les poignées ou touchez la frise ; les blocs bleus sont les
          visites déjà posées.
        </p>
      </div>
    </div>
  );
}

// Poignée verticale d'un bord de la plage (repère visuel — toute la frise est
// interactive, la poignée guide le doigt vers le bord).
function Poignee({ position }: { position: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute top-0 bottom-0 z-20 flex w-0 items-center justify-center"
      style={{ left: `${position}%` }}
    >
      <span className="h-10 w-1.5 rounded-full border border-white/70 bg-primary-600 shadow-md" />
    </span>
  );
}

// Champ heure avec boutons − / + (pas de 30 min), grande cible tactile.
function ChampHeure({
  label,
  valeur,
  moinsOff,
  plusOff,
  onMoins,
  onPlus,
}: {
  label: string;
  valeur: number;
  moinsOff: boolean;
  plusOff: boolean;
  onMoins: () => void;
  onPlus: () => void;
}) {
  const btn =
    "flex size-9 shrink-0 items-center justify-center text-neutral-600 transition-colors hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-30";
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <div className="flex items-center rounded-md border border-neutral-300 bg-white shadow-xs">
        <button
          type="button"
          aria-label={`${label} : reculer de 30 minutes`}
          disabled={moinsOff}
          onClick={onMoins}
          className={cn(btn, "rounded-l-md")}
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>
        <span className="min-w-14 px-1 text-center font-display text-base font-bold text-neutral-900 tabular-nums">
          {minutesVersLabel(valeur)}
        </span>
        <button
          type="button"
          aria-label={`${label} : avancer de 30 minutes`}
          disabled={plusOff}
          onClick={onPlus}
          className={cn(btn, "rounded-r-md")}
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
