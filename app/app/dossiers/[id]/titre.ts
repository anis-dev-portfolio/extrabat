import type { Metadata } from "next";
import { getCurrentUser, isBackOffice } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Titre d'onglet des pages du dossier : « {client} — {vue} » — utile car les
// fiches s'ouvrent en target="_blank" (ex. lien de doublon à la création).
// Requête MINIMALE scopée org ; getCurrentUser() est déjà cache()-isé, donc
// gratuit en 2ᵉ appel. Jamais de redirect/notFound ici : les guards restent
// dans les pages — introuvable ou non autorisé → titre générique.
export async function titreDossier(id: string, vue: string): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user || !isBackOffice(user.role)) return { title: vue };
  const dossier = await prisma.dossier.findFirst({
    where: { id, organisationId: user.organisationId },
    select: { nomClient: true },
  });
  return { title: dossier ? `${dossier.nomClient} — ${vue}` : vue };
}
