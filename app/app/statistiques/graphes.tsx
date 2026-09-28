import { cn } from "@/lib/ui";

// Graphiques de la page Statistiques — composants serveur PUREMENT
// présentationnels (aucun "use client"), calqués sur gantt.tsx : tout est
// précalculé par page.tsx, ici on ne fait que dessiner. Pas de librairie :
// donut en SVG (les vecteurs s'impriment), barres en CSS (bordure + fond pour
// rester lisibles à l'impression, comme les barres du Gantt). Jamais la couleur
// seule → toujours libellé + valeur (daltonisme).

// ── Donut des statuts (pipeline) ─────────────────────────────────────────────

export type SegmentDonut = {
  label: string;
  valeur: number;
  couleur: string; // couleur CSS (ex. « var(--color-blue-500) »)
};

// r tel que la circonférence = 100 → les dasharray s'expriment en % direct.
const R_DONUT = 15.915_494;

export function DonutStatuts({
  segments,
  uniteLegende,
}: {
  segments: SegmentDonut[];
  uniteLegende?: string; // ex. « dossiers » (affiché sous le total central)
}) {
  const total = segments.reduce((s, seg) => s + seg.valeur, 0);

  // Arcs cumulés (offset négatif = on avance le long du tracé, sens horaire
  // après la rotation -90° qui place le départ à midi). Seuls les segments non
  // nuls sont tracés.
  let cumul = 0;
  const arcs = segments.map((seg) => {
    const pct = total > 0 ? (seg.valeur / total) * 100 : 0;
    const arc = { couleur: seg.couleur, pct, offset: -cumul };
    cumul += pct;
    return arc;
  });

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <svg
        viewBox="0 0 42 42"
        className="h-40 w-40 shrink-0 animate-[carte-in_400ms_var(--ease-sortie)] print:animate-none"
        role="img"
        aria-label={`Répartition par statut, ${total} au total`}
      >
        {/* Piste de fond (visible quand vide, et sous les arcs). */}
        <circle
          cx="21"
          cy="21"
          r={R_DONUT}
          fill="none"
          className="stroke-neutral-100"
          strokeWidth="5"
        />
        <g transform="rotate(-90 21 21)">
          {arcs.map((arc, i) =>
            arc.pct > 0 ? (
              <circle
                key={i}
                cx="21"
                cy="21"
                r={R_DONUT}
                fill="none"
                stroke={arc.couleur}
                strokeWidth="5"
                strokeDasharray={`${arc.pct} ${100 - arc.pct}`}
                strokeDashoffset={arc.offset}
              />
            ) : null,
          )}
        </g>
        {/* Total au centre. */}
        <text
          x="21"
          y="20.5"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-neutral-900 text-[7px] font-bold"
          style={{ fontSize: "7px" }}
        >
          {total}
        </text>
        {uniteLegende && (
          <text
            x="21"
            y="25.5"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-neutral-500"
            style={{ fontSize: "3px" }}
          >
            {uniteLegende}
          </text>
        )}
      </svg>

      {/* Légende : pastille + libellé + compte + %. */}
      <ul className="w-full space-y-1.5">
        {segments.map((seg) => {
          const pct = total > 0 ? Math.round((seg.valeur / total) * 100) : 0;
          return (
            <li
              key={seg.label}
              className="flex items-center gap-2.5 text-sm"
            >
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: seg.couleur }}
                aria-hidden="true"
              />
              <span className="flex-1 text-neutral-700">{seg.label}</span>
              <span className="font-semibold text-neutral-900 tabular-nums">
                {seg.valeur}
              </span>
              <span className="w-10 text-right text-xs text-neutral-500 tabular-nums">
                {pct} %
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Barres mensuelles (verticales) ───────────────────────────────────────────

export type BarreMensuelle = { cle: string; label: string; valeur: number };

const TEINTE_BARRE: Record<"emerald" | "neutral", string> = {
  emerald: "border-emerald-600 bg-emerald-500",
  neutral: "border-neutral-500 bg-neutral-400",
};

export function BarresMensuelles({
  items,
  teinte,
  format,
  montrerValeur = false,
}: {
  items: BarreMensuelle[];
  teinte: "emerald" | "neutral";
  format: (valeur: number) => string; // pour le tooltip (et la valeur affichée)
  montrerValeur?: boolean;
}) {
  const max = Math.max(...items.map((i) => i.valeur), 1);
  const HAUTEUR = 132; // px

  return (
    <div className="scrollbar-fin overflow-x-auto">
      <div className="flex min-w-full items-end gap-1.5 px-1">
        {items.map((item, i) => {
          const h = Math.round((item.valeur / max) * HAUTEUR);
          return (
            <div
              key={item.cle}
              className="flex min-w-8 flex-1 flex-col items-center gap-1"
              title={`${item.label} : ${format(item.valeur)}`}
            >
              {montrerValeur && (
                <span className="text-[10px] font-medium text-neutral-500 tabular-nums">
                  {item.valeur > 0 ? item.valeur : ""}
                </span>
              )}
              {/* Colonne à hauteur fixe : la barre pousse depuis le bas. */}
              <div
                className="flex w-full items-end justify-center"
                style={{ height: HAUTEUR }}
              >
                <div
                  className={cn(
                    "w-full max-w-9 rounded-t border-t border-r border-l",
                    "origin-bottom animate-[barre-monte_500ms_var(--ease-sortie)_backwards] print:animate-none",
                    item.valeur > 0
                      ? TEINTE_BARRE[teinte]
                      : "border-neutral-200 bg-neutral-100",
                  )}
                  // min 3px : un mois à 0 reste visible (barre-souche).
                  style={{
                    height: Math.max(h, item.valeur > 0 ? 4 : 3),
                    animationDelay: `${Math.min(i, 10) * 30}ms`,
                  }}
                />
              </div>
              <span className="w-full truncate text-center text-[10px] text-neutral-500">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Barres horizontales (buckets / départements) ─────────────────────────────

export type TonBarre = "vert" | "ambre" | "rouge" | "neutre";

const TEINTE_H: Record<TonBarre, string> = {
  vert: "border-emerald-600 bg-emerald-500",
  ambre: "border-amber-600 bg-amber-400",
  rouge: "border-red-600 bg-red-500",
  neutre: "border-primary-600 bg-primary-400",
};

export type BarreHorizontale = {
  label: string;
  valeur: number;
  detail?: string; // texte affiché à droite (ex. « 12 · 40 % »)
  ton?: TonBarre;
};

export function BarresHorizontales({
  items,
  format = (n) => String(n),
}: {
  items: BarreHorizontale[];
  format?: (valeur: number) => string;
}) {
  const max = Math.max(...items.map((i) => i.valeur), 1);
  return (
    <ul className="space-y-2">
      {items.map((item, i) => {
        const largeur = Math.round((item.valeur / max) * 100);
        return (
          <li key={item.label} className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0 truncate text-neutral-600" title={item.label}>
              {item.label}
            </span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-neutral-100">
              <div
                className={cn(
                  "h-full rounded border-r",
                  "origin-left animate-[barre-etend_500ms_var(--ease-sortie)_backwards] print:animate-none",
                  TEINTE_H[item.ton ?? "neutre"],
                )}
                // min 2% quand > 0 : une petite valeur reste visible.
                style={{
                  width: `${item.valeur > 0 ? Math.max(largeur, 2) : 0}%`,
                  animationDelay: `${Math.min(i, 10) * 30}ms`,
                }}
              />
            </div>
            <span className="w-24 shrink-0 text-right text-xs text-neutral-600 tabular-nums">
              {item.detail ?? format(item.valeur)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
