"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Segmented } from "@/components/ui/tabs";
import { Select } from "@/components/ui/field";
import { SelecteurDate } from "@/components/ui/selecteur-date";
import { useNavigationFiltres } from "@/components/ui/zone-filtres";
import { cn } from "@/lib/ui";

type VuePlanning = "mois" | "semaine" | "jour";

const LIBELLES_NAV: Record<VuePlanning, { precedent: string; suivant: string }> =
  {
    mois: { precedent: "Mois précédent", suivant: "Mois suivant" },
    semaine: { precedent: "Semaine précédente", suivant: "Semaine suivante" },
    jour: { precedent: "Jour précédent", suivant: "Jour suivant" },
  };

// Contrôles du planning : tout passe par les searchParams (re-render serveur),
// aucune donnée n'est calculée côté client.
export function FiltresPlanning({
  vue,
  dateCourante,
  conducteurId,
  conducteurs,
  datePrecedente,
  dateSuivante,
}: {
  vue: VuePlanning;
  dateCourante: string;
  conducteurId: string; // "" = tous
  conducteurs: { id: string; nom: string }[];
  datePrecedente: string;
  dateSuivante: string;
}) {
  // Transition partagée avec la page (ZoneFiltres) : flèches/vue/conducteur
  // estompent la grille pendant le re-render serveur — feedback immédiat.
  const { naviguer: remplacerUrl } = useNavigationFiltres();

  function naviguer(patch: {
    date?: string | null; // null = retour à aujourd'hui (param omis)
    vue?: VuePlanning;
    conducteur?: string;
  }) {
    const params = new URLSearchParams();
    const date = patch.date === undefined ? dateCourante : patch.date;
    if (date) params.set("date", date);
    params.set("vue", patch.vue ?? vue);
    const conducteur = patch.conducteur ?? conducteurId;
    if (conducteur) params.set("conducteur", conducteur);
    remplacerUrl(`/app/planning?${params.toString()}`);
  }

  const boutonNav =
    "flex size-10 cursor-pointer items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-600 shadow-xs transition-colors hover:bg-neutral-100 hover:text-neutral-900";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={LIBELLES_NAV[vue].precedent}
          onClick={() => naviguer({ date: datePrecedente })}
          className={boutonNav}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => naviguer({ date: null })}
          className={cn(boutonNav, "w-auto px-3 text-sm font-medium")}
        >
          Aujourd&apos;hui
        </button>
        <button
          type="button"
          aria-label={LIBELLES_NAV[vue].suivant}
          onClick={() => naviguer({ date: dateSuivante })}
          className={boutonNav}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
        {/* Saut direct à une date : même param ?date= que les flèches — la
            page recale sur le jour / la semaine / le mois selon la vue. */}
        <SelecteurDate
          valeur={dateCourante}
          onDate={(jour) => naviguer({ date: jour })}
          className={cn(
            boutonNav,
            "w-auto px-2.5 text-sm font-medium tabular-nums",
          )}
        />
      </div>

      <Segmented
        ariaLabel="Vue du planning"
        options={[
          { valeur: "mois", label: "Mois" },
          { valeur: "semaine", label: "Semaine" },
          { valeur: "jour", label: "Jour" },
        ]}
        valeur={vue}
        onChange={(v) => naviguer({ vue: v })}
      />

      <Select
        aria-label="Filtrer par conducteur"
        value={conducteurId}
        onChange={(v) => naviguer({ conducteur: v })}
        className="w-auto min-w-44"
      >
        <option value="">Tous les conducteurs</option>
        {conducteurs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
          </option>
        ))}
      </Select>
    </div>
  );
}
