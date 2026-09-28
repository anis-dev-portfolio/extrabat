"use client";

import { cn } from "@/lib/ui";

// Contrôle segmenté (bascules de vue : kanban/liste, semaine/jour…).
// Contrôlé par le parent ; pour une navigation par URL, le parent pousse la
// valeur dans les searchParams.
export function Segmented<T extends string>({
  options,
  valeur,
  onChange,
  ariaLabel,
  className,
}: {
  options: ReadonlyArray<{ valeur: T; label: string }>;
  valeur: T;
  onChange: (valeur: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-neutral-200 bg-neutral-100 p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const actif = option.valeur === valeur;
        return (
          <button
            key={option.valeur}
            type="button"
            aria-pressed={actif}
            onClick={() => onChange(option.valeur)}
            className={cn(
              // py-3 < sm : cible tactile ≥ 44 px sur mobile.
              "cursor-pointer rounded-md px-3 py-3 text-sm font-medium transition-[color,background-color,box-shadow] duration-150 ease-standard sm:py-1.5",
              actif
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
