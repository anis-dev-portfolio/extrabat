"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleActif, BACK_OFFICE_ROLES } from "@/lib/auth";
import { heureVersMinutes, validerNouvellePlage } from "@/lib/planning";
import { messageFromError } from "@/lib/erreurs";
import { LIMITES, champOptionnel, plageJours, texte } from "@/lib/validation";

export type DispoState = { error: string | null; ok: boolean };

const CHEMIN = "/app/parametres/disponibilites";

// Vérifie que le conducteur ciblé appartient à l'organisation ET a le rôle
// CONDUCTEUR — le scoping org des horaires/absences passe par lui.
async function conducteurDeLOrg(
  organisationId: string,
  conducteurId: string,
): Promise<boolean> {
  if (!conducteurId) return false;
  const conducteur = await prisma.user.findFirst({
    where: { id: conducteurId, organisationId, role: "CONDUCTEUR" },
    select: { id: true },
  });
  return conducteur !== null;
}

// Ajoute une plage horaire récurrente (jour ISO 1–7, minutes depuis minuit).
// Refus si la plage est invalide ou chevauche une plage existante du même jour.
export async function ajouterHoraire(
  _prev: DispoState,
  formData: FormData,
): Promise<DispoState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error, ok: false };
  const { user } = garde;

  const conducteurId = String(formData.get("conducteurId") ?? "");
  const jourSemaine = Number(formData.get("jourSemaine") ?? 0);
  const heureDebut = heureVersMinutes(String(formData.get("heureDebut") ?? ""));
  const heureFin = heureVersMinutes(String(formData.get("heureFin") ?? ""));

  if (!(await conducteurDeLOrg(user.organisationId, conducteurId))) {
    return { error: "Conducteur invalide.", ok: false };
  }
  if (!Number.isInteger(jourSemaine) || jourSemaine < 1 || jourSemaine > 7) {
    return { error: "Jour de la semaine invalide.", ok: false };
  }
  if (heureDebut === null || heureFin === null) {
    return { error: "Heures invalides (format HH:MM).", ok: false };
  }

  const existantes = await prisma.horaireRecurrent.findMany({
    where: { conducteurId, jourSemaine },
    select: { heureDebut: true, heureFin: true },
  });
  const invalide = validerNouvellePlage({ heureDebut, heureFin }, existantes);
  if (invalide) return { error: invalide, ok: false };

  try {
    await prisma.horaireRecurrent.create({
      data: { conducteurId, jourSemaine, heureDebut, heureFin },
    });
  } catch (e) {
    return { error: messageFromError(e), ok: false };
  }

  revalidatePath(CHEMIN);
  return { error: null, ok: true };
}

// Retire une plage horaire (scopée à l'org via le conducteur). Renvoie
// { error } — un deleteMany à 0 ligne ne doit pas passer pour un succès.
export async function retirerHoraire(
  formData: FormData,
): Promise<{ error: string | null }> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Plage introuvable." };

  const { count } = await prisma.horaireRecurrent.deleteMany({
    where: { id, conducteur: { organisationId: user.organisationId } },
  });

  revalidatePath(CHEMIN);
  return count === 0
    ? { error: "Cette plage a déjà été retirée." }
    : { error: null };
}

// Ajoute une absence en jours entiers (début et fin inclus, minuit Paris).
export async function ajouterAbsence(
  _prev: DispoState,
  formData: FormData,
): Promise<DispoState> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error, ok: false };
  const { user } = garde;

  const conducteurId = String(formData.get("conducteurId") ?? "");
  const plage = plageJours(formData);
  const motif = texte(formData, "motif");

  if (!(await conducteurDeLOrg(user.organisationId, conducteurId))) {
    return { error: "Conducteur invalide.", ok: false };
  }
  if ("error" in plage) return { error: plage.error, ok: false };
  const invalideMotif = champOptionnel(motif, LIMITES.MOTIF, "Le motif");
  if (invalideMotif) return { error: invalideMotif, ok: false };

  try {
    await prisma.absence.create({
      data: {
        conducteurId,
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

// Retire une absence (scopée à l'org via le conducteur). Même contrat que
// retirerHoraire.
export async function retirerAbsence(
  formData: FormData,
): Promise<{ error: string | null }> {
  const garde = await requireRoleActif(BACK_OFFICE_ROLES);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Absence introuvable." };

  const { count } = await prisma.absence.deleteMany({
    where: { id, conducteur: { organisationId: user.organisationId } },
  });

  revalidatePath(CHEMIN);
  return count === 0
    ? { error: "Cette absence a déjà été retirée." }
    : { error: null };
}
