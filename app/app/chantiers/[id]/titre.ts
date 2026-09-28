import type { Metadata } from "next";
import { getCurrentUser, isBackOffice } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Titre d'onglet des pages du chantier : « {client} — {vue} ». Requête
// MINIMALE scopée org ; getCurrentUser() est déjà cache()-isé. Jamais de
// redirect/notFound ici : les guards restent dans les pages — introuvable ou
// non autorisé → titre générique.
export async function titreChantier(id: string, vue: string): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user || !isBackOffice(user.role)) return { title: vue };
  const chantier = await prisma.chantier.findFirst({
    where: { id, organisationId: user.organisationId },
    select: { dossier: { select: { nomClient: true } } },
  });
  return { title: chantier ? `${chantier.dossier.nomClient} — ${vue}` : vue };
}
