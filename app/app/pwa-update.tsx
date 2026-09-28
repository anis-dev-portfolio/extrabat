"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { attendreEcrituresLocales } from "@/lib/brouillon";

// Un nouveau service worker peut prendre le contrôle d'une PWA déjà ouverte
// sans remplacer le JavaScript actuellement en mémoire. Sur iOS, l'app peut
// rester suspendue longtemps : on vérifie explicitement les mises à jour aux
// signaux de vie et on recharge UNE fois après le changement de contrôleur.
// IndexedDB n'est jamais effacé : brouillons et envois en attente survivent.
//
// Le rechargement n'est JAMAIS immédiat quand l'app est à l'écran : le
// nouveau worker s'installe en quelques secondes après le retour dans l'app,
// souvent pile quand le conducteur a commencé à taper son compte-rendu — le
// recharger à ce moment lui arrachait le clavier et la frappe en cours. Il
// est reporté au prochain moment neutre : navigation vers une autre page, ou
// retour dans l'app après l'avoir quittée.
// Attend d'abord la fin des écritures IndexedDB en vol (autosave vidé au
// démontage de la page ou au passage en arrière-plan, photo de plusieurs Mo,
// reconnexion après suspension iOS) — un rechargement les annulerait —, avec
// un plafond pour ne jamais bloquer la mise à jour.
let rechargeLancee = false;
function recharger() {
  if (rechargeLancee) return;
  rechargeLancee = true;
  void attendreEcrituresLocales().then(() => window.location.reload());
}

export function MiseAJourPwa() {
  const pathname = usePathname();
  const rechargeEnAttenteRef = useRef(false);
  const cheminInitialRef = useRef(pathname);

  // Navigation : la page quittée a vidé son autosave au démontage (écriture
  // attendue par recharger()).
  useEffect(() => {
    if (pathname === cheminInitialRef.current) return;
    cheminInitialRef.current = pathname;
    if (rechargeEnAttenteRef.current) recharger();
  }, [pathname]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const avaitControleur = navigator.serviceWorker.controller !== null;

    const surNouveauControleur = () => {
      // Pas de reload lors de la toute première installation du worker.
      if (!avaitControleur) return;
      rechargeEnAttenteRef.current = true;
    };

    const verifier = () => {
      void navigator.serviceWorker
        .getRegistration()
        .then((registration) => registration?.update())
        .catch((err) => console.error("Vérification mise à jour PWA :", err));
    };

    const surVisibilite = () => {
      if (document.visibilityState !== "visible") return;
      // Retour dans l'app : rien n'est en cours de saisie, moment neutre.
      // (L'autosave vidé au passage en arrière-plan est attendu.)
      if (rechargeEnAttenteRef.current) {
        recharger();
        return;
      }
      verifier();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      surNouveauControleur,
    );
    window.addEventListener("pageshow", verifier);
    window.addEventListener("online", verifier);
    document.addEventListener("visibilitychange", surVisibilite);
    verifier();

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        surNouveauControleur,
      );
      window.removeEventListener("pageshow", verifier);
      window.removeEventListener("online", verifier);
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, []);

  return null;
}
