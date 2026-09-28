"use client";

import { useTransition } from "react";
import { toast } from "@/components/ui/toaster";
import { basculerActifOuvrier } from "./actions";

// Bascule actif/inactif « 1 clic » (réversible, donc sans confirmation).
// Le rafraîchissement vient du revalidatePath de l'action ; isPending
// désactive le bouton pendant le round-trip (plus de clic « mort »).
export function BasculeActif({
  id,
  actif,
  nom,
}: {
  id: string;
  actif: boolean;
  nom: string;
}) {
  const [pending, startTransition] = useTransition();

  function basculer() {
    const fd = new FormData();
    fd.set("id", id);
    // Valeur CIBLE (inverse de l'état affiché) : le serveur ne bascule que si
    // l'ouvrier est encore dans l'état affiché — deux clics rapides ne se
    // marchent plus dessus.
    fd.set("actif", String(!actif));
    startTransition(async () => {
      try {
        const res = await basculerActifOuvrier(fd);
        if (res.error) toast.error(res.error);
        else toast.success(actif ? `${nom} désactivé.` : `${nom} réactivé.`);
      } catch {
        toast.error("Une erreur est survenue. Réessayez.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={basculer}
      disabled={pending}
      className="inline-flex min-h-11 cursor-pointer items-center rounded-md px-2 py-1 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 disabled:pointer-events-none disabled:opacity-50 sm:min-h-0"
    >
      {actif ? "Désactiver" : "Réactiver"}
    </button>
  );
}
