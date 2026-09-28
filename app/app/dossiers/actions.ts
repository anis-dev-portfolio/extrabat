"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { DossierStatut } from "@/lib/generated/prisma/enums";
import { requireRoleActif, BACK_OFFICE_ROLES } from "@/lib/auth";
import {
  parseCompteRendu,
  appliquerCompteRendu,
  visiteDejaPlanifiee,
} from "@/lib/visites";
import { enregistrerEvenement } from "@/lib/evenements";
import { creerNotification } from "@/lib/notifications";
import {
  statutApresAnnulation,
  dossierEnTravaux,
  MESSAGE_DOSSIER_EN_TRAVAUX,
  MESSAGE_DOSSIER_ANNULE,
  MESSAGE_VISITE_DEJA_PLANIFIEE,
  DOSSIER_STATUTS_ANNULABLES,
  MOTIFS_ANNULATION,
} from "@/lib/metier";
import { geocoderAdresse, geocodageDepuisFormulaire } from "@/lib/geocodage";
import { parseEurosEnCentimes } from "@/lib/finances";
import { dossiersBadgesTag, statsTag } from "@/lib/cache-tags";
// Les codes passés à avecSucces (« dossier-cree », « visite-planifiee »…)
// sont toastés côté client par app/app/toast-succes.tsx après le redirect()
// — garder les codes utilisés ici alignés avec sa liste.
import { avecSucces } from "@/lib/succes";
import { purgerPhotosStorageVisite } from "@/lib/photos-storage";
import { purgerPiecesJointesStorageDossier } from "@/lib/pieces-jointes-storage";
import type { Conflit } from "@/lib/planning";
import {
  DUREE_VISITE_MAX,
  DUREE_VISITE_MIN,
  MINUTES_JOUR,
  instantLocal,
} from "@/lib/planning";
import { verifierCreneau } from "@/lib/planning-data";
import {
  ConflitsDetectes,
  ErreurMetier,
  estContrainteUnique,
  messageFromError,
} from "@/lib/erreurs";
import {
  LIMITES,
  champOptionnel,
  champRequis,
  emailValide,
  telephoneNormalise,
  telephoneValide,
  texte,
} from "@/lib/validation";

export type ActionState = { error: string | null };

// État étendu de la planification : les conflits re-détectés EN TRANSACTION
// sont renvoyés au client si `forcer` n'est pas coché — l'UI les affiche avec
// le forçage explicite. Le serveur reste le juge, l'UI n'est qu'un confort.
export type PlanifierState = { error: string | null; conflits: Conflit[] };

// Destinations de retour autorisées après planification/replanification
// (jamais de redirect vers une valeur libre du formulaire).
function urlRetour(retour: string, dossierId: string): string {
  switch (retour) {
    case "planning":
      return "/app/planning";
    case "dossier":
      return `/app/dossiers/${dossierId}`;
    default:
      return "/app/dossiers";
  }
}

function revalidatePlanning(dossierId: string, organisationId: string) {
  revalidatePath("/app/dossiers");
  revalidatePath(`/app/dossiers/${dossierId}`);
  revalidatePath("/app/planning");
  revalidateTag(dossiersBadgesTag(organisationId));
  // Le cycle des visites/dossiers alimente les Statistiques (pipeline,
  // backlog, activité) — même périmètre d'invalidation que le badge.
  revalidateTag(statsTag(organisationId));
}

// Champs client communs création/modification, trimés (bornés par
// validerChampsClient — bornes partagées LIMITES de lib/validation).
function lireChampsClient(formData: FormData) {
  return {
    nomClient: texte(formData, "nomClient"),
    adresse: texte(formData, "adresse"),
    telephone: texte(formData, "telephone"),
    email: texte(formData, "email"),
    infosAcces: texte(formData, "infosAcces"),
  };
}

// Validation partagée création/modification : trio requis d'un bloc (un seul
// message clair quand le formulaire est incomplet), gardes légères
// email/téléphone, bornes LIMITES. Renvoie le message d'erreur ou null —
// même contrat que les helpers de lib/validation.
// `telephoneInchange` (modification) : un téléphone LEGACY saisi quand la
// borne était de 200 caractères (aujourd'hui 30, lib/validation) doit rester
// éditable sur les autres champs — la garde téléphone n'est appliquée que si
// la valeur a réellement changé.
function validerChampsClient(
  champs: {
    nomClient: string;
    adresse: string;
    telephone: string;
    email: string;
    infosAcces: string;
  },
  options: { telephoneInchange?: boolean } = {},
): string | null {
  if (!champs.nomClient || !champs.adresse || !champs.telephone) {
    return "Nom du client, adresse et téléphone sont requis.";
  }
  if (!options.telephoneInchange && !telephoneValide(champs.telephone)) {
    return `Le téléphone est invalide (${LIMITES.TELEPHONE} caractères max).`;
  }
  // Email optionnel : vide accepté, sinon garde légère (format « x@y.z »).
  if (champs.email && !emailValide(champs.email)) {
    return `L'email du client est invalide (${LIMITES.EMAIL} caractères max).`;
  }
  return (
    champOptionnel(champs.nomClient, LIMITES.NOM, "Le nom du client") ??
    champOptionnel(champs.adresse, LIMITES.ADRESSE, "L'adresse", {
      feminin: true,
    }) ??
    champOptionnel(champs.infosAcces, LIMITES.INFOS_ACCES, "Les infos d'accès", {
      feminin: true,
      pluriel: true,
    })
  );
}

// Champs communs aux formulaires planifier/replanifier (plage horaire : début
// + amplitude). `datePlanifiee` est le DÉBUT de plage, un ISO UTC calculé CÔTÉ
// SERVEUR par le sélecteur (input hidden) — jamais une chaîne datetime-local
// interprétée dans le fuseau du serveur. `dureeMinutes` est l'amplitude de la
// plage (fin − début).
function parseCreneau(formData: FormData):
  | { debut: Date; dureeMinutes: number; forcer: boolean }
  | { error: string } {
  const dateStr = String(formData.get("datePlanifiee") ?? "");
  if (!dateStr) return { error: "Choisissez une plage horaire." };
  const debut = new Date(dateStr);
  if (Number.isNaN(debut.getTime())) return { error: "Plage horaire invalide." };

  const dureeMinutes = Number(formData.get("dureeMinutes") ?? 0);
  if (
    !Number.isInteger(dureeMinutes) ||
    dureeMinutes < DUREE_VISITE_MIN ||
    dureeMinutes > DUREE_VISITE_MAX
  ) {
    return {
      error: `L'amplitude de la plage doit être comprise entre ${DUREE_VISITE_MIN} et ${DUREE_VISITE_MAX} minutes.`,
    };
  }
  // Une plage finit le jour même (Europe/Paris) : jamais « 23h – 1h ».
  if (instantLocal(debut).minutes + dureeMinutes > MINUTES_JOUR) {
    return { error: "La plage horaire doit se terminer avant minuit." };
  }
  return { debut, dureeMinutes, forcer: formData.get("forcer") === "1" };
}

// Plage entièrement écoulée ? Refusée à la planification et à tout CHANGEMENT
// d'horaire (l'ancien sélecteur désactivait les créneaux passés ; le
// sélecteur De/À ne le faisait plus). Une plage en cours — commencée mais pas
// finie — reste planifiable.
const MESSAGE_PLAGE_PASSEE =
  "Cette plage horaire est déjà passée : choisissez une plage à venir.";
function plageEcoulee(debut: Date, dureeMinutes: number): boolean {
  return debut.getTime() + dureeMinutes * 60_000 <= Date.now();
}

// État de la création : un doublon potentiel (même téléphone ou même adresse
// dans l'org) est renvoyé au formulaire si `forcerDoublon` n'est pas posté —
// même philosophie que le forçage de créneau : avertir, jamais bloquer.
// `saisie` renvoie les champs postés tels quels : React réinitialise les
// inputs non contrôlés après l'action — ces valeurs re-remplissent le
// formulaire via defaultValue.
export type CreerDossierState = {
  error: string | null;
  doublon: {
    id: string;
    nomClient: string;
    adresse: string;
    statut: DossierStatut;
  } | null;
  saisie: {
    nomClient: string;
    adresse: string;
    telephone: string;
    email: string;
    infosAcces: string;
  } | null;
};

