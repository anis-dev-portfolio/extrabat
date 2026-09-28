"use server";

// Lecture des créneaux du sélecteur de planification — LA source unique de
// l'agenda 14 jours, appelée par la page (premier rendu, créneaux en props)
// ET par le client à chaque réglage conducteur/durée/fenêtre (rechargement
// sans re-render serveur de la page, cf. PlanifierSelecteur dans form.tsx).
// AUCUNE mutation ici : le juge des conflits reste planifier/replanifier
// (app/app/dossiers/actions.ts), qui re-vérifie en transaction au submit.

import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  dateContreVisiteConseillee,
  dossierEnTravaux,
  MESSAGE_DOSSIER_EN_TRAVAUX,
  MESSAGE_DOSSIER_ANNULE,
  MESSAGE_VISITE_DEJA_PLANIFIEE,
} from "@/lib/metier";
import {
  JOURS_FENETRE_PLANIFICATION,
  ajouterJoursLocal,
  dateVersParamJour,
  debutJourLocal,
  genererMarquesJour,
  horairesDefinis,
  instantLocal,
  minutesVersLabel,
  parseParamJour,
  plagesDuJour,
  type Fenetre,
} from "@/lib/planning";
import { chargerContextes } from "@/lib/planning-data";
import { visiteDejaPlanifiee } from "@/lib/visites";
import { classerProximite, distanceMinKm, formatDistanceKm } from "@/lib/geo";
import { formatJourCourtFr, formatJourLongFr } from "@/lib/format";
import type { JourSerialise } from "./form";

export type CreneauxResultat =
  | {
      ok: true;
      jours: JourSerialise[];
      horairesDefinis: boolean;
      // Bornes d'affichage de l'org (ouverture/fermeture), identiques pour tous
      // les jours — pilotent les options « De/À » et la piste de la frise.
      bornes: { debutMin: number; finMin: number };
    }
  | { ok: false; error: string };

