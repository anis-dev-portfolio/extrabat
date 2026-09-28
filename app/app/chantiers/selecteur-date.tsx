"use client";

import { useRouter } from "next/navigation";
import { SelecteurDate as SelecteurDateGenerique } from "@/components/ui/selecteur-date";

// Saut direct à une date : navigue vers la semaine contenant le jour choisi,
// via le même param ?date= que les flèches ±7 j (fenetreSemaine côté serveur
// recale sur le lundi). Wrapper mince : page.tsx est un composant serveur,
// incapable de passer un callback au composant générique.
export function SelecteurDate({ valeur }: { valeur: string }) {
  const router = useRouter();
  return (
    <SelecteurDateGenerique
      valeur={valeur}
      panneauADroite
      onDate={(jour) => router.push(`/app/chantiers?date=${jour}`)}
    />
  );
}