// Créer un dossier (client, adresse, téléphone, infos d'accès).
export async function creerDossier(
  _prev: CreerDossierState,
  formData: FormData,
): Promise<CreerDossierState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error, doublon: null, saisie: null };
  const { user } = garde;

  // Les champs sont lus AVANT la validation : les erreurs renvoient `saisie`
  // pour re-remplir le formulaire (inputs non contrôlés réinitialisés).
  const saisie = lireChampsClient(formData);
  const invalide = validerChampsClient(saisie);
  if (invalide) return { error: invalide, doublon: null, saisie };
  const { nomClient, adresse, telephone, email, infosAcces } = saisie;

  // Détection de doublon non bloquante : même téléphone ou même adresse.
  // Sautée si l'utilisateur a explicitement forcé. Téléphone : comparaison
  // normalisée DES DEUX CÔTÉS (telephoneNormalise côté saisie, regexp_replace
  // du MÊME charset côté colonne — SQL brut, Prisma n'exprime pas de
  // normalisation de colonne) : « 06 12 34 56 78 » en base matche
  // « 0612345678 » saisi, et inversement. telephoneValide garantit au moins
  // un chiffre → la valeur normalisée n'est jamais vide.
  if (formData.get("forcerDoublon") !== "1") {
    // La valeur reste un paramètre lié (pas d'injection SQL), mais LIKE
    // interpréterait % _ \ comme jokers : un « % » saisi matcherait tout
    // dossier de l'org. Échappés avant liaison (ESCAPE '\' côté SQL).
    const telephoneLike = telephoneNormalise(telephone).replace(
      /[\\%_]/g,
      "\\$&",
    );
    const [doublonsTelephone, doublonAdresse] = await Promise.all([
      // `[[:space:].-]` (POSIX, sans backslash à transporter dans le template
      // SQL) ≡ le charset /[\s.\-]/ de telephoneNormalise.
      prisma.$queryRaw<
        { id: string; nomClient: string; adresse: string; statut: DossierStatut }[]
      >`
        SELECT "id", "nomClient", "adresse", "statut"
        FROM "Dossier"
        WHERE "organisationId" = ${user.organisationId}
          AND regexp_replace("telephone", '[[:space:].-]', '', 'g')
            LIKE '%' || ${telephoneLike} || '%' ESCAPE '\\'
        ORDER BY "updatedAt" DESC
        LIMIT 1
      `,
      prisma.dossier.findFirst({
        where: {
          organisationId: user.organisationId,
          adresse: { equals: adresse, mode: "insensitive" },
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true, nomClient: true, adresse: true, statut: true },
      }),
    ]);
    const doublon = doublonsTelephone[0] ?? doublonAdresse;
    if (doublon) return { error: null, doublon, saisie };
  }

  // Priorité aux coordonnées de la suggestion BAN choisie dans
  // l'autocomplétion (aucune ambiguïté possible) ; sinon géocodage
  // best-effort du texte libre, jamais bloquant : geocoderAdresse ne lève
  // jamais.
  const geocodage =
    geocodageDepuisFormulaire(formData) ?? (await geocoderAdresse(adresse));

  // Création + événement CREATION atomiques : le journal ne peut pas rater
  // la première ligne de la vie du dossier. Erreur DB → ActionState (toast),
  // pas de throw jusqu'au boundary.
  let dossierId = "";
  try {
    const dossier = await prisma.$transaction(async (tx) => {
      const cree = await tx.dossier.create({
        data: {
          nomClient,
          adresse,
          telephone,
          email: email || null,
          infosAcces: infosAcces || null,
          statut: "NOUVEAU",
          organisationId: user.organisationId,
          createdById: user.id,
          latitude: geocodage?.latitude ?? null,
          longitude: geocodage?.longitude ?? null,
          geocodageScore: geocodage?.score ?? null,
          departement: geocodage?.departement ?? null,
        },
        select: { id: true },
      });
      await enregistrerEvenement(tx, {
        dossierId: cree.id,
        type: "CREATION",
        acteurId: user.id,
      });
      return cree;
    });
    dossierId = dossier.id;
  } catch (e) {
    return { error: messageFromError(e), doublon: null, saisie };
  }

  revalidatePath("/app/dossiers");
  revalidateTag(dossiersBadgesTag(user.organisationId));
  revalidateTag(statsTag(user.organisationId));
  // Vers la fiche du nouveau dossier : la planification de la première visite
  // s'y fait dans la foulée. redirect() HORS du try/catch (il lève en interne).
  redirect(avecSucces(`/app/dossiers/${dossierId}`, "dossier-cree"));
}

// `saisie` renvoie les champs postés dans les branches d'erreur : React
// réinitialise les inputs non contrôlés après l'action — ces valeurs
// re-remplissent le formulaire via defaultValue (même pattern que
// CreerDossierState). Null en succès (le formulaire repasse en lecture).
export type ModifierDossierState = {
  error: string | null;
  ok: boolean;
  saisie: {
    nomClient: string;
    adresse: string;
    telephone: string;
    email: string;
    infosAcces: string;
  } | null;
};

// Modifier les infos client d'un dossier (faute de frappe dans le téléphone,
// changement d'accès…). Mêmes validations qu'à la création, scopé org.
export async function modifierDossier(
  dossierId: string,
  _prev: ModifierDossierState,
  formData: FormData,
): Promise<ModifierDossierState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error, ok: false, saisie: null };
  const { user } = garde;

  const champs = lireChampsClient(formData);

  // L'existant est chargé AVANT la validation : un téléphone legacy (saisi
  // quand la borne était de 200 caractères, aujourd'hui 30) resoumis à
  // l'identique ne doit pas bloquer l'édition des autres champs — la garde
  // téléphone n'est appliquée que s'il a changé.
  const existant = await prisma.dossier.findFirst({
    where: { id: dossierId, organisationId: user.organisationId },
    select: {
      nomClient: true,
      adresse: true,
      telephone: true,
      email: true,
      infosAcces: true,
    },
  });
  if (!existant) return { error: "Dossier introuvable.", ok: false, saisie: champs };

  const invalide = validerChampsClient(champs, {
    telephoneInchange: champs.telephone === existant.telephone,
  });
  if (invalide) return { error: invalide, ok: false, saisie: champs };
  const { nomClient, adresse, telephone, email, infosAcces } = champs;

  // Diff AVANT écriture : l'événement MODIFICATION_CLIENT n'est journalisé
  // que si quelque chose a réellement changé (noms canoniques des champs —
  // le libellé français est dérivé à l'affichage par libelleEvenement).
  const champsModifies: string[] = [];
  if (nomClient !== existant.nomClient) champsModifies.push("nomClient");
  if (adresse !== existant.adresse) champsModifies.push("adresse");
  if (telephone !== existant.telephone) champsModifies.push("telephone");
  if ((email || null) !== existant.email) champsModifies.push("email");
  if ((infosAcces || null) !== existant.infosAcces) {
    champsModifies.push("infosAcces");
  }

  // Une suggestion BAN explicitement choisie gagne toujours (même à adresse
  // identique : permet de re-fiabiliser un vieux géocodage douteux). Sinon,
  // ne re-géocoder que si l'adresse a réellement changé — évite un appel BAN
  // à chaque édition du téléphone ou des infos d'accès.
  const choisi = geocodageDepuisFormulaire(formData);
  const adresseChangee = adresse !== existant.adresse;
  const geocodage =
    choisi ?? (adresseChangee ? await geocoderAdresse(adresse) : null);

  // updateMany conditionnel : l'appartenance à l'org est re-vérifiée DANS
  // l'écriture elle-même (le findFirst ci-dessus ne sert qu'à décider du
  // géocodage et du diff) — pas de fenêtre entre lecture et update.
  // L'événement est écrit dans la même transaction que la mise à jour.
  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.dossier.updateMany({
        where: { id: dossierId, organisationId: user.organisationId },
        data: {
          nomClient,
          adresse,
          telephone,
          email: email || null,
          infosAcces: infosAcces || null,
          ...(choisi || adresseChangee
            ? {
                latitude: geocodage?.latitude ?? null,
                longitude: geocodage?.longitude ?? null,
                geocodageScore: geocodage?.score ?? null,
                departement: geocodage?.departement ?? null,
              }
            : {}),
        },
      });
      if (count === 0) throw new ErreurMetier("Dossier introuvable.");

      if (champsModifies.length > 0) {
        await enregistrerEvenement(tx, {
          dossierId,
          type: "MODIFICATION_CLIENT",
          acteurId: user.id,
          meta: { champsModifies },
        });
      }
    });
  } catch (e) {
    return { error: messageFromError(e), ok: false, saisie: champs };
  }

  revalidatePlanning(dossierId, user.organisationId);
  revalidatePath("/app/mes-visites");
  return { error: null, ok: true, saisie: null };
}

