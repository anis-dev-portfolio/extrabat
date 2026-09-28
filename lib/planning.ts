// Logique planning PURE (zéro import Prisma, zéro I/O) — partagée par les
// server actions (juge final, re-vérification en transaction) et l'UI
// (avertissements). Tout le travail jour/semaine passe par les helpers fuseau
// ci-dessous : getDay()/setHours()/new Date("YYYY-MM-DDTHH:mm") côté serveur
// utiliseraient le fuseau du SERVEUR (UTC sur Vercel) et sont interdits.

export const FUSEAU = "Europe/Paris";

// Minutes dans un jour (les heures sont stockées en minutes depuis minuit :
// 480 = 8h00 — évite les pièges TZ des types Time).
export const MINUTES_JOUR = 1440;

// Libellés des jours, convention ISO : 1 = lundi … 7 = dimanche.
export const JOURS_SEMAINE: readonly { jour: number; label: string }[] = [
  { jour: 1, label: "Lundi" },
  { jour: 2, label: "Mardi" },
  { jour: 3, label: "Mercredi" },
  { jour: 4, label: "Jeudi" },
  { jour: 5, label: "Vendredi" },
  { jour: 6, label: "Samedi" },
  { jour: 7, label: "Dimanche" },
];

export const JOUR_SEMAINE_LABELS: Record<number, string> = Object.fromEntries(
  JOURS_SEMAINE.map(({ jour, label }) => [jour, label]),
);

// Amplitudes de plage proposées comme défaut (minutes) — pré-remplissage du
// « À » quand aucun raccourci n'est choisi. L'amplitude réelle reste libre
// (sélecteur De/À). Renommé depuis DUREES_VISITE (rendez-vous à heure fixe).
export const AMPLITUDES_PLAGE: readonly number[] = [60, 90, 120, 180, 240];

// Bornes de validation serveur de l'amplitude d'une plage (minutes) — partagées
// par parseCreneau (submit, app/app/dossiers/actions.ts). MAX = une journée :
// une plage « Journée » couvre l'amplitude d'ouverture de l'org, que les
// paramètres autorisent jusqu'à 24 h (l'ancien plafond de 12 h refusait la
// « Journée » d'une org ouverte 7h–20h) ; parseCreneau vérifie en plus que la
// plage finit le jour même. MIN bas (15) : une visite legacy à replanifier
// reste acceptée.
export const DUREE_VISITE_MIN = 15;
export const DUREE_VISITE_MAX = MINUTES_JOUR;

// Largeur de la fenêtre du sélecteur de planification (jours par écran
// d'agenda) — partagée par la page, la lecture des créneaux (Server Action)
// et la navigation ±14 j côté client.
export const JOURS_FENETRE_PLANIFICATION = 14;

// ── Fuseau ──────────────────────────────────────────────────────────────────

export type InstantLocal = {
  annee: number;
  mois: number; // 1–12
  jour: number; // 1–31
  jourSemaine: number; // ISO : 1 (lundi) … 7 (dimanche)
  minutes: number; // minutes depuis minuit local
};

// Formatter caché module-level (Intl.DateTimeFormat est coûteux à construire).
const partiesParis = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// Décompose un instant UTC en champs civils Europe/Paris.
export function instantLocal(date: Date): InstantLocal {
  const parts: Record<string, number> = {};
  for (const { type, value } of partiesParis.formatToParts(date)) {
    if (type !== "literal") parts[type] = Number(value);
  }
  const { year, month, day, hour, minute } = parts;
  // Jour de la semaine dérivé du triplet civil (calendrier grégorien pur).
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = dim
  return {
    annee: year,
    mois: month,
    jour: day,
    jourSemaine: ((dow + 6) % 7) + 1,
    minutes: hour * 60 + minute,
  };
}

// Instant UTC correspondant à (année, mois, jour, minutes) en Europe/Paris.
// Algorithme deux passes : on part de l'interprétation UTC puis on corrige par
// l'écart observé — converge à travers les transitions d'heure d'été/hiver.
export function dateDepuisLocal(
  annee: number,
  mois: number,
  jour: number,
  minutes: number,
): Date {
  const voulu = Date.UTC(annee, mois - 1, jour, 0, minutes);
  let ts = voulu;
  for (let i = 0; i < 2; i++) {
    const local = instantLocal(new Date(ts));
    const obtenu = Date.UTC(
      local.annee,
      local.mois - 1,
      local.jour,
      0,
      local.minutes,
    );
    ts += voulu - obtenu;
  }
  return new Date(ts);
}

