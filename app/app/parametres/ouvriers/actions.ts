"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireRoleActif, BACK_OFFICE_ROLES } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { messageFromError } from "@/lib/erreurs";
import { genererMotDePasseOuvrier } from "@/lib/ouvrier-acces";
import {
  LIMITES,
  champOptionnel,
  champRequis,
  emailValide,
  plageJours,
  telephoneValide,
  texte,
} from "@/lib/validation";

export type OuvrierState = { error: string | null; ok: boolean };

const CHEMIN = "/app/parametres/ouvriers";

// Vérifie que l'ouvrier ciblé appartient à l'organisation — le scoping org
// des absences passe par lui (même logique que conducteurDeLOrg côté visites).
async function ouvrierDeLOrg(
  organisationId: string,
  ouvrierId: string,
): Promise<boolean> {
  if (!ouvrierId) return false;
  const ouvrier = await prisma.ouvrier.findFirst({
    where: { id: ouvrierId, organisationId },
    select: { id: true },
  });
  return ouvrier !== null;
}

// Ajoute un ouvrier (nom requis, téléphone facultatif). Pas de compte
// applicatif : l'ouvrier ne se connecte jamais, il reçoit une fiche imprimée.
export async function ajouterOuvrier(
  _prev: OuvrierState,
  formData: FormData,
): Promise<OuvrierState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error, ok: false };
  const { user } = garde;

  const nom = texte(formData, "nom");
  const telephone = texte(formData, "telephone");

  const invalide =
    champRequis(nom, LIMITES.NOM, "Le nom") ??
    (telephone && !telephoneValide(telephone)
      ? `Le téléphone est invalide (${LIMITES.TELEPHONE} caractères max).`
      : null);
  if (invalide) return { error: invalide, ok: false };

  try {
    await prisma.ouvrier.create({
      data: {
        nom,
        telephone: telephone || null,
        organisationId: user.organisationId,
      },
    });
  } catch (e) {
    return { error: messageFromError(e), ok: false };
  }

  revalidatePath(CHEMIN);
  return { error: null, ok: true };
}

// Active/désactive un ouvrier. Un ouvrier inactif disparaît des listes
// d'affectation et du Gantt, mais son historique de chantiers reste intact —
// c'est la « suppression » normale d'un ouvrier parti.
export async function basculerActifOuvrier(
  formData: FormData,
): Promise<{ error: string | null }> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Ouvrier introuvable." };
  // Le bouton envoie la valeur CIBLE (inverse de l'état qu'il affichait) —
  // pas de lecture puis inversion côté serveur, qui serait sujette aux
  // doubles clics rapides (TOCTOU).
  const actifBrut = String(formData.get("actif") ?? "");
  if (actifBrut !== "true" && actifBrut !== "false") {
    return { error: "Requête invalide." };
  }
  const actifCible = actifBrut === "true";

  // Update conditionnel : ne bascule que si l'ouvrier est encore dans l'état
  // que le bouton affichait. Un second clic concurrent ne matche plus rien —
  // idempotent, sans transaction interactive.
  const { count } = await prisma.ouvrier.updateMany({
    where: { id, organisationId: user.organisationId, actif: !actifCible },
    data: { actif: actifCible },
  });

  if (count === 0) {
    // Soit l'ouvrier est déjà dans l'état cible (clic concurrent : succès
    // idempotent), soit il n'existe pas / n'est pas dans l'org.
    const dejaCible = await prisma.ouvrier.findFirst({
      where: { id, organisationId: user.organisationId, actif: actifCible },
      select: { id: true },
    });
    if (!dejaCible) return { error: "Ouvrier introuvable." };
  }

  revalidatePath(CHEMIN);
  return { error: null };
}

// Suppression réelle : uniquement si l'ouvrier n'a JAMAIS été affecté à un
// chantier (sinon on casserait l'historique — désactiver à la place). Ses
// absences partent en cascade ; son entrée d'accès (MembreAutorise) est
// retirée dans la même transaction — jamais d'autorisation OUVRIER orpheline
// qui provisionnerait un compte sans fiche.
export async function supprimerOuvrier(
  formData: FormData,
): Promise<{ error: string | null }> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Ouvrier introuvable." };

  const affectations = await prisma.affectationChantier.count({
    where: {
      ouvrierId: id,
      ouvrier: { organisationId: user.organisationId },
    },
  });
  if (affectations > 0) {
    return {
      error:
        "Cet ouvrier est (ou a été) affecté à un chantier : désactivez-le plutôt que de le supprimer.",
    };
  }

  let count = 0;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.membreAutorise.deleteMany({
        where: { ouvrierId: id, organisationId: user.organisationId },
      });
      count = (
        await tx.ouvrier.deleteMany({
          where: { id, organisationId: user.organisationId },
        })
      ).count;
    });
  } catch (e) {
    return { error: messageFromError(e) };
  }

  revalidatePath(CHEMIN);
  return count === 0 ? { error: "Cet ouvrier a déjà été supprimé." } : { error: null };
}

