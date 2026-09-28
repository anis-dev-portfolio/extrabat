"use client";

import { useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/ui";
import { TACTILE_MOBILE, boutonClasses } from "@/components/ui/button";
import { marquerToutLu } from "./actions";

// « Tout marquer lu » (réversible côté perception : rien n'est supprimé, donc
// sans confirmation). Le rafraîchissement (pastille de la cloche, tri de la
// liste) vient du revalidatePath de l'action ; isPending désactive le bouton
// pendant le round-trip (plus de clic « mort »). Le marquage unitaire vit dans
// CarteNotification (optimiste).
export function BoutonToutMarquerLu() {
  const [pending, startTransition] = useTransition();

  function marquer() {
    startTransition(async () => {
      try {
        const res = await marquerToutLu();
        if (res.error) toast.error(res.error);
        else toast.success("Toutes les notifications sont marquées lues.");
      } catch {
        toast.error("Une erreur est survenue. Réessayez.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={marquer}
      disabled={pending}
      // Cible tactile ≥ 44 px sur téléphone (terrain : conducteur, ouvrier).
      className={cn(boutonClasses("secondaire", "sm"), TACTILE_MOBILE)}
    >
      <CheckCheck className="size-3.5 shrink-0" aria-hidden="true" />
      {pending ? "Marquage…" : "Tout marquer comme lu"}
    </button>
  );
}