const DATE_JOUR_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// "2026-07-15" (input type=date) → minuit Europe/Paris de ce jour civil.
// Null si invalide. Partagé par toutes les Server Actions qui reçoivent un
// jour civil (chantiers, absences conducteurs/ouvriers).
export function parseDateJour(valeur: string): Date | null {
  const m = DATE_JOUR_RE.exec(valeur.trim());
  if (!m) return null;
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  const date = dateDepuisLocal(annee, mois, jour, 0);
  // Aller-retour : Date.UTC (dans dateDepuisLocal) NORMALISE les jours
  // inexistants (31/02 → 3 mars) — on re-décompose l'instant obtenu et on
  // exige le triplet demandé, sinon le contrat « null si invalide » est faux.
  const obtenu = instantLocal(date);
  if (obtenu.annee !== annee || obtenu.mois !== mois || obtenu.jour !== jour) {
    return null;
  }
  return date;
}

// Minuit Europe/Paris du jour civil contenant l'instant donné.
export function debutJourLocal(date: Date): Date {
  const { annee, mois, jour } = instantLocal(date);
  return dateDepuisLocal(annee, mois, jour, 0);
}

// Décale un instant de n jours CIVILS Europe/Paris en conservant l'heure
// civile (jamais `+ n*86400000` : 23/25 h aux changements d'heure).
export function ajouterJoursLocal(date: Date, n: number): Date {
  const { annee, mois, jour, minutes } = instantLocal(date);
  // Date.UTC normalise les débordements de jour (32 janvier → 1er février).
  const d = new Date(Date.UTC(annee, mois - 1, jour + n));
  return dateDepuisLocal(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    minutes,
  );
}

// ── Fenêtres d'étude (bornes en instants UTC, [debut, fin)) ────────────────

export type Fenetre = { debut: Date; fin: Date };

// Minuit Paris du lundi de la semaine ISO contenant l'instant donné.
export function debutSemaineLocal(date: Date): Date {
  const { jourSemaine } = instantLocal(date);
  return ajouterJoursLocal(debutJourLocal(date), -(jourSemaine - 1));
}

export function fenetreJour(date: Date): Fenetre {
  const debut = debutJourLocal(date);
  return { debut, fin: ajouterJoursLocal(debut, 1) };
}

export function fenetreSemaine(date: Date): Fenetre {
  const debut = debutSemaineLocal(date);
  return { debut, fin: ajouterJoursLocal(debut, 7) };
}

// Minuit Paris du 1er du mois civil contenant l'instant donné.
export function debutMoisLocal(date: Date): Date {
  const { annee, mois } = instantLocal(date);
  return dateDepuisLocal(annee, mois, 1, 0);
}

// [1er du mois, 1er du mois suivant) — Date.UTC (dans dateDepuisLocal)
// normalise le débordement de mois (13 → janvier suivant).
export function fenetreMois(date: Date): Fenetre {
  const { annee, mois } = instantLocal(date);
  return {
    debut: dateDepuisLocal(annee, mois, 1, 0),
    fin: dateDepuisLocal(annee, mois + 1, 1, 0),
  };
}

// 1er du mois décalé de n mois (navigation ±1 mois — jour calé au 1er,
// aucun débordement possible en fin de mois).
export function decalerMois(date: Date, n: number): Date {
  const { annee, mois } = instantLocal(date);
  return dateDepuisLocal(annee, mois + n, 1, 0);
}

// ── Paramètres d'URL (?date=YYYY-MM-DD) ────────────────────────────────────

