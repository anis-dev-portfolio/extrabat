import { NextResponse } from "next/server";
import { enregistrerCompteRendu } from "@/lib/envoi-compte-rendu";
import { garderConducteur } from "../garde";

// Ingestion du compte-rendu terrain. Route handler et non Server Action :
// URL STABLE entre déploiements — un envoi mis en file hors-ligne reste
// rejouable même si l'app a été redéployée entre-temps (les IDs de Server
// Actions, eux, meurent à chaque build). Idempotent par visiteId : un rejeu
// dont le premier envoi avait abouti reçoit code DEJA_ENVOYEE (= succès).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const garde = await garderConducteur(req);
  if ("reponse" in garde) return garde.reponse;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Requête illisible (corps attendu : formulaire)." },
      { status: 400 },
    );
  }

  const { id } = await params;
  return NextResponse.json(
    await enregistrerCompteRendu(garde.user, id, formData),
  );
}