// Planifier une visite (première visite OU contre-visite) sur un créneau
// [datePlanifiee, + dureeMinutes). Le numéro est 100 % automatique : nb de
// visites du dossier + 1, calculé en transaction — aucune saisie utilisateur.
// Les conflits (autre visite, hors horaires, absence) sont re-détectés en
// transaction et bloquent sauf `forcer`. Le dossier repasse en PLANIFIE.
export async function planifierVisite(
  dossierId: string,
  _prev: PlanifierState,
  formData: FormData,
): Promise<PlanifierState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error, conflits: [] };
  const { user } = garde;

  const conducteurId = String(formData.get("conducteurId") ?? "");
  const retour = String(formData.get("retour") ?? "dossiers");

  if (!conducteurId) return { error: "Choisissez un conducteur.", conflits: [] };

  const creneau = parseCreneau(formData);
  if ("error" in creneau) return { error: creneau.error, conflits: [] };
  if (plageEcoulee(creneau.debut, creneau.dureeMinutes)) {
    return { error: MESSAGE_PLAGE_PASSEE, conflits: [] };
  }

  // Lectures d'IDENTITÉ hors transaction, en un seul aller-retour : scoping
  // multi-tenant du dossier, appartenance/rôle du conducteur, horaires de
  // l'org. Elles ne dépendent d'aucune écriture — les sortir raccourcit la
  // durée du verrou. Restent DANS la transaction (invariants) : la
  // re-vérification du créneau et la numérotation count+1.
  const [dossier, conducteur, org] = await Promise.all([
    prisma.dossier.findFirst({
      where: { id: dossierId, organisationId: user.organisationId },
      // nomClient/adresse : repris dans le meta de la notification du
      // conducteur (libellé autonome même si le dossier disparaît).
      select: { id: true, statut: true, nomClient: true, adresse: true },
    }),
    prisma.user.findFirst({
      where: {
        id: conducteurId,
        organisationId: user.organisationId,
        role: "CONDUCTEUR",
      },
      select: { id: true, nom: true },
    }),
    prisma.organisation.findUniqueOrThrow({
      where: { id: user.organisationId },
      select: { heureOuverture: true, heureFermeture: true },
    }),
  ]);
  if (!dossier) return { error: "Dossier introuvable.", conflits: [] };
  // Un dossier passé aux travaux ne reçoit plus de visite d'expertise
  // (le cycle expertise est clos ; supprimer le chantier le rouvre).
  if (dossierEnTravaux(dossier.statut)) {
    return { error: MESSAGE_DOSSIER_EN_TRAVAUX, conflits: [] };
  }
  // Un dossier annulé non plus : le reprendre d'abord (reprendreDossier).
  if (dossier.statut === "ANNULE") {
    return { error: MESSAGE_DOSSIER_ANNULE, conflits: [] };
  }
  if (!conducteur) return { error: "Conducteur invalide.", conflits: [] };

  // Deux planifications simultanées du même dossier calculent le même
  // count+1 : la contrainte @@unique([dossierId, numero]) lève P2002 et la
  // reprise de la transaction recalcule un numéro frais — un seul retry
  // suffit, au-delà c'est une vraie erreur.
  for (let tentative = 0; ; tentative++) {
    try {
      await prisma.$transaction(async (tx) => {
        // Verrou consultatif Postgres scopé au dossier, posé AVANT toute
        // lecture : sans lui, deux transactions concurrentes peuvent chacune
        // lire `dejaPlanifiee = 0` puis, si la première commit PENDANT que la
        // seconde exécute verifierCreneau (plusieurs allers-retours), la
        // seconde relit `numero` APRÈS ce commit — un numero différent de la
        // première, qui ne collisionne donc PAS avec @@unique([dossierId,
        // numero]) : les deux transactions réussissent, laissant 2 visites
        // PLANIFIEE (exactement l'état que cette garde doit empêcher). Le
        // verrou (relâché au commit/rollback, tx.$executeRaw car Prisma
        // n'expose pas pg_advisory_xact_lock) sérialise toute planification
        // concurrente du MÊME dossier — la seconde attend que la première
        // ait committé avant même son premier count, qui lit alors l'état à
        // jour.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dossierId}))`;

        // UNE seule visite PLANIFIEE à la fois par dossier : une 2ᵉ resterait
        // orpheline du flux et sa réalisation tardive ferait régresser un
        // dossier passé aux travaux (cf. MESSAGE_VISITE_DEJA_PLANIFIEE).
        if (await visiteDejaPlanifiee(tx, user.organisationId, dossierId)) {
          throw new ErreurMetier(MESSAGE_VISITE_DEJA_PLANIFIEE);
        }

        // Re-détection en transaction (l'agenda a pu bouger depuis l'affichage).
        const conflits = await verifierCreneau(
          tx,
          user.organisationId,
          conducteurId,
          { debut: creneau.debut, dureeMinutes: creneau.dureeMinutes },
          { heureDebut: org.heureOuverture, heureFin: org.heureFermeture },
        );
        if (conflits.length > 0 && !creneau.forcer) {
          throw new ConflitsDetectes(conflits);
        }

        const numero = (await tx.visite.count({ where: { dossierId } })) + 1;

        const visite = await tx.visite.create({
          data: {
            dossierId,
            conducteurId,
            datePlanifiee: creneau.debut,
            dureeMinutes: creneau.dureeMinutes,
            numero,
            statut: "PLANIFIEE",
          },
          select: { id: true },
        });

        // Une nouvelle planification EFFACE l'empêchement en cours (le
        // signalement du conducteur reste tracé dans le journal EMPECHEMENT).
        await tx.dossier.update({
          where: { id: dossierId },
          data: {
            statut: "PLANIFIE",
            empechementLe: null,
            empechementMotif: null,
          },
        });

        await enregistrerEvenement(tx, {
          dossierId,
          type: "VISITE_PLANIFIEE",
          acteurId: user.id,
          meta: {
            numero,
            datePlanifiee: creneau.debut.toISOString(),
            dureeMinutes: creneau.dureeMinutes,
            conducteurNom: conducteur.nom,
          },
        });

        // Notification in-app du conducteur assigné (no-op s'il planifie
        // lui-même) — son appartenance org a été validée ci-dessus.
        await creerNotification(tx, {
          destinataireId: conducteur.id,
          acteurId: user.id,
          type: "VISITE_ASSIGNEE",
          dossierId,
          meta: {
            visiteId: visite.id,
            numero,
            datePlanifiee: creneau.debut.toISOString(),
            dureeMinutes: creneau.dureeMinutes,
            nomClient: dossier.nomClient,
            adresse: dossier.adresse,
          },
        });
      },
      // Timeout EXPLICITE (défaut Prisma 5 s) : ~6 allers-retours sous verrou,
      // marge pour un pooler chargé sans laisser une tx zombie indéfiniment.
      { timeout: 10_000 });
      break;
    } catch (e) {
      if (e instanceof ConflitsDetectes) {
        return {
          error:
            "Cette plage présente des conflits. Vérifiez, puis « Planifier quand même » pour forcer.",
          conflits: e.conflits,
        };
      }
      if (estContrainteUnique(e) && tentative === 0) continue;
      return { error: messageFromError(e), conflits: [] };
    }
  }

  revalidatePlanning(dossierId, user.organisationId);
  redirect(avecSucces(urlRetour(retour, dossierId), "visite-planifiee"));
}

