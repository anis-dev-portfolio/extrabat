"use client";

import { useRouter } from "next/navigation";
import { Field, Select } from "@/components/ui/field";

// Choix du conducteur via searchParams (?conducteur=) : re-render serveur de
// la page, pas d'état client à synchroniser.
export function SelecteurConducteur({
  conducteurs,
  valeur,
}: {
  conducteurs: { id: string; nom: string }[];
  valeur: string;
}) {
  const router = useRouter();

  return (
    <Field label="Conducteur" htmlFor="conducteur" className="max-w-xs">
      <Select
        id="conducteur"
        value={valeur}
        onChange={(v) =>
          router.replace(`/app/parametres/disponibilites?conducteur=${v}`)
        }
      >
        {conducteurs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
          </option>
        ))}
      </Select>
    </Field>
  );
}
