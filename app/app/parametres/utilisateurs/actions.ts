"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleActif } from "@/lib/auth";
import type { Role } from "@/lib/generated/prisma/enums";

export type MembreActionState = { error: string | null; ok: boolean };

const ROLES_VALIDES: Role[] = ["ADMIN", "ASSISTANTE", "CONDUCTEUR"];
// Validation d'email volontairement simple (Supabase Auth revalide de toute façon).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Ajoute (ou met à jour le rôle d') un email autorisé, scopé à l'organisation
// de l'ADMIN connecté. Le rôle est whitelisté ; l'email normalisé en minuscules.
export async function ajouterMembreAutorise(
  _prev: MembreActionState,
  formData: FormData,
): Promise<MembreActionState> {
  const garde = await requireRoleActif(["ADMIN"]);
  if (!garde.ok) return { error: garde.error, ok: false };
  const { user } = garde;

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = String(formData.get("role") ?? "") as Role;

  if (!EMAIL_RE.test(email) || email.length > 200) {
    return { error: "Email invalide.", ok: false };
  }
  if (!ROLES_VALIDES.includes(role)) {
    return { error: "Rôle invalide.", ok: false };
  }

  // Empêche de « voler » un email déjà autorisé dans une AUTRE organisation.
  const existant = await prisma.membreAutorise.findUnique({
    where: { email },
    select: { organisationId: true },
  });
  if (existant && existant.organisationId !== user.organisationId) {
    return { error: "Cet email est déjà autorisé ailleurs.", ok: false };
  }

  await prisma.membreAutorise.upsert({
    where: { email },
    update: { role, organisationId: user.organisationId },
    create: { email, role, organisationId: user.organisationId },
  });

  revalidatePath("/app/parametres/utilisateurs");
  return { error: null, ok: true };
}

// Retire un email de la liste d'autorisation (scopé à l'org de l'ADMIN).
// N'affecte pas un User déjà provisionné ; empêche seulement une future 1re
// connexion sous cet email. Renvoie { error } pour que le client ne toaste
// pas un succès sur un deleteMany à 0 ligne (déjà retiré dans un autre onglet).
export async function retirerMembreAutorise(
  formData: FormData,
): Promise<{ error: string | null }> {
  const garde = await requireRoleActif(["ADMIN"]);
  if (!garde.ok) return { error: garde.error };
  const { user } = garde;
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Entrée introuvable." };

  const { count } = await prisma.membreAutorise.deleteMany({
    where: { id, organisationId: user.organisationId },
  });

  revalidatePath("/app/parametres/utilisateurs");
  return count === 0 ? { error: "Cet email a déjà été retiré." } : { error: null };
}