// Replanifier une visite encore PLANIFIEE : nouveau conducteur/créneau/durée.
// La visite elle-même est exclue de la détection (sinon auto-conflit). Le
// statut du dossier ne change pas.
export async function replanifierVisite(
  visiteId: string,
  _prev: PlanifierState,
  formData: FormData,
): Promise<PlanifierState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error, conflits: [] };
  const { user } = garde;

  const conducteurId = String(formData.get("conducteurId") ?? "");
  const retour = String(formData.get("retour") ?? "dossiers");

  if (!conducteurId) return { error: "Choisissez un conducteur.", conflits: [] };

  const creneau = parseCreneau(formData);
  if ("error" in creneau) return { error: creneau.error, conflits: [] };

  // Lectures d'IDENTITÉ hors transaction, en un seul aller-retour : scoping
  // org via le dossier de la visite (+ ancien conducteur et infos client pour
  // les notifications), appartenance/rôle du nouveau conducteur, horaires.
  // Restent DANS la transaction : la re-vérification du créneau et la garde
  // conditionnelle sur le statut (updateMany ci-dessous).
  const [visite, conducteur, org] = await Promise.all([
    prisma.visite.findFirst({
      where: {
        id: visiteId,
        dossier: { organisationId: user.organisationId },
      },
      select: {
        id: true,
        statut: true,
        dossierId: true,
        numero: true,
        datePlanifiee: true,
        dureeMinutes: true, // ancienne amplitude → meta « était prévue »
        // conducteurId (ancien) + infos client : nécessaires aux
        // notifications (réassignation vs simple replanification).
        conducteurId: true,
        dossier: { select: { nomClient: true, adresse: true } },
      },
    }),
    prisma.user.findFirst({
      where: {
        id: conducteurId,
        organisationId: user.organisationId,
        role: "CONDUCTEUR",
      },
      select: { id: true },
    }),
    prisma.organisation.findUniqueOrThrow({
      where: { id: user.organisationId },
      select: { heureOuverture: true, heureFermeture: true },
    }),
  ]);
  if (!visite) return { error: "Visite introuvable.", conflits: [] };
  if (visite.statut !== "PLANIFIEE") {
    return {
      error: "Seule une visite encore planifiée peut être replanifiée.",
      conflits: [],
    };
  }
  // Plage passée : refusée si l'horaire CHANGE. Garder la plage d'une visite
  // en retard reste possible (réaffectation à un autre conducteur pour qu'il
  // envoie le compte-rendu).
  const memePlage =
    creneau.debut.getTime() === visite.datePlanifiee.getTime() &&
    creneau.dureeMinutes === visite.dureeMinutes;
  if (!memePlage && plageEcoulee(creneau.debut, creneau.dureeMinutes)) {
    return { error: MESSAGE_PLAGE_PASSEE, conflits: [] };
  }
  if (!conducteur) return { error: "Conducteur invalide.", conflits: [] };
  const dossierId = visite.dossierId;

  try {
    await prisma.$transaction(async (tx) => {
      // `exclureVisiteId` obligatoire : sans lui, la visite se détecterait
      // elle-même en chevauchement.
      const conflits = await verifierCreneau(
        tx,
        user.organisationId,
        conducteurId,
        { debut: creneau.debut, dureeMinutes: creneau.dureeMinutes },
        { heureDebut: org.heureOuverture, heureFin: org.heureFermeture },
        visite.id,
      );
      if (conflits.length > 0 && !creneau.forcer) {
        throw new ConflitsDetectes(conflits);
      }

      // Garde CONDITIONNELLE (concurrence) : le statut PLANIFIEE est re-vérifié
      // DANS l'écriture elle-même — une visite réalisée/annulée entre la
      // lecture ci-dessus et ici ne bouge pas, et deux replanifications
      // simultanées ne notifient pas deux fois (erreur métier claire).
      const { count } = await tx.visite.updateMany({
        where: { id: visite.id, statut: "PLANIFIEE" },
        data: {
          conducteurId,
          datePlanifiee: creneau.debut,
          dureeMinutes: creneau.dureeMinutes,
        },
      });
      if (count === 0) {
        throw new ErreurMetier(
          "Cette visite n'est plus planifiée — elle a été réalisée ou annulée entre-temps.",
        );
      }

      // Comme la planification : une replanification efface l'empêchement
      // en cours (l'historique reste dans le journal EMPECHEMENT).
      await tx.dossier.update({
        where: { id: visite.dossierId },
        data: { empechementLe: null, empechementMotif: null },
      });

      await enregistrerEvenement(tx, {
        dossierId: visite.dossierId,
        type: "VISITE_REPLANIFIEE",
        acteurId: user.id,
        meta: {
          numero: visite.numero,
          ancienneDate: visite.datePlanifiee.toISOString(),
          ancienneDuree: visite.dureeMinutes,
          nouvelleDate: creneau.debut.toISOString(),
          nouvelleDuree: creneau.dureeMinutes,
        },
      });

      // Notifications in-app (no-op pour l'acteur lui-même). Même conducteur :
      // simple replanification. Conducteur différent : l'ancien perd la visite
      // (annulation « réassignée »), le nouveau la reçoit comme une assignation.
      const metaVisite = {
        visiteId: visite.id,
        numero: visite.numero,
        nomClient: visite.dossier.nomClient,
        adresse: visite.dossier.adresse,
      };
      if (conducteurId === visite.conducteurId) {
        await creerNotification(tx, {
          destinataireId: conducteurId,
          acteurId: user.id,
          type: "VISITE_REPLANIFIEE",
          dossierId: visite.dossierId,
          meta: {
            ...metaVisite,
            ancienneDate: visite.datePlanifiee.toISOString(),
            ancienneDuree: visite.dureeMinutes,
            nouvelleDate: creneau.debut.toISOString(),
            nouvelleDuree: creneau.dureeMinutes,
          },
        });
      } else {
        await creerNotification(tx, {
          destinataireId: visite.conducteurId,
          acteurId: user.id,
          type: "VISITE_ANNULEE",
          dossierId: visite.dossierId,
          meta: {
            ...metaVisite,
            datePrevue: visite.datePlanifiee.toISOString(),
            dureePrevue: visite.dureeMinutes,
            reassignee: true,
          },
        });
        await creerNotification(tx, {
          destinataireId: conducteurId,
          acteurId: user.id,
          type: "VISITE_ASSIGNEE",
          dossierId: visite.dossierId,
          meta: {
            ...metaVisite,
            datePlanifiee: creneau.debut.toISOString(),
            dureeMinutes: creneau.dureeMinutes,
          },
        });
      }
    },
    // Timeout EXPLICITE (défaut Prisma 5 s) — même dimensionnement que
    // planifierVisite.
    { timeout: 10_000 });
  } catch (e) {
    if (e instanceof ConflitsDetectes) {
      return {
        error:
          "Ce créneau présente des conflits. Vérifiez, puis « Planifier quand même » pour forcer.",
        conflits: e.conflits,
      };
    }
    return { error: messageFromError(e), conflits: [] };
  }

  revalidatePath("/app/mes-visites");
  revalidatePlanning(dossierId, user.organisationId);
  redirect(avecSucces(urlRetour(retour, dossierId), "visite-replanifiee"));
}

