"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import {
  Calendrier,
  PanneauCalendrier,
  afficherFr,
  moisDeCle,
  usePopover,
  type MoisAffiche,
} from "@/components/ui/date-picker";
import { cn } from "@/lib/ui";

// Champ « saut direct à une date » générique (chantiers, planning) : remonte
// le jour choisi (YYYY-MM-DD) via onDate, l'appelant décide de la navigation.
// Le calendrier maison remplace le picker natif du navigateur — même panneau
// que DatePicker/DateRangePicker (look unifié). `className` par défaut =
// style historique de la barre Chantiers, surchargé par le planning pour
// s'aligner sur ses boutons de navigation.
export function SelecteurDate({
  valeur,
  onDate,
  ariaLabel = "Aller à une date",
  panneauADroite = false,
  // NB : le className fournit le display flex (cn ne fusionne pas les
  // conflits) ; seul le gap est garanti par le composant.
  className = "inline-flex h-8 cursor-pointer items-center rounded-md border border-neutral-300 bg-white px-2 text-sm font-medium text-neutral-800 shadow-xs transition-colors tabular-nums hover:bg-neutral-100",
}: {
  valeur: string;
  onDate: (jour: string) => void;
  ariaLabel?: string;
  // Aligne le panneau sur le bord droit (barres d'outils alignées à droite).
  panneauADroite?: boolean;
  className?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [mois, setMois] = useState<MoisAffiche | null>(null);
  const ref = usePopover(() => setOuvert(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        onClick={() => {
          if (!ouvert) setMois(moisDeCle(valeur));
          setOuvert(!ouvert);
        }}
        className={cn("gap-1.5", className)}
      >
        <CalendarRange
          className="size-4 shrink-0 text-neutral-400"
          aria-hidden="true"
        />
        {afficherFr(valeur)}
      </button>

      {ouvert && mois && (
        <PanneauCalendrier aDroite={panneauADroite}>
          <Calendrier
            mois={mois}
            onChangerMois={setMois}
            selection={valeur}
            onChoisir={(jour) => {
              setOuvert(false);
              if (jour !== valeur) onDate(jour);
            }}
          />
        </PanneauCalendrier>
      )}
    </div>
  );
}
