import { instantLocal, minutesVersLabel } from "./planning";

// Formatage de dates en français (exécuté côté serveur, ICU complet sous Node).
// Fuseau ÉPINGLÉ sur Europe/Paris : sans lui, un serveur UTC (Vercel) rendrait
// toutes les heures décalées de 1–2 h et les minuits Paris au jour précédent.
const dateTimeFr = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});
const dateFr = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "Europe/Paris",
});
const heureFr = new Intl.DateTimeFormat("fr-FR", {
  timeStyle: "short",
  timeZone: "Europe/Paris",
});
// « lundi 6 juillet » — en-têtes de colonnes du planning et du sélecteur.
const jourLongFr = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Paris",
});
// « mer. 8 juil. » — cartes compactes de l'agenda conducteur.
const jourCourtFr = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Europe/Paris",
});

export function formatDateTimeFr(d: Date | string): string {
  return dateTimeFr.format(typeof d === "string" ? new Date(d) : d);
}

export function formatDateFr(d: Date | string): string {
  return dateFr.format(typeof d === "string" ? new Date(d) : d);
}

export function formatHeureFr(d: Date | string): string {
  return heureFr.format(typeof d === "string" ? new Date(d) : d);
}

export function formatJourLongFr(d: Date | string): string {
  return jourLongFr.format(typeof d === "string" ? new Date(d) : d);
}

export function formatJourCourtFr(d: Date | string): string {
  return jourCourtFr.format(typeof d === "string" ? new Date(d) : d);
}

// « 10h – 12h » — la PLAGE horaire d'une visite (début → début + amplitude),
// dérivée de `datePlanifiee` + `dureeMinutes`. Style compact « 8h30 » aligné
// sur le planning (`minutesVersLabel`). Repli robuste si l'amplitude est
// absente/nulle (vieilles notifications/événements dont le meta ne portait pas
// `dureeMinutes`) : on n'invente pas de fin, on affiche « à partir de 10h ».
export function formatPlageFr(debut: Date | string, dureeMinutes: number): string {
  const d = typeof debut === "string" ? new Date(debut) : debut;
  const debutMin = instantLocal(d).minutes;
  if (!Number.isFinite(dureeMinutes) || dureeMinutes <= 0) {
    return `à partir de ${minutesVersLabel(debutMin)}`;
  }
  return `${minutesVersLabel(debutMin)} – ${minutesVersLabel(debutMin + dureeMinutes)}`;
}

// « 8 juil. 2026, 10h – 12h » — date medium + plage horaire.
export function formatPlageDateTimeFr(
  debut: Date | string,
  dureeMinutes: number,
): string {
  const d = typeof debut === "string" ? new Date(debut) : debut;
  return `${formatDateFr(d)}, ${formatPlageFr(d, dureeMinutes)}`;
}