// Annuler une visite PLANIFIEE (client qui annule, erreur de saisie…). La
// visite est supprimée et le statut du dossier re-dérivé des visites
// restantes : reste une PLANIFIEE → PLANIFIE ; sinon dernière REALISEE →
// classement suggéré par son taux ; sinon → NOUVEAU. Les objets Storage déjà
// envoyés sont purgés en best-effort après le commit (voir ci-dessous).
export async function annulerVisite(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;

  const visiteId = String(formData.get("visiteId") ?? "");
  if (!visiteId) return { error: "Visite introuvable." };

  let dossierId = "";
  try {
    await prisma.$transaction(async (tx) => {
      const visite = await tx.visite.findFirst({
        where: {
          id: visiteId,
          dossier: { organisationId: user.organisationId },
        },
        select: {
          id: true,
          statut: true,
          dossierId: true,
          numero: true,
          datePlanifiee: true,
          dureeMinutes: true, // amplitude prévue → meta « était prévue »
          // conducteurId + infos client : nécessaires à la notification
          // d'annulation (libellé autonome, la visite étant supprimée).
          conducteurId: true,
          dossier: {
            select: { nomClient: true, adresse: true, classeHumiditeLe: true },
          },
        },
      });
      if (!visite) throw new ErreurMetier("Visite introuvable.");
      if (visite.statut !== "PLANIFIEE") {
        throw new ErreurMetier(
          "Seule une visite encore planifiée peut être annulée.",
        );
      }
      dossierId = visite.dossierId;

      // Garde CONDITIONNELLE (concurrence) : le statut PLANIFIEE est re-vérifié
      // DANS la suppression elle-même — deux annulations simultanées (ou une
      // annulation concurrente d'un envoi de compte-rendu) ne suppriment
      // qu'une fois ; l'autre clic sort avec une erreur métier claire, sans
      // double notification ni P2025 générique.
      const { count } = await tx.visite.deleteMany({
        where: { id: visite.id, statut: "PLANIFIEE" },
      });
      if (count === 0) {
        throw new ErreurMetier(
          "Cette visite n'est plus planifiée — elle a été réalisée ou annulée entre-temps.",
        );
      }

      const restantes = await tx.visite.findMany({
        where: { dossierId: visite.dossierId },
        select: { statut: true, numero: true, tauxHumidite: true },
      });
      const nouveauStatut = statutApresAnnulation(
        restantes,
        user.organisation.seuilHumidite,
      );
      // Invariant : EN_ATTENTE_HUMIDITE doit horodater classeHumiditeLe (départ
      // du délai de séchage). Re-dériver vers l'attente sans date laisserait le
      // dossier sans échéance ni badge « À re-planifier ». On ne pose la date
      // que si elle MANQUE : une attente déjà horodatée (contre-visite
      // planifiée puis annulée) conserve son délai (survit au cycle
      // planifier→annuler). Hors attente, classeHumiditeLe est ignoré par
      // dateContreVisiteConseillee (gardé sur le statut) — inutile d'y toucher.
      const horodaterAttente =
        nouveauStatut === "EN_ATTENTE_HUMIDITE" &&
        !visite.dossier.classeHumiditeLe;
      await tx.dossier.update({
        where: { id: visite.dossierId },
        data: {
          statut: nouveauStatut,
          ...(horodaterAttente ? { classeHumiditeLe: new Date() } : {}),
        },
      });

      await enregistrerEvenement(tx, {
        dossierId: visite.dossierId,
        type: "VISITE_ANNULEE",
        acteurId: user.id,
        meta: {
          numero: visite.numero,
          datePrevue: visite.datePlanifiee.toISOString(),
          dureePrevue: visite.dureeMinutes,
        },
      });

      // Notification in-app du conducteur (no-op s'il annule lui-même). Pas
      // de visiteId en meta : la visite vient d'être supprimée, aucun lien
      // possible — le libellé porte tout (client, adresse, date prévue).
      await creerNotification(tx, {
        destinataireId: visite.conducteurId,
        acteurId: user.id,
        type: "VISITE_ANNULEE",
        dossierId: visite.dossierId,
        meta: {
          numero: visite.numero,
          datePrevue: visite.datePlanifiee.toISOString(),
          dureePrevue: visite.dureeMinutes,
          nomClient: visite.dossier.nomClient,
          adresse: visite.dossier.adresse,
        },
      });
    });
  } catch (e) {
    return { error: messageFromError(e) };
  }

  // Les uploads par URL signée écrivent dans le bucket AVANT l'envoi du
  // compte-rendu : une visite encore PLANIFIEE n'a jamais de ligne Photo,
  // mais peut déjà avoir des objets Storage. Purge best-effort (ne lève
  // jamais) APRÈS le commit — la suppression de la visite prime.
  await purgerPhotosStorageVisite(user.organisationId, visiteId);

  revalidatePath("/app/mes-visites");
  revalidatePlanning(dossierId, user.organisationId);
  return { error: null };
}

// Annuler un DOSSIER entier (apporteur qui se rétracte, client injoignable,
// doublon…) : possible depuis le cycle expertise uniquement
// (DOSSIER_STATUTS_ANNULABLES — jamais EN_CHANTIER/TERMINE, le planning
// chantier et les Finances sont protégés). Les visites encore PLANIFIEE sont
// supprimées (journal + notification conducteur, comme annulerVisite), le
// motif et l'horodatage vivent sur le dossier (annulationMotif/annuleLe).
// classeHumiditeLe/empechementLe/empechementMotif sont laissés TELS QUELS :
// une reprise (reprendreDossier) doit retrouver le dossier dans l'état où
// l'annulation l'a pris. L'appelant (client) attend le retour : erreur
// affichée en toast, pas de redirect.
export async function annulerDossier(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;

  const dossierId = String(formData.get("dossierId") ?? "");
  if (!dossierId) return { error: "Dossier introuvable." };

  // Même mécanique que signalerEmpechement (visites/[id]/actions.ts) :
  // préset obligatoire, précision libre requise si « Autre ».
  const motifChoisi = String(formData.get("motif") ?? "");
  const precision = texte(formData, "precision");

  if (!MOTIFS_ANNULATION.includes(motifChoisi)) {
    return { error: "Choisissez un motif d'annulation." };
  }
  if (motifChoisi === "Autre" && !precision) {
    return { error: "Précisez le motif de l'annulation." };
  }

  // Motif final stocké/journalisé : le préset, complété de la précision libre.
  // « Autre » = la précision EST le motif.
  const motif =
    motifChoisi === "Autre"
      ? precision
      : precision
        ? `${motifChoisi} — ${precision}`
        : motifChoisi;
  const invalide = champOptionnel(motif, LIMITES.MOTIF_ANNULATION, "Le motif");
  if (invalide) return { error: invalide };

  // Ids des visites supprimées, mémorisés pour la purge Storage APRÈS commit.
  let visitesSupprimees: string[] = [];
  try {
    await prisma.$transaction(async (tx) => {
      const dossier = await tx.dossier.findFirst({
        where: { id: dossierId, organisationId: user.organisationId },
        // nomClient/adresse : repris dans le meta des notifications des
        // conducteurs (libellé autonome, les visites étant supprimées).
        select: { id: true, statut: true, nomClient: true, adresse: true },
      });
      if (!dossier) throw new ErreurMetier("Dossier introuvable.");
      if (dossier.statut === "ANNULE") {
        throw new ErreurMetier("Ce dossier est déjà annulé.");
      }
      const statutAvant = dossier.statut;

      // Contexte des visites encore planifiées, lu AVANT leur suppression
      // (numéro, date prévue, conducteur — introuvable après coup).
      const planifiees = await tx.visite.findMany({
        where: { dossierId: dossier.id, statut: "PLANIFIEE" },
        select: {
          id: true,
          numero: true,
          datePlanifiee: true,
          dureeMinutes: true, // amplitude prévue → meta « était prévue »
          conducteurId: true,
        },
      });

      // Garde CONDITIONNELLE (concurrence) : le statut annulable est
      // re-vérifié DANS l'écriture elle-même — un passage aux travaux (ou une
      // annulation concurrente) entre la lecture et ici ne bascule rien ;
      // l'autre clic sort avec une erreur métier claire.
      const { count } = await tx.dossier.updateMany({
        where: {
          id: dossier.id,
          organisationId: user.organisationId,
          statut: { in: [...DOSSIER_STATUTS_ANNULABLES] },
        },
        data: {
          statut: "ANNULE",
          annuleLe: new Date(),
          annulationMotif: motif,
        },
      });
      if (count === 0) {
        throw new ErreurMetier(
          "Ce dossier ne peut plus être annulé (déjà en travaux ou terminé).",
        );
      }

      // Journal + notification par visite AVANT le deleteMany — même meta
      // autonome qu'annulerVisite (pas de visiteId : la visite est supprimée,
      // aucun lien possible — le libellé porte tout).
      for (const visite of planifiees) {
        await enregistrerEvenement(tx, {
          dossierId: dossier.id,
          type: "VISITE_ANNULEE",
          acteurId: user.id,
          meta: {
            numero: visite.numero,
            datePrevue: visite.datePlanifiee.toISOString(),
            dureePrevue: visite.dureeMinutes,
          },
        });
        await creerNotification(tx, {
          destinataireId: visite.conducteurId,
          acteurId: user.id,
          type: "VISITE_ANNULEE",
          dossierId: dossier.id,
          meta: {
            numero: visite.numero,
            datePrevue: visite.datePlanifiee.toISOString(),
            dureePrevue: visite.dureeMinutes,
            nomClient: dossier.nomClient,
            adresse: dossier.adresse,
          },
        });
      }
      // Garde where PLANIFIEE (anti-course) : une visite réalisée entre la
      // lecture et ici survit — seules les encore planifiées partent.
      await tx.visite.deleteMany({
        where: {
          id: { in: planifiees.map((v) => v.id) },
          statut: "PLANIFIEE",
        },
      });

      await enregistrerEvenement(tx, {
        dossierId: dossier.id,
        type: "DOSSIER_ANNULE",
        acteurId: user.id,
        meta: { motif, statutAvant },
      });

      visitesSupprimees = planifiees.map((v) => v.id);
    },
    // Timeout EXPLICITE (défaut Prisma 5 s) : journal + notification par
    // visite planifiée — même dimensionnement que planifierVisite.
    { timeout: 10_000 });
  } catch (e) {
    return { error: messageFromError(e) };
  }

  // Une visite encore PLANIFIEE peut avoir des objets Storage sans ligne
  // Photo (uploads par URL signée avant l'envoi du compte-rendu) : purge
  // best-effort (ne lève jamais) APRÈS le commit — même pattern
  // qu'annulerVisite, la bascule du dossier prime.
  for (const visiteId of visitesSupprimees) {
    await purgerPhotosStorageVisite(user.organisationId, visiteId);
  }

  // Mêmes chemins qu'annulerVisite + les vues qui listent/comptent le dossier
  // hors pipeline : « À traiter » (un annulé sort du backlog, cf.
  // lib/a-traiter.ts), Historique et Statistiques (pages non taguées).
  revalidatePath("/app/mes-visites");
  revalidatePath("/app/a-traiter");
  revalidatePath("/app/historique");
  revalidatePath("/app/statistiques");
  revalidatePlanning(dossierId, user.organisationId);
  return { error: null };
}

