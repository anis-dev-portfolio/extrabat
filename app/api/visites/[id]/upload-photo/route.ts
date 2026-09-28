import { NextResponse } from "next/server";
import { creerUrlUploadPhoto } from "@/lib/envoi-compte-rendu";
import { garderConducteur } from "../garde";

// Mine une URL signée d'upload pour UNE photo de la visite (le navigateur
// uploade ensuite en direct vers le Storage). Même raison d'être route
// handler que compte-rendu/ : URL stable entre déploiements pour le rejeu
// hors-ligne.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const garde = await garderConducteur(req);
  if ("reponse" in garde) return garde.reponse;

  const { id } = await params;
  return NextResponse.json(await creerUrlUploadPhoto(garde.user, id));
}
