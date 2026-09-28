import type { Metadata } from "next";
import Link from "next/link";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  FUSEAU,
  ajouterJoursLocal,
  dateVersParamJour,
  debutJourLocal,
  debutSemaineLocal,
  decalerMois,
  fenetreJour,
  fenetreMois,
  fenetreSemaine,
  horairesDefinis,
  instantLocal,
  minutesVersLabel,
  parseParamJour,
  plagesDuJour,
  type Fenetre,
  type PlageMinutes,
} from "@/lib/planning";
import { chargerContextes, type ContexteCharge } from "@/lib/planning-data";
import { classerProximite, distanceMinKm, type Proximite } from "@/lib/geo";
import { formatJourLongFr } from "@/lib/format";
import { boutonClasses } from "@/components/ui/button";
import {
  CarteVisites,
  COULEURS_CARTE,
  type PointCarte,
} from "@/components/carte-visites";
import { EmptyState } from "@/components/ui/empty-state";
import { PrintButton } from "@/components/ui/print-button";
import { ContenuFiltrable, ZoneFiltres } from "@/components/ui/zone-filtres";
import { cn } from "@/lib/ui";
import { FiltresPlanning } from "./filtres";
import { Grille, type BlocSerialise, type ColonneSerialisee } from "./grille";
import { GrilleMois, type JourMois } from "./mois";

type VuePlanning = "mois" | "semaine" | "jour";

// En-tête de colonne « lun. 6 juil. »
const jourCourtFr = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: FUSEAU,
});
// « 6 juillet 2026 » (titre de période)
const jourTitreFr = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: FUSEAU,
});
// « juillet 2026 » (titre de la vue mois)
const moisTitreFr = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
  timeZone: FUSEAU,
});

// Chevauchements décalés horizontalement (calcul serveur) : attribution
// gloutonne d'une « lane » par bloc, puis largeur = nb de lanes du groupe
// d'intersection (cluster).
function poserLanes<T extends { debutMin: number; finMin: number }>(
  blocs: T[],
): (T & { lane: number; lanes: number })[] {
  const tries = [...blocs].sort(
    (a, b) => a.debutMin - b.debutMin || a.finMin - b.finMin,
  );
  const finsParLane: number[] = [];
  const poses = tries.map((b) => {
    let lane = finsParLane.findIndex((fin) => fin <= b.debutMin);
    if (lane === -1) {
      lane = finsParLane.length;
      finsParLane.push(0);
    }
    finsParLane[lane] = b.finMin;
    return { ...b, lane, lanes: 1 };
  });

  let debutCluster = 0;
  let finCluster = poses[0]?.finMin ?? 0;
  for (let i = 1; i <= poses.length; i++) {
    const bloc = poses[i];
    if (!bloc || bloc.debutMin >= finCluster) {
      const lanes =
        Math.max(...poses.slice(debutCluster, i).map((p) => p.lane)) + 1;
      for (let k = debutCluster; k < i; k++) poses[k].lanes = lanes;
      if (bloc) {
        debutCluster = i;
        finCluster = bloc.finMin;
      }
    } else {
      finCluster = Math.max(finCluster, bloc.finMin);
    }
  }
  return poses;
}

// Zones grisées d'un jour : absence pleine journée, sinon complément des
// plages travaillées dans les bornes d'affichage.
function zonesDuJour(
  ctx: ContexteCharge,
  jour: Date,
  bornes: PlageMinutes,
): ColonneSerialisee["zones"] {
  const enAbsence = ctx.absences.find(
    (a) =>
      jour.getTime() >= debutJourLocal(a.dateDebut).getTime() &&
      jour.getTime() <= debutJourLocal(a.dateFin).getTime(),
  );
  if (enAbsence) {
    return [
      {
        top: 0,
        hauteur: bornes.heureFin - bornes.heureDebut,
        genre: "absence",
        label: enAbsence.motif ?? "Absent",
      },
    ];
  }

  const plages = plagesDuJour(ctx, instantLocal(jour).jourSemaine);
  const zones: ColonneSerialisee["zones"] = [];
  let curseur = bornes.heureDebut;
  for (const p of [...plages].sort((a, b) => a.heureDebut - b.heureDebut)) {
    if (p.heureDebut > curseur) {
      zones.push({
        top: curseur - bornes.heureDebut,
        hauteur: Math.min(p.heureDebut, bornes.heureFin) - curseur,
        genre: "indispo",
        label: null,
      });
    }
    curseur = Math.max(curseur, p.heureFin);
    if (curseur >= bornes.heureFin) break;
  }
  if (curseur < bornes.heureFin) {
    zones.push({
      top: curseur - bornes.heureDebut,
      hauteur: bornes.heureFin - curseur,
      genre: "indispo",
      label: null,
    });
  }
  return zones.filter((z) => z.hauteur > 0);
}