// Reprendre un dossier annulé (annulation à tort, client qui revient) : le
// statut est RE-DÉRIVÉ des visites du dossier par statutApresAnnulation —
// les PLANIFIEE ont été supprimées à l'annulation, restent les REALISEE dont
// la dernière redonne le classement suggéré, sinon retour à NOUVEAU.
// annuleLe/annulationMotif sont nettoyés ; le motif reste tracé dans le
// journal DOSSIER_ANNULE. Jumeau inverse d'annulerDossier.
export async function reprendreDossier(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;

  const dossierId = String(formData.get("dossierId") ?? "");
  if (!dossierId) return { error: "Dossier introuvable." };

  try {
    await prisma.$transaction(async (tx) => {
      const dossier = await tx.dossier.findFirst({
        where: { id: dossierId, organisationId: user.organisationId },
        // classeHumiditeLe : nécessaire au bloc horodaterAttente ci-dessous.
        select: { id: true, statut: true, classeHumiditeLe: true },
      });
      if (!dossier) throw new ErreurMetier("Dossier introuvable.");
      if (dossier.statut !== "ANNULE") {
        throw new ErreurMetier("Ce dossier n'est pas annulé.");
      }

      // Statut re-dérivé des visites du dossier — même logique
      // qu'annulerVisite, seuil d'humidité de l'ORG (pas le seuil usine).
      const visites = await tx.visite.findMany({
        where: { dossierId: dossier.id },
        select: { statut: true, numero: true, tauxHumidite: true },
      });
      const nouveauStatut = statutApresAnnulation(
        visites,
        user.organisation.seuilHumidite,
      );
      // Invariant : EN_ATTENTE_HUMIDITE doit horodater classeHumiditeLe
      // (départ du délai de séchage), sinon le dossier repris reste sans
      // échéance ni badge « À re-planifier ». On ne pose la date que si elle
      // MANQUE : une attente déjà horodatée avant l'annulation conserve son
      // délai (le séchage a continué pendant l'annulation).
      const horodaterAttente =
        nouveauStatut === "EN_ATTENTE_HUMIDITE" && !dossier.classeHumiditeLe;

      // Garde CONDITIONNELLE (concurrence) : le statut ANNULE est re-vérifié
      // DANS l'écriture elle-même — deux reprises simultanées ne basculent
      // (et ne journalisent) qu'une fois.
      const { count } = await tx.dossier.updateMany({
        where: {
          id: dossier.id,
          organisationId: user.organisationId,
          statut: "ANNULE",
        },
        data: {
          statut: nouveauStatut,
          annuleLe: null,
          annulationMotif: null,
          ...(horodaterAttente ? { classeHumiditeLe: new Date() } : {}),
        },
      });
      if (count === 0) {
        throw new ErreurMetier("Ce dossier n'est pas annulé.");
      }

      await enregistrerEvenement(tx, {
        dossierId: dossier.id,
        type: "DOSSIER_REPRIS",
        acteurId: user.id,
        meta: { statut: nouveauStatut },
      });
    });
  } catch (e) {
    return { error: messageFromError(e) };
  }

  // Mêmes revalidations qu'annulerDossier (le dossier rentre/sort des mêmes
  // vues dans les deux sens).
  revalidatePath("/app/mes-visites");
  revalidatePath("/app/a-traiter");
  revalidatePath("/app/historique");
  revalidatePath("/app/statistiques");
  revalidatePlanning(dossierId, user.organisationId);
  return { error: null };
}

// Supprimer DÉFINITIVEMENT un dossier (dossier de test, doublon de saisie…).
// Contrairement à l'annulation (réversible, le dossier reste consultable dans
// l'Historique), la suppression efface TOUT — visites, photos, pièces
// jointes, notes, journal — et les montants du devis sortent du CA et des
// Statistiques. Permise à TOUT statut (un dossier de test peut être allé
// jusqu'à TERMINE avec un montant payé — c'est justement lui qui fausse les
// chiffres). Garde-fou : le nom du client doit être retapé dans le dialog et
// il est RE-VÉRIFIÉ ici contre la base — l'UI n'est qu'un confort. Les
// conducteurs des visites encore planifiées sont prévenus (leur notification
// survit : dossierId passe à null par SetNull, le meta autonome porte le
// libellé). Storage purgé en best-effort APRÈS le commit. Succès → redirect
// vers la liste (la fiche n'existe plus), toast via `?succes=` (règle des
// deux canaux — toast-succes.tsx). SEULE exception au « tout statut » : un
// dossier qui porte un document SIGNÉ par le client n'est jamais supprimable
// (la cascade emporterait la preuve SES) — on l'annule à la place.
export async function supprimerDossier(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;

  const dossierId = String(formData.get("dossierId") ?? "");
  if (!dossierId) return { error: "Dossier introuvable." };
  const confirmation = texte(formData, "confirmation");
  if (!confirmation) {
    return { error: "Retapez le nom du client pour confirmer." };
  }

  // Ids des visites supprimées, mémorisés pour la purge Storage APRÈS commit.
  let visitesSupprimees: string[] = [];
  try {
    await prisma.$transaction(
      async (tx) => {
        const dossier = await tx.dossier.findFirst({
          where: { id: dossierId, organisationId: user.organisationId },
          select: {
            id: true,
            nomClient: true,
            adresse: true,
            visites: {
              select: {
                id: true,
                numero: true,
                datePlanifiee: true,
                dureeMinutes: true, // amplitude prévue → meta « était prévue »
                statut: true,
                conducteurId: true,
              },
            },
          },
        });
        if (!dossier) throw new ErreurMetier("Dossier introuvable.");

        // Garde-fou serveur : comparaison insensible à la casse, espaces
        // parasites tolérés (texte() a déjà trimé la saisie).
        if (
          confirmation.toLocaleLowerCase("fr") !==
          dossier.nomClient.trim().toLocaleLowerCase("fr")
        ) {
          throw new ErreurMetier(
            "Le nom saisi ne correspond pas au nom du client.",
          );
        }

        // Preuve de signature : la cascade Dossier → DocumentASigner
        // effacerait l'original, la version signée et leurs hash.
        const documentsSignes = await tx.documentASigner.count({
          where: { dossierId: dossier.id, signeLe: { not: null } },
        });
        if (documentsSignes > 0) {
          throw new ErreurMetier(
            "Ce dossier contient un document signé par le client : c'est une preuve, il ne peut pas être supprimé. Annulez-le plutôt — il restera consultable dans l'Historique.",
          );
        }

        // Conducteurs prévenus pour les visites encore planifiées — même meta
        // autonome qu'annulerDossier (aucun lien possible après suppression,
        // le libellé porte tout). Pas d'événement journal : il part avec le
        // dossier.
        for (const visite of dossier.visites) {
          if (visite.statut !== "PLANIFIEE") continue;
          await creerNotification(tx, {
            destinataireId: visite.conducteurId,
            acteurId: user.id,
            type: "VISITE_ANNULEE",
            dossierId: dossier.id,
            meta: {
              numero: visite.numero,
              datePrevue: visite.datePlanifiee.toISOString(),
              dureePrevue: visite.dureeMinutes,
              nomClient: dossier.nomClient,
              adresse: dossier.adresse,
            },
          });
        }

        // Le chantier ne cascade pas depuis le dossier (contrainte Restrict) :
        // suppression explicite AVANT — ses affectations, elles, cascadent.
        await tx.chantier.deleteMany({ where: { dossierId: dossier.id } });

        // Cascades du schéma : visites (→ photos), notes, journal, pièces
        // jointes ; notifications → dossierId null (SetNull). deleteMany
        // scopé org (défense en profondeur) + garde de concurrence : deux
        // suppressions simultanées n'aboutissent qu'une fois.
        const { count } = await tx.dossier.deleteMany({
          where: { id: dossier.id, organisationId: user.organisationId },
        });
        if (count === 0) throw new ErreurMetier("Dossier introuvable.");

        visitesSupprimees = dossier.visites.map((v) => v.id);
      },
      // Timeout EXPLICITE (défaut Prisma 5 s) : notification par visite
      // planifiée + cascades — même dimensionnement qu'annulerDossier.
      { timeout: 10_000 },
    );
  } catch (e) {
    return { error: messageFromError(e) };
  }

  // Purge Storage best-effort APRÈS le commit (la suppression prime, un échec
  // laisse au pire des orphelins) : photos de chaque visite — y compris les
  // uploads par URL signée jamais enregistrés — puis pièces jointes du dossier.
  for (const visiteId of visitesSupprimees) {
    await purgerPhotosStorageVisite(user.organisationId, visiteId);
  }
  await purgerPiecesJointesStorageDossier(user.organisationId, dossierId);

  // Suppression permise à tout statut : le dossier peut sortir de TOUTES les
  // vues, y compris Finances et Historique (que l'annulation ne touche pas).
  revalidatePath("/app/mes-visites");
  revalidatePath("/app/a-traiter");
  revalidatePath("/app/historique");
  revalidatePath("/app/statistiques");
  revalidatePath("/app/finances");
  revalidatePlanning(dossierId, user.organisationId);
  redirect(avecSucces("/app/dossiers", "dossier-supprime"));
}