// Contexte de la fenêtre [jour, jour + 14 j) pour un (dossier, conducteur) : par
// jour, les plages travaillées, les visites déjà posées (frise + chevauchement
// informatif) et les marques horaires (chaque « De » porte son ISO serveur).
// L'AMPLITUDE de la plage est choisie côté client (De/À), donc plus de durée en
// paramètre. Lecture seule → requireRole nu (convention du projet) ; tout est
// re-validé ici (l'action est appelable directement par un client) : dossier
// scopé org, conducteur CONDUCTEUR de l'org, jour parsé.
export async function chargerCreneaux(params: {
  dossierId: string;
  conducteurId: string;
  jour: string;
  visiteId: string | null; // non nul = replanification (visite exclue des conflits)
}): Promise<CreneauxResultat> {
  const user = await requireRole(BACK_OFFICE_ROLES);
  const { dossierId, conducteurId, visiteId } = params;

  const jourDebut = parseParamJour(params.jour);
  if (!jourDebut) return { ok: false, error: "Fenêtre de dates invalide." };

  // `visiteARemplacer` et `dejaPlanifiee` ne dépendent que des paramètres
  // bruts (dossierId/visiteId) — mêmes valeurs qu'après le lookup org-scopé
  // du dossier ci-dessous — donc lancées dans la MÊME salve plutôt qu'après :
  // évite un aller-retour DB séquentiel supplémentaire sur cette action
  // appelée « à chaque réglage conducteur/durée/fenêtre » (commentaire de
  // fichier). Résultat jeté si `dossier` s'avère introuvable/hors org.
  const [dossier, org, conducteur, visiteARemplacer, dejaPlanifiee] =
    await Promise.all([
      // Scoping multi-tenant : le dossier doit appartenir à l'organisation.
      prisma.dossier.findFirst({
        where: { id: dossierId, organisationId: user.organisationId },
        select: {
          id: true,
          statut: true,
          classeHumiditeLe: true,
          latitude: true,
          longitude: true,
        },
      }),
      prisma.organisation.findUniqueOrThrow({
        where: { id: user.organisationId },
        select: { heureOuverture: true, heureFermeture: true },
      }),
      // Le conducteur doit appartenir à l'organisation et avoir le bon rôle.
      prisma.user.findFirst({
        where: {
          id: conducteurId,
          organisationId: user.organisationId,
          role: "CONDUCTEUR",
        },
        select: { id: true, nom: true },
      }),
      // Mode replanification : la visite doit appartenir AU dossier (le
      // scoping org est revérifié ci-dessous via `dossier`, pas ici).
      visiteId
        ? prisma.visite.findFirst({
            where: { id: visiteId, dossierId, statut: "PLANIFIEE" },
            select: { id: true },
          })
        : Promise.resolve(null),
      visiteDejaPlanifiee(prisma, user.organisationId, dossierId),
    ]);
  if (!dossier) return { ok: false, error: "Dossier introuvable." };
  if (dossierEnTravaux(dossier.statut)) {
    return { ok: false, error: MESSAGE_DOSSIER_EN_TRAVAUX };
  }
  // Un dossier annulé ne reçoit plus de visite : le reprendre d'abord
  // (même garde dans l'action planifierVisite, le juge au submit).
  if (dossier.statut === "ANNULE") {
    return { ok: false, error: MESSAGE_DOSSIER_ANNULE };
  }
  if (!conducteur) return { ok: false, error: "Conducteur invalide." };

  // UNE seule visite PLANIFIEE à la fois par dossier (même garde que
  // planifierVisite, le juge au submit) : en mode planification, refuser dès
  // la lecture des créneaux. La replanification est exemptée — elle ne crée
  // rien, elle déplace la visite existante.
  if (!visiteARemplacer && dejaPlanifiee) {
    return { ok: false, error: MESSAGE_VISITE_DEJA_PLANIFIEE };
  }

  const fenetre: Fenetre = {
    debut: jourDebut,
    fin: ajouterJoursLocal(jourDebut, JOURS_FENETRE_PLANIFICATION),
  };

  const contextes = await chargerContextes(prisma, user.organisationId, fenetre, {
    conducteurIds: [conducteur.id],
    exclureVisiteId: visiteARemplacer?.id,
    ouvertureOrg: {
      heureDebut: org.heureOuverture,
      heureFin: org.heureFermeture,
    },
  });
  const ctx = contextes.get(conducteur.id)!;

  // Jours marqués « avant la fin du séchage conseillé » (informatif).
  const echeanceSechage = dateContreVisiteConseillee(dossier);
  const debutSechage = echeanceSechage ? debutJourLocal(echeanceSechage) : null;

  const bornes = { heureDebut: org.heureOuverture, heureFin: org.heureFermeture };

  // Signal géo (informatif, jamais bloquant) : ce dossier est-il proche ou loin
  // d'une visite déjà planifiée CE JOUR-LÀ pour ce conducteur ? Distance à vol
  // d'oiseau uniquement — pas d'ordre de tournée, cf. lib/geo.ts.
  const dossierPoint =
    dossier.latitude !== null && dossier.longitude !== null
      ? { latitude: dossier.latitude, longitude: dossier.longitude }
      : null;

  const jours: JourSerialise[] = Array.from(
    { length: JOURS_FENETRE_PLANIFICATION },
    (_, i) => {
      const jourDate = ajouterJoursLocal(jourDebut, i);
      const jourSuivant = ajouterJoursLocal(jourDate, 1);
      const jourSemaine = instantLocal(jourDate).jourSemaine;

      const visitesJour = ctx.visites.filter(
        (v) =>
          v.debut.getTime() >= jourDate.getTime() &&
          v.debut.getTime() < jourSuivant.getTime(),
      );

      // Plages travaillées du jour (repli : ouverture org) — alimentent les
      // raccourcis, la piste de la frise et le contrôle « hors horaires » côté
      // client.
      const plagesTravaillees = plagesDuJour(ctx, jourSemaine).map((p) => ({
        debutMin: p.heureDebut,
        finMin: p.heureFin,
      }));

      // Absence couvrant ce jour entier (dateFin incluse).
      const absence = ctx.absences.find(
        (a) =>
          jourDate.getTime() >= debutJourLocal(a.dateDebut).getTime() &&
          jourDate.getTime() <= debutJourLocal(a.dateFin).getTime(),
      );

      // Visites déjà posées ce jour-là : frise + comptage informatif du
      // chevauchement (jamais bloquant — l'assistante ordonne via la carte).
      const visitesTimeline = visitesJour.map((v) => {
        const debutMin = instantLocal(v.debut).minutes;
        const finMin = debutMin + v.dureeMinutes;
        return {
          debutMin,
          finMin,
          nomClient: v.nomClient,
          heureLabel: `${minutesVersLabel(debutMin)} – ${minutesVersLabel(finMin)}`,
        };
      });

      const distanceProximite = distanceMinKm(
        dossierPoint,
        visitesJour.map((v) =>
          v.latitude !== null && v.longitude !== null
            ? { latitude: v.latitude, longitude: v.longitude }
            : null,
        ),
      );
      const proximite =
        distanceProximite !== null ? classerProximite(distanceProximite) : null;

      // Visites localisables du jour, pour la carte du formulaire — la réalité
      // géographique visible, au lieu d'un signal calculé à croire sur parole.
      const visitesCarte = visitesJour.flatMap((v) =>
        v.latitude !== null && v.longitude !== null
          ? [
              {
                latitude: v.latitude,
                longitude: v.longitude,
                label: `${minutesVersLabel(instantLocal(v.debut).minutes)} · ${v.nomClient}`,
              },
            ]
          : [],
      );

      return {
        cle: dateVersParamJour(jourDate),
        label: formatJourLongFr(jourDate),
        labelCourt: formatJourCourtFr(jourDate),
        avantSechage:
          debutSechage !== null && jourDate.getTime() < debutSechage.getTime(),
        enAbsence: absence !== undefined,
        absenceMotif: absence?.motif ?? null,
        plagesTravaillees,
        marques: genererMarquesJour(jourDate, bornes),
        visitesTimeline,
        proximite,
        proximiteDetail:
          distanceProximite !== null
            ? `${conducteur.nom} a déjà une visite à ${formatDistanceKm(distanceProximite)} ce jour-là`
            : null,
        visitesCarte,
        nbSansPosition: visitesJour.length - visitesCarte.length,
      };
    },
  );

  return {
    ok: true,
    jours,
    horairesDefinis: horairesDefinis(ctx),
    bornes: { debutMin: org.heureOuverture, finMin: org.heureFermeture },
  };
}