// Proximité de chaque visite d'un conducteur vis-à-vis des AUTRES visites de
// ce même conducteur dans la fenêtre chargée (un jour en vue « jour », toute
// la semaine affichée en vue « semaine » — la fenêtre est déjà la bonne,
// posée par la page). Distance à vol d'oiseau uniquement, jamais un ordre de
// tournée : cf. lib/geo.ts.
function calculerProximites(
  contextes: Map<string, ContexteCharge>,
  conducteurIds: readonly string[],
): Map<string, { proximite: Proximite; distanceKm: number | null }> {
  const resultat = new Map<
    string,
    { proximite: Proximite; distanceKm: number | null }
  >();
  for (const conducteurId of conducteurIds) {
    const visites = contextes.get(conducteurId)?.visites ?? [];
    for (const v of visites) {
      const cible =
        v.latitude !== null && v.longitude !== null
          ? { latitude: v.latitude, longitude: v.longitude }
          : null;
      const autres = visites
        .filter((autre) => autre.id !== v.id)
        .map((autre) =>
          autre.latitude !== null && autre.longitude !== null
            ? { latitude: autre.latitude, longitude: autre.longitude }
            : null,
        );
      const distance = distanceMinKm(cible, autres);
      resultat.set(v.id, {
        proximite: distance !== null ? classerProximite(distance) : null,
        distanceKm: distance,
      });
    }
  }
  return resultat;
}

// Blocs d'une colonne (visites d'un jour, éventuellement multi-conducteurs),
// clampés aux bornes d'affichage.
function blocsDuJour(
  visites: ContexteCharge["visites"],
  conducteurNoms: Map<string, string>,
  jour: Date,
  bornes: PlageMinutes,
  afficherConducteur: boolean,
  proximites: Map<string, { proximite: Proximite; distanceKm: number | null }>,
): { blocs: BlocSerialise[]; horsBornes: number } {
  const jourSuivant = ajouterJoursLocal(jour, 1);
  const duJour = visites.filter(
    (v) =>
      v.debut.getTime() >= jour.getTime() &&
      v.debut.getTime() < jourSuivant.getTime(),
  );

  let horsBornes = 0;
  const bruts: (Omit<BlocSerialise, "lane" | "lanes"> & {
    debutMin: number;
    finMin: number;
  })[] = [];

  for (const v of duJour) {
    const minutesDebut = instantLocal(v.debut).minutes;
    const minutesFin = minutesDebut + v.dureeMinutes;
    const top = Math.max(minutesDebut, bornes.heureDebut);
    const bas = Math.min(minutesFin, bornes.heureFin);
    if (bas <= top) {
      // Visite héritée entièrement hors bornes : signalée, pas dessinée.
      horsBornes++;
      continue;
    }
    bruts.push({
      debutMin: top,
      finMin: bas,
      visiteId: v.id,
      dossierId: v.dossierId,
      nomClient: v.nomClient,
      adresse: v.adresse,
      numero: v.numero,
      conducteurNom: afficherConducteur
        ? (conducteurNoms.get(v.conducteurId) ?? "?")
        : null,
      conducteurNomComplet: conducteurNoms.get(v.conducteurId) ?? "?",
      heureLabel: `${minutesVersLabel(minutesDebut)} – ${minutesVersLabel(minutesFin)}`,
      dateLabel: formatJourLongFr(v.debut),
      dureeMinutes: v.dureeMinutes,
      top: top - bornes.heureDebut,
      hauteur: bas - top,
      clampHaut: minutesDebut < bornes.heureDebut,
      clampBas: minutesFin > bornes.heureFin,
      proximite: proximites.get(v.id)?.proximite ?? null,
      distanceProximiteKm: proximites.get(v.id)?.distanceKm ?? null,
    });
  }

  const poses: BlocSerialise[] = poserLanes(bruts).map((b) => ({
    visiteId: b.visiteId,
    dossierId: b.dossierId,
    nomClient: b.nomClient,
    adresse: b.adresse,
    numero: b.numero,
    conducteurNom: b.conducteurNom,
    conducteurNomComplet: b.conducteurNomComplet,
    heureLabel: b.heureLabel,
    dateLabel: b.dateLabel,
    dureeMinutes: b.dureeMinutes,
    top: b.top,
    hauteur: b.hauteur,
    clampHaut: b.clampHaut,
    clampBas: b.clampBas,
    lane: b.lane,
    lanes: b.lanes,
    proximite: b.proximite,
    distanceProximiteKm: b.distanceProximiteKm,
  }));
  return { blocs: poses, horsBornes };
}