/* ── Accès à l'application (compte ouvrier) ─────────────────────────── */

// `motDePasse` n'est rempli qu'en cas de succès : c'est la SEULE fois où il
// est visible (jamais stocké en clair — lib/ouvrier-acces.ts).
export type AccesOuvrierState = OuvrierState & { motDePasse: string | null };

function echecAcces(error: string): AccesOuvrierState {
  return { error, ok: false, motDePasse: null };
}

// Donne l'accès app à une fiche ouvrier : crée le compte Supabase Auth (mot
// de passe PROPRE à cet ouvrier, tiré au hasard, confirmé d'office — pas de
// mail d'invitation à ouvrir sur un chantier) PUIS le MembreAutorise(email,
// OUVRIER, ouvrierId). C'est LA porte d'entrée des comptes ouvriers — jamais
// par la page Utilisateurs (qui créerait des comptes OUVRIER orphelins, sans
// fiche liée) : ancrée sur la fiche, la liaison est garantie par construction.
// La ligne User (DB) naît à la 1re connexion (provisioning lib/auth.ts, qui
// pose Ouvrier.userId dans la même transaction) — le compte AUTH, lui, existe
// dès cette action : l'ouvrier peut se connecter tout de suite.
// Pas de revalidatePath ici : la page basculerait aussitôt sur « Prêt à se
// connecter » et démonterait le formulaire qui affiche le mot de passe. Le
// client rafraîchit lui-même quand l'assistante a noté le mot de passe.
export async function donnerAccesOuvrier(
  _prev: AccesOuvrierState,
  formData: FormData,
): Promise<AccesOuvrierState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return echecAcces(garde.error);
  const { user } = garde;

  const ouvrierId = String(formData.get("ouvrierId") ?? "");
  const email = texte(formData, "email").toLowerCase();

  if (!emailValide(email)) return echecAcces("Email invalide.");

  const ouvrier = await prisma.ouvrier.findFirst({
    where: { id: ouvrierId, organisationId: user.organisationId },
    select: { id: true, nom: true, actif: true, userId: true, membreAutorise: true },
  });
  if (!ouvrier) return echecAcces("Ouvrier invalide.");
  if (!ouvrier.actif) {
    return echecAcces(
      "Cet ouvrier est désactivé : réactivez-le avant de donner un accès.",
    );
  }
  if (ouvrier.userId || ouvrier.membreAutorise) {
    return echecAcces("Cet ouvrier a déjà un accès.");
  }

  // L'email ne doit être autorisé nulle part ailleurs (autre personne, autre
  // organisation) — même verrou que la page Utilisateurs.
  const existant = await prisma.membreAutorise.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existant) return echecAcces("Cet email est déjà autorisé.");

  // Compte Auth AVANT le MembreAutorise : si la création échoue, on ne laisse
  // pas une autorisation « fantôme » qui bloquerait un nouvel essai (le champ
  // ouvrier.membreAutorise ferait croire qu'un accès existe déjà).
  const motDePasse = genererMotDePasseOuvrier();
  const { error: erreurAuth } = await getSupabaseAdmin().auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
    user_metadata: { nom: ouvrier.nom },
  });
  if (erreurAuth) {
    console.error("donnerAccesOuvrier : échec createUser Supabase :", erreurAuth);
    return echecAcces(
      "Cet email a déjà un compte existant ailleurs : utilisez un autre email.",
    );
  }

  try {
    await prisma.membreAutorise.create({
      data: {
        email,
        role: "OUVRIER",
        organisationId: user.organisationId,
        ouvrierId: ouvrier.id,
      },
    });
  } catch (e) {
    return echecAcces(messageFromError(e));
  }

  return { error: null, ok: true, motDePasse };
}

export type NouveauMotDePasseResultat = {
  error: string | null;
  motDePasse: string | null;
};

// Retrouve l'id Auth d'un compte jamais connecté (pas encore de ligne User,
// seulement son MembreAutorise). L'API admin de Supabase ne filtre pas par
// email : parcours paginé et borné — une seule page à l'échelle d'une PME.
async function idCompteAuthParEmail(email: string): Promise<string | null> {
  const admin = getSupabaseAdmin().auth.admin;
  const PAR_PAGE = 1000;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: PAR_PAGE });
    if (error) throw error;
    const compte = data.users.find((u) => u.email?.toLowerCase() === email);
    if (compte) return compte.id;
    if (data.users.length < PAR_PAGE) return null;
  }
  return null;
}