// État dédié de la saisie back-office (le type partagé ActionState reste
// inchangé pour ses autres consommateurs). `saisie` renvoie les champs texte
// postés dans les branches d'erreur : React réinitialise les inputs non
// contrôlés après l'action — perdre un résumé/une conclusion longs serait
// douloureux. Les pièces (ChipsInput) portent leur propre état React et
// survivent d'elles-mêmes : inutile de les renvoyer.
export type SaisirResultatState = {
  error: string | null;
  saisie: {
    tauxHumidite: string;
    joursReparationEstimes: string;
    resume: string;
    conclusion: string;
  } | null;
};

// Saisir le compte-rendu d'une visite depuis le back-office : marque la dernière
// visite PLANIFIEE du dossier comme REALISEE, horodate dateRealisee, et fait
// passer le dossier en REALISE (réception). Le formulaire terrain mobile du
// conducteur (Sous-phase B) réutilisera cette même transition.
export async function saisirResultat(
  dossierId: string,
  _prev: SaisirResultatState,
  formData: FormData,
): Promise<SaisirResultatState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error, saisie: null };
  const { user } = garde;

  // Champs lus tels quels AVANT la validation (mêmes clés que parseCompteRendu,
  // qui reste le juge) : les erreurs renvoient `saisie` pour re-remplir le
  // formulaire.
  const saisie = {
    tauxHumidite: String(formData.get("tauxHumidite") ?? "").trim(),
    joursReparationEstimes: String(
      formData.get("joursReparationEstimes") ?? "",
    ).trim(),
    resume: String(formData.get("resume") ?? "").trim(),
    conclusion: String(formData.get("conclusion") ?? "").trim(),
  };

  const parsed = parseCompteRendu(formData);
  if ("error" in parsed) return { error: parsed.error, saisie };

  try {
    await prisma.$transaction(async (tx) => {
      const dossier = await tx.dossier.findFirst({
        where: { id: dossierId, organisationId: user.organisationId },
        select: { id: true },
      });
      if (!dossier) throw new ErreurMetier("Dossier introuvable.");

      const visite = await tx.visite.findFirst({
        where: { dossierId, statut: "PLANIFIEE" },
        orderBy: { numero: "desc" },
        select: { id: true },
      });
      if (!visite)
        throw new ErreurMetier(
          "Aucune visite planifiée à saisir pour ce dossier.",
        );

      // Saisie back-office : l'acteur du journal COMPTE_RENDU_RECU est
      // l'assistante connectée, pas le conducteur de la visite (l'événement
      // lui-même est écrit par appliquerCompteRendu, une seule fois).
      await appliquerCompteRendu(
        tx,
        visite.id,
        dossier.id,
        parsed.payload,
        user.id,
      );
    });
  } catch (e) {
    return { error: messageFromError(e), saisie };
  }

  revalidatePlanning(dossierId, user.organisationId);
  redirect(avecSucces("/app/dossiers", "compte-rendu-saisi"));
}

// Réception : l'assistante confirme d'un clic le classement du dossier après
// une visite réalisée (EN_ATTENTE_HUMIDITE si taux > 25 %, sinon PRET_POUR_TRAVAUX).
// Le classement humidité horodate le début du séchage (classeHumiditeLe),
// point de départ du délai conseillé avant contre-visite. L'appelant (client)
// attend le retour : erreur affichée en toast, pas de redirect.
export async function confirmerClassement(
  formData: FormData,
): Promise<ActionState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;

  const dossierId = String(formData.get("dossierId") ?? "");
  const statut = String(formData.get("statut") ?? "");
  if (statut !== "EN_ATTENTE_HUMIDITE" && statut !== "PRET_POUR_TRAVAUX") {
    return { error: "Classement invalide." };
  }

  // updateMany conditionnel : le statut REALISE est vérifié DANS l'écriture
  // (pas de fenêtre entre lecture et update — deux clics simultanés ne
  // classent qu'une fois). Transaction : l'événement CLASSEMENT n'est écrit
  // QUE si le classement a réellement eu lieu (count > 0), atomiquement.
  let classe = false;
  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.dossier.updateMany({
        where: {
          id: dossierId,
          organisationId: user.organisationId,
          statut: "REALISE",
        },
        data: {
          statut,
          classeHumiditeLe: statut === "EN_ATTENTE_HUMIDITE" ? new Date() : null,
        },
      });
      if (count === 0) return;
      classe = true;

      await enregistrerEvenement(tx, {
        dossierId,
        type: "CLASSEMENT",
        acteurId: user.id,
        meta: { statut },
      });
    });
  } catch (e) {
    return { error: messageFromError(e) };
  }
  if (!classe) {
    return { error: "Ce dossier a déjà été classé ou n'est plus en attente." };
  }

  revalidatePath("/app/dossiers");
  revalidatePath(`/app/dossiers/${dossierId}`);
  // Le classement alimente les répartitions de la page Statistiques.
  revalidatePath("/app/statistiques");
  revalidateTag(dossiersBadgesTag(user.organisationId));
  revalidateTag(statsTag(user.organisationId));
  return { error: null };
}

// `saisie` renvoie la note tapée dans les branches d'erreur (React
// réinitialise le textarea non contrôlé après l'action) ; null en succès —
// le reset est alors volontaire.
export type AjouterNoteState = {
  error: string | null;
  ok: boolean;
  saisie: { contenu: string } | null;
};

// Ajouter une note interne de suivi au dossier (« le client a rappelé »…).
// Back-office uniquement, scoping org via le dossier. Journal fidèle : pas de
// suppression ni d'édition ensuite. L'appelant (client) toaste le succès —
// pas de redirect ni de code succès global.
export async function ajouterNote(
  dossierId: string,
  _prev: AjouterNoteState,
  formData: FormData,
): Promise<AjouterNoteState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error, ok: false, saisie: null };
  const { user } = garde;

  const contenu = texte(formData, "contenu");
  const invalide = champRequis(contenu, LIMITES.NOTE, "La note", {
    feminin: true,
    messageRequis: "Écrivez la note avant de l'ajouter.",
  });
  if (invalide) return { error: invalide, ok: false, saisie: { contenu } };

  try {
    const dossier = await prisma.dossier.findFirst({
      where: { id: dossierId, organisationId: user.organisationId },
      select: { id: true },
    });
    if (!dossier) {
      return { error: "Dossier introuvable.", ok: false, saisie: { contenu } };
    }

    await prisma.noteDossier.create({
      data: { dossierId: dossier.id, auteurId: user.id, contenu },
    });
  } catch (e) {
    return { error: messageFromError(e), ok: false, saisie: { contenu } };
  }

  revalidatePath(`/app/dossiers/${dossierId}`);
  return { error: null, ok: true, saisie: null };
}

/* ── Volet financier (devis Tolteck + paiement) ─────────────────────── */