export const metadata: Metadata = { title: "Planning" };

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; vue?: string; conducteur?: string }>;
}) {
  const user = await requireRole(BACK_OFFICE_ROLES);
  const params = await searchParams;

  const vue: VuePlanning =
    params.vue === "jour" ? "jour" : params.vue === "mois" ? "mois" : "semaine";
  const maintenant = new Date();
  const dateRef = parseParamJour(params.date) ?? debutJourLocal(maintenant);

  const [org, conducteurs] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({
      where: { id: user.organisationId },
      select: { nom: true, heureOuverture: true, heureFermeture: true },
    }),
    prisma.user.findMany({
      where: { organisationId: user.organisationId, role: "CONDUCTEUR" },
      orderBy: { nom: "asc" },
      select: { id: true, nom: true },
    }),
  ]);

  if (conducteurs.length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold tracking-tight">Planning</h1>
        <EmptyState
          titre="Aucun conducteur"
          description="Le planning affiche l'agenda des conducteurs. Autorisez un conducteur dans Paramètres → Utilisateurs, puis revenez."
          action={
            <Link
              href="/app/parametres/utilisateurs"
              className={boutonClasses("secondaire")}
            >
              Ouvrir les paramètres
            </Link>
          }
        />
      </div>
    );
  }

  const conducteurFiltre =
    conducteurs.find((c) => c.id === params.conducteur) ?? null;
  const conducteursVisibles = conducteurFiltre ? [conducteurFiltre] : conducteurs;
  const conducteurNoms = new Map(conducteurs.map((c) => [c.id, c.nom]));

  // Vue mois : la fenêtre chargée couvre la GRILLE calendaire (semaines
  // complètes lun→dim), les jours des mois adjacents apparaissant estompés.
  const fenetreMoisCourant = vue === "mois" ? fenetreMois(dateRef) : null;
  const fenetre: Fenetre =
    vue === "semaine"
      ? fenetreSemaine(dateRef)
      : vue === "jour"
        ? fenetreJour(dateRef)
        : {
            debut: debutSemaineLocal(fenetreMoisCourant!.debut),
            fin: fenetreSemaine(ajouterJoursLocal(fenetreMoisCourant!.fin, -1))
              .fin,
          };
  const bornes: PlageMinutes = {
    heureDebut: org.heureOuverture,
    heureFin: org.heureFermeture,
  };

  const contextes = await chargerContextes(prisma, user.organisationId, fenetre, {
    conducteurIds: conducteursVisibles.map((c) => c.id),
    ouvertureOrg: bornes,
  });

  const cleAujourdhui = dateVersParamJour(maintenant);
  const minutesMaintenant = instantLocal(maintenant).minutes;

  // Fenêtre déjà correcte par vue (un jour / la semaine affichée) : comparer
  // chaque visite aux autres visites du MÊME conducteur dans `contextes`
  // suffit, pas besoin de requête supplémentaire.
  const proximites =
    vue === "mois"
      ? new Map<string, { proximite: Proximite; distanceKm: number | null }>()
      : calculerProximites(
          contextes,
          conducteursVisibles.map((c) => c.id),
        );

  let colonnes: ColonneSerialisee[] = [];
  const semainesMois: JourMois[][] = [];
  if (vue === "mois") {
    // Grille calendaire : un jour = une cellule, chips triées par heure. Le
    // nom du conducteur n'est peint que quand « tous » sont affichés.
    const visites = conducteursVisibles.flatMap(
      (c) => contextes.get(c.id)?.visites ?? [],
    );
    const moisRef = instantLocal(fenetreMoisCourant!.debut).mois;
    const jours: JourMois[] = [];
    for (
      let d = fenetre.debut;
      d.getTime() < fenetre.fin.getTime();
      d = ajouterJoursLocal(d, 1)
    ) {
      const lendemain = ajouterJoursLocal(d, 1);
      const local = instantLocal(d);
      const duJour = visites
        .filter(
          (v) =>
            v.debut.getTime() >= d.getTime() &&
            v.debut.getTime() < lendemain.getTime(),
        )
        .sort((a, b) => a.debut.getTime() - b.debut.getTime());
      jours.push({
        cle: dateVersParamJour(d),
        numero: local.jour,
        horsMois: local.mois !== moisRef,
        aujourdhui: dateVersParamJour(d) === cleAujourdhui,
        weekend: local.jourSemaine >= 6,
        chips: duJour.map((v) => ({
          visiteId: v.id,
          dossierId: v.dossierId,
          heureLabel: minutesVersLabel(instantLocal(v.debut).minutes),
          nomClient: v.nomClient,
          conducteurNom:
            conducteurFiltre === null
              ? (conducteurNoms.get(v.conducteurId) ?? "?")
              : null,
        })),
      });
    }
    for (let i = 0; i < jours.length; i += 7) {
      semainesMois.push(jours.slice(i, i + 7));
    }
  } else if (vue === "semaine") {
    // Colonnes = jours. Indispos grisées seulement quand UN conducteur est
    // filtré (sinon illisible) ; les blocs portent le nom du conducteur
    // quand tous sont affichés.
    const visites = conducteursVisibles.flatMap(
      (c) => contextes.get(c.id)?.visites ?? [],
    );
    colonnes = Array.from({ length: 7 }, (_, i) => {
      const jourDate = ajouterJoursLocal(fenetre.debut, i);
      const { blocs, horsBornes } = blocsDuJour(
        visites,
        conducteurNoms,
        jourDate,
        bornes,
        conducteurFiltre === null,
        proximites,
      );
      return {
        cle: dateVersParamJour(jourDate),
        titre: jourCourtFr.format(jourDate),
        sousTitre: null,
        aujourdhui: dateVersParamJour(jourDate) === cleAujourdhui,
        weekend: instantLocal(jourDate).jourSemaine >= 6,
        zones: conducteurFiltre
          ? zonesDuJour(contextes.get(conducteurFiltre.id)!, jourDate, bornes)
          : [],
        blocs,
        horsBornes,
      };
    });
  } else {
    // Colonnes = conducteurs (vue dispatch du jour) : indispos toujours.
    colonnes = conducteursVisibles.map((c) => {
      const ctx = contextes.get(c.id)!;
      const { blocs, horsBornes } = blocsDuJour(
        ctx.visites,
        conducteurNoms,
        fenetre.debut,
        bornes,
        false,
        proximites,
      );
      return {
        cle: c.id,
        titre: c.nom,
        sousTitre: horairesDefinis(ctx) ? null : "Horaires non définis",
        aujourdhui: dateVersParamJour(fenetre.debut) === cleAujourdhui,
        weekend: false,
        zones: zonesDuJour(ctx, fenetre.debut, bornes),
        blocs,
        horsBornes,
      };
    });
  }

  // Carte du jour (vue « jour ») : la tournée réelle de chaque conducteur,
  // couleur par conducteur — contrôle géographique d'un coup d'œil, sans
  // vérifier les adresses une à une.
  let carteJour: CarteJour | null = null;
  if (vue === "jour") {
    const jourSuivant = ajouterJoursLocal(fenetre.debut, 1);
    const points: PointCarte[] = [];
    const legende: { nom: string; couleur: string }[] = [];
    let sansPosition = 0;
    conducteursVisibles.forEach((c, i) => {
      const couleur = COULEURS_CARTE[i % COULEURS_CARTE.length];
      const duJour = (contextes.get(c.id)?.visites ?? []).filter(
        (v) =>
          v.debut.getTime() >= fenetre.debut.getTime() &&
          v.debut.getTime() < jourSuivant.getTime(),
      );
      let localisees = 0;
      for (const v of duJour) {
        if (v.latitude !== null && v.longitude !== null) {
          points.push({
            latitude: v.latitude,
            longitude: v.longitude,
            label: `${minutesVersLabel(instantLocal(v.debut).minutes)} · ${v.nomClient} · ${c.nom}`,
            couleur,
          });
          localisees++;
        } else {
          sansPosition++;
        }
      }
      if (localisees > 0) legende.push({ nom: c.nom, couleur });
    });
    carteJour = { points, legende, sansPosition };
  }

  // Navigation précédent/suivant : ±1 mois civil, ±7 jours en semaine, ±1 en jour.
  const datePrecedente =
    vue === "mois"
      ? decalerMois(dateRef, -1)
      : ajouterJoursLocal(dateRef, vue === "semaine" ? -7 : -1);
  const dateSuivante =
    vue === "mois"
      ? decalerMois(dateRef, 1)
      : ajouterJoursLocal(dateRef, vue === "semaine" ? 7 : 1);

  const titreMois = fenetreMoisCourant
    ? moisTitreFr.format(fenetreMoisCourant.debut)
    : "";
  const titrePeriode =
    vue === "mois"
      ? titreMois.charAt(0).toUpperCase() + titreMois.slice(1)
      : vue === "semaine"
        ? `Semaine du ${jourTitreFr.format(fenetre.debut)}`
        : formatJourLongFr(fenetre.debut);

  // Compteur : sur le MOIS civil (pas la grille élargie aux semaines pleines).
  const nbVisites =
    vue === "mois"
      ? conducteursVisibles
          .flatMap((c) => contextes.get(c.id)?.visites ?? [])
          .filter(
            (v) =>
              v.debut.getTime() >= fenetreMoisCourant!.debut.getTime() &&
              v.debut.getTime() < fenetreMoisCourant!.fin.getTime(),
          ).length
      : colonnes.reduce((n, c) => n + c.blocs.length + c.horsBornes, 0);

  return (
    // Vues semaine/jour : page à hauteur viewport (100dvh − py-6 du main),
    // seul le conteneur de la grille scrolle — plus de scrollbar parasite.
    // Vue mois : hauteur naturelle (grille calendaire compacte, scroll page).
    // ZoneFiltres : les contrôles (FiltresPlanning) estompent la grille
    // pendant le re-render serveur (transition partagée, aucun DOM ajouté).
    <ZoneFiltres>
    <div
      className={cn(
        "flex flex-col gap-4 print:h-auto",
        vue !== "mois" && "lg:h-[calc(100dvh-3rem)]",
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          {/* En-tête d'impression : l'org remplace la nav masquée du shell. */}
          <p className="hidden text-sm font-medium text-neutral-600 print:block">
            {org.nom}
          </p>
          <h1 className="text-xl font-bold tracking-tight">Planning</h1>
          <p className="text-sm text-neutral-500 print:text-black">
            {titrePeriode} · {nbVisites} visite{nbVisites > 1 ? "s" : ""}
            {conducteurFiltre && ` · ${conducteurFiltre.nom}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <PrintButton label="Imprimer / PDF" variante="secondaire" />
          <FiltresPlanning
            vue={vue}
            dateCourante={dateVersParamJour(dateRef)}
            conducteurId={conducteurFiltre?.id ?? ""}
            conducteurs={conducteurs}
            datePrecedente={dateVersParamJour(datePrecedente)}
            dateSuivante={dateVersParamJour(dateSuivante)}
          />
        </div>
      </div>

      {vue === "mois" ? (
        <ContenuFiltrable>
          <GrilleMois
            semaines={semainesMois}
            conducteurParam={conducteurFiltre?.id ?? ""}
          />
        </ContenuFiltrable>
      ) : (
        <ContenuFiltrable
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-4",
            vue === "jour" && "lg:flex-row",
          )}
        >
          <Grille
            colonnes={colonnes}
            bornes={bornes}
            minuteMaintenant={
              minutesMaintenant >= bornes.heureDebut &&
              minutesMaintenant <= bornes.heureFin
                ? minutesMaintenant - bornes.heureDebut
                : null
            }
          />
          {vue === "jour" && (
            <AgendaJour colonnes={colonnes} carte={carteJour} />
          )}
        </ContenuFiltrable>
      )}

      {conducteurFiltre === null && vue === "semaine" && (
        <p className="shrink-0 text-xs text-neutral-500 print:hidden">
          Filtrez par conducteur pour voir ses disponibilités (zones grisées).
        </p>
      )}
    </div>
    </ZoneFiltres>
  );
}

/* ── Agenda du jour (panneau latéral de la vue jour) ────────────────── */

// « 3 h 30 » — durée cumulée (pas une heure de la journée).
function dureeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

type CarteJour = {
  points: PointCarte[];
  legende: { nom: string; couleur: string }[];
  sansPosition: number;
};

// Liste chronologique des visites du jour : la grille horaire montre QUAND,
// ce panneau montre QUOI (clients, adresses) et OÙ (carte de la tournée)
// sans devoir survoler les blocs.
function AgendaJour({
  colonnes,
  carte,
}: {
  colonnes: ColonneSerialisee[];
  carte: CarteJour | null;
}) {
  const visites = colonnes
    .flatMap((c) => c.blocs)
    .sort((a, b) => a.top - b.top || a.nomClient.localeCompare(b.nomClient));
  const horsBornes = colonnes.reduce((n, c) => n + c.horsBornes, 0);
  const minutesOccupees = visites.reduce((n, b) => n + b.dureeMinutes, 0);

  return (
    <aside
      aria-label="Agenda du jour"
      className="scrollbar-fin shrink-0 overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-xs lg:w-72 print:hidden"
    >
      <div className="sticky top-0 z-10 border-b border-neutral-100 bg-white px-4 py-3">
        <h2 className="font-display text-sm font-medium text-neutral-900">
          Agenda du jour
        </h2>
        <p className="text-xs text-neutral-500 tabular-nums">
          {visites.length + horsBornes} visite
          {visites.length + horsBornes > 1 ? "s" : ""}
          {minutesOccupees > 0 && ` · ${dureeLabel(minutesOccupees)} occupées`}
        </p>
      </div>

      {carte && carte.points.length > 0 && (
        <div className="space-y-1.5 border-b border-neutral-100 px-4 py-3">
          <CarteVisites points={carte.points} className="h-48" />
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
            {carte.legende.map((c) => (
              <span key={c.nom} className="inline-flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: c.couleur }}
                  aria-hidden="true"
                />
                {c.nom}
              </span>
            ))}
            {carte.sansPosition > 0 && (
              <span className="text-amber-700">
                {carte.sansPosition} visite
                {carte.sansPosition > 1 ? "s" : ""} sans adresse localisable
              </span>
            )}
          </p>
        </div>
      )}

      {visites.length === 0 ? (
        <div className="space-y-2 px-4 py-5">
          <p className="text-sm text-neutral-500">Aucune visite ce jour.</p>
          <Link
            href="/app/dossiers?statut=EN_ATTENTE_HUMIDITE"
            className="text-sm font-medium text-primary-800 hover:underline"
          >
            Voir les dossiers en attente de contre-visite
          </Link>
        </div>
      ) : (
        <ol>
          {visites.map((v) => (
            <li key={v.visiteId} className="border-b border-neutral-100 last:border-b-0">
              <Link
                href={`/app/dossiers/${v.dossierId}`}
                className="block px-4 py-2.5 transition-colors hover:bg-neutral-50"
              >
                <p className="text-xs font-medium text-neutral-500 tabular-nums">
                  {v.heureLabel} · {v.conducteurNomComplet}
                </p>
                <p className="truncate text-sm font-medium text-neutral-900">
                  {v.nomClient}
                </p>
                <p className="truncate text-xs text-neutral-500">{v.adresse}</p>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
