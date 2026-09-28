"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/toaster";

// Toast de succès des mutations qui se terminent par un redirect() serveur
// (le client ne voit jamais le retour de l'action) : l'action redirige vers
// `?succes=<code>`, ce composant toaste le message correspondant puis nettoie
// l'URL. Règle des deux canaux : action qui redirect() → `?succes=` ; action
// attendue côté client (useActionState / await) → toast direct au retour.
const MESSAGES: Record<string, string> = {
  "dossier-cree": "Dossier créé. Vous pouvez planifier la première visite.",
  "visite-planifiee": "Visite planifiée.",
  "visite-replanifiee": "Visite replanifiée.",
  "compte-rendu-saisi": "Compte-rendu enregistré.",
  "empechement-signale":
    "Empêchement signalé. Le bureau planifiera une nouvelle visite.",
  "chantier-cree": "Chantier créé — le dossier passe « En chantier ».",
  "chantier-modifie": "Chantier modifié.",
  "chantier-supprime": "Chantier supprimé — le dossier redevient « Prêt pour travaux ».",
  "dossier-supprime": "Dossier supprimé définitivement.",
};

function ToastDepuisUrl() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  // Anti double-toast : l'effet peut se rejouer (Strict Mode) avant que le
  // nettoyage d'URL ne soit reflété dans searchParams. Réinitialisé dès que
  // le code disparaît, pour que deux succès identiques d'affilée toastent bien.
  const traite = useRef<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("succes");
    if (!code) {
      traite.current = null;
      return;
    }

    if (traite.current !== code) {
      traite.current = code;
      const message = MESSAGES[code];
      if (message) toast.success(message);
    }

    // Nettoyage d'URL SANS navigation (history.replaceState est synchronisé
    // par le router App Router) : pas de second rendu serveur de la page
    // fraîchement chargée, et pas de course avec les filtres qui écrivent
    // eux-mêmes les searchParams.
    const params = new URLSearchParams(searchParams);
    params.delete("succes");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }, [searchParams, pathname]);

  return null;
}

// useSearchParams exige une frontière Suspense (rendu statique du layout).
export function ToastSucces() {
  return (
    <Suspense fallback={null}>
      <ToastDepuisUrl />
    </Suspense>
  );
}