// Vues touchées par une mutation financière : fiche dossier (carte Devis),
// kanban/liste (badge « Devis non saisi »), section Chantiers (badge « Payé /
// À encaisser »), la vue Chiffre d'affaires, les tendances Statistiques et
// l'Historique (colonne Règlement / payeLe).
function revaliderFinances(dossierId: string, organisationId: string) {
  revalidatePath(`/app/dossiers/${dossierId}`);
  revalidatePath("/app/dossiers");
  revalidatePath("/app/chantiers");
  revalidatePath("/app/finances");
  revalidatePath("/app/statistiques");
  revalidatePath("/app/historique");
  // Caches serveur Chiffre d'affaires + Statistiques (unstable_cache scopés
  // org) — recalcul immédiat après devis/paiement, sans attendre le filet.
  revalidateTag(statsTag(organisationId));
}

// Montants du devis Tolteck saisis sur la fiche dossier. Montant HT REQUIS (le
// CA se raisonne en HT) ; franchise et référence facultatives. Tout est
// converti en centimes (parseEurosEnCentimes, le juge final malgré le
// maxLength/inputmode du formulaire).
function parseDevis(formData: FormData):
  | { montantDevis: number; franchise: number | null; refDevis: string | null }
  | { error: string } {
  const montantSaisi = texte(formData, "montantDevis");
  if (!montantSaisi) return { error: "Saisissez le montant HT du devis." };
  const montantDevis = parseEurosEnCentimes(montantSaisi);
  if (montantDevis === null) {
    return { error: "Montant HT invalide (ex. « 1 500 » ou « 1500,50 »)." };
  }
  if (montantDevis === 0) {
    return { error: "Le montant HT doit être supérieur à zéro." };
  }

  const franchiseSaisie = texte(formData, "franchise");
  let franchise: number | null = null;
  if (franchiseSaisie) {
    franchise = parseEurosEnCentimes(franchiseSaisie);
    if (franchise === null) {
      return { error: "Franchise invalide (ex. « 300 » ou « 300,00 »)." };
    }
  }

  const refSaisie = texte(formData, "refDevis");
  const refInvalide = champOptionnel(
    refSaisie,
    LIMITES.REF_DEVIS,
    "La référence du devis",
    { feminin: true },
  );
  if (refInvalide) return { error: refInvalide };

  return { montantDevis, franchise, refDevis: refSaisie || null };
}

// `saisie` renvoie les montants postés (chaînes brutes) dans les branches
// d'erreur : React réinitialise les inputs non contrôlés après l'action —
// sans ça, un montant refusé revient aux valeurs du dossier. Null en succès.
export type DevisState = {
  error: string | null;
  ok: boolean;
  saisie: { montantDevis: string; franchise: string; refDevis: string } | null;
};

// Enregistrer/mettre à jour les montants du devis d'un dossier (miroir Tolteck).
// Éditable à tout statut (rétro-saisie des dossiers déjà terminés incluse).
// L'événement DEVIS_ENREGISTRE n'est journalisé que si quelque chose a
// réellement changé — pas de bruit à la ré-ouverture du formulaire.
export async function enregistrerDevis(
  dossierId: string,
  _prev: DevisState,
  formData: FormData,
): Promise<DevisState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error, ok: false, saisie: null };
  const { user } = garde;

  // Champs lus tels quels AVANT le parsing (parseDevis reste le juge) : les
  // erreurs renvoient `saisie` pour re-remplir le formulaire.
  const saisie = {
    montantDevis: texte(formData, "montantDevis"),
    franchise: texte(formData, "franchise"),
    refDevis: texte(formData, "refDevis"),
  };

  const parsed = parseDevis(formData);
  if ("error" in parsed) return { error: parsed.error, ok: false, saisie };

  try {
    await prisma.$transaction(async (tx) => {
      const existant = await tx.dossier.findFirst({
        where: { id: dossierId, organisationId: user.organisationId },
        select: { montantDevis: true, franchise: true, refDevis: true },
      });
      if (!existant) throw new ErreurMetier("Dossier introuvable.");

      const change =
        existant.montantDevis !== parsed.montantDevis ||
        existant.franchise !== parsed.franchise ||
        existant.refDevis !== parsed.refDevis;

      await tx.dossier.update({
        where: { id: dossierId },
        data: {
          montantDevis: parsed.montantDevis,
          franchise: parsed.franchise,
          refDevis: parsed.refDevis,
        },
      });

      if (change) {
        await enregistrerEvenement(tx, {
          dossierId,
          type: "DEVIS_ENREGISTRE",
          acteurId: user.id,
          meta: { montantDevis: parsed.montantDevis },
        });
      }
    });
  } catch (e) {
    return { error: messageFromError(e), ok: false, saisie };
  }

  revaliderFinances(dossierId, user.organisationId);
  return { error: null, ok: true, saisie: null };
}

// Marquer payé (1 clic) un dossier TERMINE : horodate payeLe côté serveur. Le
// FAIT « payé » est découplé du « terminé » (le règlement, souvent l'assurance,
// arrive des semaines après la fin des travaux). Refusé si le montant du devis
// est inconnu — garantit qu'un CA en base correspond à un montant réel.
export async function marquerPaye(formData: FormData): Promise<ActionState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;

  const dossierId = String(formData.get("dossierId") ?? "");
  if (!dossierId) return { error: "Dossier introuvable." };

  try {
    await prisma.$transaction(async (tx) => {
      const dossier = await tx.dossier.findFirst({
        where: { id: dossierId, organisationId: user.organisationId },
        select: { id: true, statut: true, montantDevis: true, payeLe: true },
      });
      if (!dossier) throw new ErreurMetier("Dossier introuvable.");
      if (dossier.statut !== "TERMINE") {
        throw new ErreurMetier(
          "Seul un dossier terminé peut être marqué payé.",
        );
      }
      if (dossier.montantDevis == null) {
        throw new ErreurMetier(
          "Saisissez d'abord le montant du devis : on ne marque pas payé un montant inconnu.",
        );
      }
      if (dossier.payeLe) {
        throw new ErreurMetier("Ce dossier est déjà marqué payé.");
      }

      // Garde CONDITIONNELLE (concurrence) : les prédicats sont re-vérifiés
      // DANS l'écriture elle-même — deux clics simultanés ne marquent (et ne
      // journalisent PAIEMENT_RECU) qu'une seule fois.
      const { count } = await tx.dossier.updateMany({
        where: {
          id: dossier.id,
          organisationId: user.organisationId,
          statut: "TERMINE",
          montantDevis: { not: null },
          payeLe: null,
        },
        data: { payeLe: new Date() },
      });
      if (count === 0) {
        throw new ErreurMetier("Ce dossier est déjà marqué payé.");
      }
      await enregistrerEvenement(tx, {
        dossierId,
        type: "PAIEMENT_RECU",
        acteurId: user.id,
        meta: { montantDevis: dossier.montantDevis },
      });
    });
  } catch (e) {
    return { error: messageFromError(e) };
  }

  revaliderFinances(dossierId, user.organisationId);
  return { error: null };
}

// Annuler le marquage payé (erreur de manipulation) : payeLe repart à null, le
// dossier redevient « à encaisser ». Jumeau inverse de marquerPaye.
export async function annulerPaiement(formData: FormData): Promise<ActionState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;

  const dossierId = String(formData.get("dossierId") ?? "");
  if (!dossierId) return { error: "Dossier introuvable." };

  try {
    await prisma.$transaction(async (tx) => {
      const dossier = await tx.dossier.findFirst({
        where: { id: dossierId, organisationId: user.organisationId },
        select: { id: true, payeLe: true },
      });
      if (!dossier) throw new ErreurMetier("Dossier introuvable.");
      if (!dossier.payeLe) {
        throw new ErreurMetier("Ce dossier n'est pas marqué payé.");
      }

      // Garde CONDITIONNELLE (concurrence) : payeLe re-vérifié DANS
      // l'écriture — deux clics simultanés ne journalisent qu'une fois.
      const { count } = await tx.dossier.updateMany({
        where: {
          id: dossier.id,
          organisationId: user.organisationId,
          payeLe: { not: null },
        },
        data: { payeLe: null },
      });
      if (count === 0) {
        throw new ErreurMetier("Ce dossier n'est pas marqué payé.");
      }
      await enregistrerEvenement(tx, {
        dossierId,
        type: "PAIEMENT_ANNULE",
        acteurId: user.id,
      });
    });
  } catch (e) {
    return { error: messageFromError(e) };
  }

  revaliderFinances(dossierId, user.organisationId);
  return { error: null };
}
