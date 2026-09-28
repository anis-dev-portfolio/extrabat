"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { demarrerSync } from "@/lib/sync";

// Démarre le moteur de sync hors-ligne (lib/sync.ts) : file d'attente
// persistante rejouée au lancement, au retour du réseau et au retour au
// premier plan. Monté (invisible) dans le layout /app pour fonctionner quelle
// que soit la page du conducteur.
export function RejeuEnvois() {
  const router = useRouter();

  useEffect(() => {
    demarrerSync(() => router.refresh());
  }, [router]);

  return null;
}