// Jour civil Paris → valeur de searchParam (aussi le format des input date).
export function dateVersParamJour(date: Date): string {
  const { annee, mois, jour } = instantLocal(date);
  return `${annee}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

// "2026-07-06" → minuit Paris de ce jour civil. Null si invalide.
export function parseParamJour(valeur: string | undefined): Date | null {
  if (!valeur) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (!m) return null;
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  return dateDepuisLocal(annee, mois, jour, 0);
}

// ── Heures en minutes : parsing et libellés ────────────────────────────────

// "08:30" (input type="time") → 510. Renvoie null si invalide.
export function heureVersMinutes(valeur: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(valeur.trim());
  if (!m) return null;
  const heures = Number(m[1]);
  const minutes = Number(m[2]);
  if (heures > 24 || minutes > 59) return null;
  const total = heures * 60 + minutes;
  return total > MINUTES_JOUR ? null : total;
}

// 510 → "08:30" (valeur d'un input type="time").
export function minutesVersHeure(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// 510 → "8h30", 480 → "8h" (libellé FR compact pour l'affichage).
export function minutesVersLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

// ── Validations horaires (Paramètres, Vague 2) ─────────────────────────────

export type PlageMinutes = { heureDebut: number; heureFin: number };

// Une plage valide vérifie 0 ≤ début < fin ≤ 1440. Renvoie un message FR
// prêt à afficher, ou null si valide.
export function validerPlage(plage: PlageMinutes): string | null {
  const { heureDebut, heureFin } = plage;
  if (!Number.isInteger(heureDebut) || !Number.isInteger(heureFin)) {
    return "Heures invalides.";
  }
  if (heureDebut < 0 || heureFin > MINUTES_JOUR) {
    return "Les heures doivent être comprises entre 0h et 24h.";
  }
  if (heureDebut >= heureFin) {
    return "L'heure de fin doit être après l'heure de début.";
  }
  return null;
}

// Intervalles semi-ouverts [début, fin) : deux plages dos-à-dos (8–12 / 12–14)
// ne se chevauchent pas.
export function plagesSeChevauchent(a: PlageMinutes, b: PlageMinutes): boolean {
  return a.heureDebut < b.heureFin && b.heureDebut < a.heureFin;
}

// Valide l'ajout d'une plage parmi les plages EXISTANTES du même
// (conducteur, jour). Renvoie un message FR, ou null si valide.
export function validerNouvellePlage(
  nouvelle: PlageMinutes,
  existantes: readonly PlageMinutes[],
): string | null {
  const invalide = validerPlage(nouvelle);
  if (invalide) return invalide;
  const conflit = existantes.find((p) => plagesSeChevauchent(p, nouvelle));
  if (conflit) {
    return `Cette plage chevauche la plage ${minutesVersLabel(conflit.heureDebut)} – ${minutesVersLabel(conflit.heureFin)} existante.`;
  }
  return null;
}

// ── Détection de conflits (Vague 3) ─────────────────────────────────────────
// Fonctions PURES, réutilisées par les server actions (juge final : re-vérif
// en transaction, flag `forcer`) et par l'UI (créneaux grisés, avertissement).

// Créneau candidat : [debut, debut + dureeMinutes), intervalle semi-ouvert —
// deux visites dos-à-dos ne sont PAS en conflit.
export type Creneau = { debut: Date; dureeMinutes: number };

// Contexte d'UN conducteur sur la fenêtre étudiée (chargé par
// lib/planning-data.ts, jamais par ce module).
export type ContexteConducteur = {
  // Visites PLANIFIEES chevauchant la fenêtre (fin > début de fenêtre).
  visites: {
    id: string;
    debut: Date;
    dureeMinutes: number;
    nomClient: string;
  }[];
  // Toutes les plages récurrentes du conducteur (tous jours confondus).
  horaires: { jourSemaine: number; heureDebut: number; heureFin: number }[];
  // Absences chevauchant la fenêtre (jours entiers, dateFin INCLUSE).
  absences: { dateDebut: Date; dateFin: Date; motif: string | null }[];
  // Heures d'ouverture de l'org : fallback 7 j/7 quand le conducteur n'a
  // AUCUN HoraireRecurrent (état post-migration) — ne bloque jamais la
  // planification, l'UI mentionne « Horaires non définis ».
  ouvertureOrg: PlageMinutes;
};

// Depuis le passage à la planification par PLAGE HORAIRE, le chevauchement
// d'une autre visite n'est PLUS un conflit : l'assistante pose sciemment
// plusieurs visites d'un secteur dans la même plage et ordonne la tournée via
// la carte. Les visites du jour sont exposées à titre INFORMATIF par le
// sélecteur (frise + « N visites dans cette plage », jamais bloquant). Ne
// restent bloquants (forçables) que l'absence et le hors-horaires.
export type Conflit =
  | { type: "HORS_HORAIRES"; plagesJour: PlageMinutes[] }
  | { type: "ABSENCE"; dateDebut: Date; dateFin: Date; motif: string | null };

// Le conducteur a-t-il défini au moins une plage récurrente ?
export function horairesDefinis(ctx: ContexteConducteur): boolean {
  return ctx.horaires.length > 0;
}

// Plages travaillées d'un jour ISO donné (fallback : ouverture org 7 j/7).
export function plagesDuJour(
  ctx: ContexteConducteur,
  jourSemaine: number,
): PlageMinutes[] {
  if (!horairesDefinis(ctx)) return [ctx.ouvertureOrg];
  return ctx.horaires
    .filter((h) => h.jourSemaine === jourSemaine)
    .map(({ heureDebut, heureFin }) => ({ heureDebut, heureFin }))
    .sort((a, b) => a.heureDebut - b.heureDebut);
}

// Fin EXCLUSIVE d'une absence : minuit Paris du lendemain de son dernier jour.
export function finAbsenceExclusive(absence: { dateFin: Date }): Date {
  return ajouterJoursLocal(absence.dateFin, 1);
}

// Détecte les conflits BLOQUANTS (forçables) d'une plage pour un conducteur :
// absence puis hors horaires. Le chevauchement d'une autre visite n'en fait
// plus partie — il est purement informatif (voir le sélecteur de plage).
export function detecterConflits(
  creneau: Creneau,
  ctx: ContexteConducteur,
): Conflit[] {
  const conflits: Conflit[] = [];
  const debut = creneau.debut.getTime();
  const fin = debut + creneau.dureeMinutes * 60_000;

  // 1. Absence (jours entiers, fin incluse → borne exclusive au lendemain).
  for (const a of ctx.absences) {
    if (debut < finAbsenceExclusive(a).getTime() && a.dateDebut.getTime() < fin) {
      conflits.push({
        type: "ABSENCE",
        dateDebut: a.dateDebut,
        dateFin: a.dateFin,
        motif: a.motif,
      });
    }
  }

  // 2. Hors horaires : la plage doit tenir dans UNE seule plage travaillée du
  // jour (à cheval sur la pause déjeuner = conflit, voulu). Les raccourcis du
  // sélecteur sont calés sur ces plages, donc ne le déclenchent jamais.
  const local = instantLocal(creneau.debut);
  const minutesDebut = local.minutes;
  const minutesFin = minutesDebut + creneau.dureeMinutes;
  const plages = plagesDuJour(ctx, local.jourSemaine);
  const dansUnePlage = plages.some(
    (p) => minutesDebut >= p.heureDebut && minutesFin <= p.heureFin,
  );
  if (!dansUnePlage) {
    conflits.push({ type: "HORS_HORAIRES", plagesJour: plages });
  }

  return conflits;
}

// Formatter FR partagé UI/serveur pour les libellés de conflits.
const jourConflit = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU,
  day: "numeric",
  month: "long",
});

// Message FR d'un conflit, prêt à afficher (avertissement UI et erreur action).
export function libelleConflit(conflit: Conflit): string {
  switch (conflit.type) {
    case "ABSENCE": {
      const debut = jourConflit.format(conflit.dateDebut);
      const fin = jourConflit.format(conflit.dateFin);
      const periode = debut === fin ? `le ${debut}` : `du ${debut} au ${fin}`;
      return `Conducteur absent ${periode}${conflit.motif ? ` (${conflit.motif})` : ""}`;
    }
    case "HORS_HORAIRES": {
      if (conflit.plagesJour.length === 0) {
        return "Hors horaires : le conducteur ne travaille pas ce jour-là";
      }
      const plages = conflit.plagesJour
        .map((p) => `${minutesVersLabel(p.heureDebut)} – ${minutesVersLabel(p.heureFin)}`)
        .join(", ");
      return `Hors horaires du conducteur (ce jour : ${plages})`;
    }
  }
}

// ── Marques horaires (sélecteur de plage) ──────────────────────────────────

export const PAS_CRENEAU_MINUTES = 30;

// Une marque = un point de choix « De » (ou « À ») du sélecteur de plage, avec
// son ISO UTC calculé CÔTÉ SERVEUR (Europe/Paris) — le « De » choisi fournit la
// `datePlanifiee` soumise, si bien que le champ posté reste un ISO serveur,
// jamais un datetime-local.
export type MarqueMinute = { minutes: number; iso: string };

// Marques de 30 min entre les bornes d'affichage d'UN jour (minuit Paris), de
// l'ouverture à la fermeture INCLUSES. Le sélecteur en dérive les options « De »
// (marques avant la fermeture) et « À » (marques après le « De »).
export function genererMarquesJour(
  jour: Date,
  bornes: PlageMinutes,
): MarqueMinute[] {
  const { annee, mois, jour: j } = instantLocal(jour);
  const marques: MarqueMinute[] = [];
  const pousser = (minutes: number) => {
    marques.push({
      minutes,
      iso: dateDepuisLocal(annee, mois, j, minutes).toISOString(),
    });
  };
  for (
    let minutes = bornes.heureDebut;
    minutes < bornes.heureFin;
    minutes += PAS_CRENEAU_MINUTES
  ) {
    pousser(minutes);
  }
  pousser(bornes.heureFin); // borne finale exacte (dernière option « À »)
  return marques;
}
