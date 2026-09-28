"use client";

import { useRouter } from "next/navigation";
import { Field, Select } from "@/components/ui/field";

// Choix de l'ouvrier via searchParams (?ouvrier=) : re-render serveur de la
// page, pas d'état client à synchroniser (pattern SelecteurConducteur).
export function SelecteurOuvrier({
  ouvriers,
  valeur,
}: {
  ouvriers: { id: string; nom: string; actif: boolean }[];
  valeur: string;
}) {
  const router = useRouter();

  return (
    <Field label="Ouvrier" htmlFor="ouvrier">
      <Select
        id="ouvrier"
        value={valeur}
        onChange={(v) =>
          router.replace(`/app/parametres/ouvriers?ouvrier=${v}`)
        }
      >
        {ouvriers.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nom}
            {o.actif ? "" : " (inactif)"}
          </option>
        ))}
      </Select>
    </Field>
  );
}
