"use client";

import dynamic from "next/dynamic";
// Type-only : effacé à la compilation, n'embarque pas sonner dans le chunk.
import type { ExternalToast } from "sonner";

// Toasts globaux, montés une fois dans le layout /app — mais sonner ne fait
// plus partie du First Load JS commun : ce module est un PROXY sans import
// statique (le layout, toast-succes et lib/sync l'importent tous, donc un
// import statique ici embarquerait sonner dans le chunk partagé de toutes les
// routes /app). `toast.*` charge sonner à la demande — en pratique le chunk
// est déjà là, tiré par le montage du Toaster paresseux juste après
// l'hydratation ; un toast émis AVANT ce montage est rejoué par le rattrapage
// de toaster-sonner.tsx.
// Usage inchangé : import { toast } from "@/components/ui/toaster"
// puis toast.success("Visite planifiée") après retour de la server action.

let sonnerPromise: Promise<typeof import("sonner")> | null = null;
function chargerSonner() {
  return (sonnerPromise ??= import("sonner"));
}

type Niveau = "success" | "info" | "error";

function emettre(niveau: Niveau, message: string, options?: ExternalToast): void {
  void chargerSonner().then((s) => s.toast[niveau](message, options));
}

export const toast = {
  success: (message: string, options?: ExternalToast) =>
    emettre("success", message, options),
  info: (message: string, options?: ExternalToast) =>
    emettre("info", message, options),
  error: (message: string, options?: ExternalToast) =>
    emettre("error", message, options),
};

// ssr:false autorisé : ce module est lui-même un Client Component. Le Toaster
// ne rend rien de visible au premier paint, le différer est sans coût visuel.
export const Toaster = dynamic(() => import("./toaster-sonner"), {
  ssr: false,
});
