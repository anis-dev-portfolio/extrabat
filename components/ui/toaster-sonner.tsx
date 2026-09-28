"use client";

import { useEffect } from "react";
import { Toaster as SonnerToaster, toast } from "sonner";

// Chargé PARESSEUSEMENT par components/ui/toaster.tsx (proxy sans import
// statique de sonner). Le <Toaster> de sonner démarre vide et ne relit pas
// l'état module au montage : un toast émis avant l'arrivée de ce chunk (cas
// typique : ?succes= toasté dès l'hydratation après un redirect() serveur)
// serait perdu. Le rattrapage rejoue donc les toasts actifs une fois monté.
// Les effets du composant enfant (l'abonnement du SonnerToaster) tournent
// avant celui-ci, et re-publier un id déjà affiché est une mise à jour
// idempotente chez sonner — jamais un doublon.
export default function ToasterCharge() {
  useEffect(() => {
    for (const t of toast.getToasts()) {
      if ("dismiss" in t) continue; // ToastToDismiss : rien à rejouer
      if (
        typeof t.title === "string" &&
        (t.type === "success" || t.type === "info" || t.type === "error")
      ) {
        toast[t.type](t.title, { id: t.id });
      }
    }
  }, []);

  return <SonnerToaster position="top-center" richColors closeButton />;
}