// Tire un nouveau mot de passe pour un compte ouvrier existant (mot de passe
// perdu, ou compte créé du temps du mot de passe partagé) : l'ancien cesse
// aussitôt de fonctionner. Comme le changement de mot de passe, jamais bloqué
// par un abonnement suspendu (requireRole nu, pas requireRoleActif) : fermer
// un accès compromis ne se prend pas en otage.
export async function nouveauMotDePasseOuvrier(
  ouvrierId: string,
): Promise<NouveauMotDePasseResultat> {
  const user = await requireRole(BACK_OFFICE_ROLES);
  if (!ouvrierId) return { error: "Ouvrier invalide.", motDePasse: null };

  const ouvrier = await prisma.ouvrier.findFirst({
    where: { id: ouvrierId, organisationId: user.organisationId },
    select: { userId: true, membreAutorise: { select: { email: true } } },
  });
  if (!ouvrier) return { error: "Ouvrier invalide.", motDePasse: null };

  try {
    // Déjà connecté une fois : User.id = id Auth (même uuid, lib/auth.ts).
    const idAuth =
      ouvrier.userId ??
      (ouvrier.membreAutorise
        ? await idCompteAuthParEmail(ouvrier.membreAutorise.email)
        : null);
    if (!idAuth) {
      return {
        error: "Cet ouvrier n'a pas d'accès à l'application.",
        motDePasse: null,
      };
    }

    const motDePasse = genererMotDePasseOuvrier();
    const { error } = await getSupabaseAdmin().auth.admin.updateUserById(
      idAuth,
      { password: motDePasse },
    );
    if (error) throw error;
    return { error: null, motDePasse };
  } catch (e) {
    console.error("nouveauMotDePasseOuvrier : échec Supabase Auth :", e);
    return {
      error: "Le mot de passe n'a pas pu être changé. Réessayez.",
      motDePasse: null,
    };
  }
}

// Retire l'accès app d'une fiche ouvrier. Deux situations :
// - compte jamais créé (1re connexion pas encore faite) : on retire l'entrée
//   MembreAutorise, l'email ne pourra plus se connecter — retour à zéro ;
// - compte déjà provisionné (Ouvrier.userId posé) : l'entrée d'autorisation
//   ne sert plus à rien, la coupure d'accès passe par la DÉSACTIVATION de la
//   fiche (requireOuvrier/garderOuvrier exigent actif) — on retire quand même
//   l'entrée pour garder la liste propre.
export async function retirerAccesOuvrier(
  formData: FormData,
): Promise<{ error: string | null }> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;
  // `id` = id de la FICHE ouvrier (convention BoutonSupprimer).
  const ouvrierId = String(formData.get("id") ?? "");
  if (!ouvrierId) return { error: "Ouvrier introuvable." };

  const { count } = await prisma.membreAutorise.deleteMany({
    where: { ouvrierId, organisationId: user.organisationId },
  });

  revalidatePath(CHEMIN);
  return count === 0
    ? { error: "Cet accès a déjà été retiré." }
    : { error: null };
}

// Ajoute une absence en jours entiers (début et fin inclus, minuit Paris) —
// mêmes conventions que les absences conducteur.
export async function ajouterAbsenceOuvrier(
  _prev: OuvrierState,
  formData: FormData,
): Promise<OuvrierState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error, ok: false };
  const { user } = garde;

  const ouvrierId = String(formData.get("ouvrierId") ?? "");
  const plage = plageJours(formData);
  const motif = texte(formData, "motif");

  if (!(await ouvrierDeLOrg(user.organisationId, ouvrierId))) {
    return { error: "Ouvrier invalide.", ok: false };
  }
  if ("error" in plage) return { error: plage.error, ok: false };
  const invalideMotif = champOptionnel(motif, LIMITES.MOTIF, "Le motif");
  if (invalideMotif) return { error: invalideMotif, ok: false };

  try {
    await prisma.absenceOuvrier.create({
      data: {
        ouvrierId,
        dateDebut: plage.dateDebut,
        dateFin: plage.dateFin,
        motif: motif || null,
      },
    });
  } catch (e) {
    return { error: messageFromError(e), ok: false };
  }

  revalidatePath(CHEMIN);
  return { error: null, ok: true };
}

// Retire une absence (scopée à l'org via l'ouvrier). Un deleteMany à 0 ligne
// ne doit pas passer pour un succès.
export async function retirerAbsenceOuvrier(
  formData: FormData,
): Promise<{ error: string | null }> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Absence introuvable." };

  const { count } = await prisma.absenceOuvrier.deleteMany({
    where: { id, ouvrier: { organisationId: user.organisationId } },
  });

  revalidatePath(CHEMIN);
  return count === 0
    ? { error: "Cette absence a déjà été retirée." }
    : { error: null };
}
