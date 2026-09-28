import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { perimetreLectureVisite } from "@/lib/visites";

// Titre d'onglet des pages visite : « {client} — {vue} ». Même périmètre que
// chargerVisitePourLecture (liste blanche de rôles), en requête MINIMALE ;
// getCurrentUser() est déjà cache()-isé. Jamais de redirect/notFound ici : les
// guards restent dans les pages — introuvable → titre générique.
export async function titreVisite(id: string, vue: string): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user) return { title: vue };
  const perimetre = perimetreLectureVisite(user);
  if (!perimetre) return { title: vue };
  const visite = await prisma.visite.findFirst({
    where: { id, ...perimetre },
    select: { dossier: { select: { nomClient: true } } },
  });
  return { title: visite ? `${visite.dossier.nomClient} — ${vue}` : vue };
}
