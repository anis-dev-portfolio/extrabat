"use client";

import { CloudUpload, RefreshCw, TriangleAlert } from "lucide-react";
import { useSyncEnvois } from "@/lib/sync";

// Badge d'état d'envoi d'un compte-rendu en file d'attente locale, affiché sur
// les cartes de visite (rendu serveur) : le serveur ne connaît pas la file, ce
// composant client la lit et ne rend rien si la visite n'y est pas.
export function BadgeEnvoi({ visiteId }: { visiteId: string }) {
  const { envois } = useSyncEnvois();
  const envoi = envois.find((e) => e.brouillon.visiteId === visiteId);
  if (!envoi) return null;

  if (envoi.statut === "ERREUR") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
        <TriangleAlert className="size-3.5" aria-hidden="true" />
        Envoi refusé
      </span>
    );
  }
  const envoiEnCours = envoi.statut === "ENVOI";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
      {envoiEnCours ? (
        <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <CloudUpload className="size-3.5" aria-hidden="true" />
      )}
      {envoiEnCours ? "Envoi…" : "En attente d'envoi"}
    </span>
  );
}
