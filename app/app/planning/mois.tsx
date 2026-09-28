import Link from "next/link";
import { cn } from "@/lib/ui";

// Vue mois du planning — composant serveur purement présentationnel : les
// semaines/chips sont précalculées par page.tsx (fuseau Paris compris).
// Interactions : numéro du jour → vue jour à cette date ; chip → fiche
// dossier ; « +n autres » → vue jour.
export type ChipVisite = {
  visiteId: string;
  dossierId: string;
  heureLabel: string; // « 9h30 »
  nomClient: string;
  conducteurNom: string | null; // seulement quand « tous les conducteurs »
};

export type JourMois = {
  cle: string; // YYYY-MM-DD
  numero: number; // jour du mois (1-31)
  horsMois: boolean; // jour des semaines adjacentes, estompé
  aujourdhui: boolean;
  weekend: boolean;
  chips: ChipVisite[];
};

const MAX_CHIPS = 3;

const ENTETES = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

export function GrilleMois({
  semaines,
  conducteurParam,
}: {
  semaines: JourMois[][];
  conducteurParam: string; // filtre conducteur à conserver dans les liens
}) {
  const suffixeConducteur = conducteurParam
    ? `&conducteur=${encodeURIComponent(conducteurParam)}`
    : "";
  const versVueJour = (cle: string) =>
    `/app/planning?vue=jour&date=${cle}${suffixeConducteur}`;

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xs">
      {/* gap-px sur fond gris = filets hairline entre toutes les cellules.
          Print : les fonds ne s'impriment pas → filets rendus par des
          bordures sur les cellules (print:gap-0). */}
      <div className="grid grid-cols-7 gap-px border-b border-neutral-200 bg-neutral-200 print:gap-0">
        {ENTETES.map((j) => (
          <span
            key={j}
            className="bg-white px-2 py-2 text-center text-xs font-medium text-neutral-500 print:border-r print:border-neutral-300 print:text-black"
          >
            {j}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-neutral-200 print:gap-0">
        {semaines.flat().map((jour) => (
          <div
            key={jour.cle}
            className={cn(
              "min-h-28 p-1.5 print:border-r print:border-b print:border-neutral-300",
              jour.aujourdhui
                ? "bg-primary-50"
                : jour.horsMois || jour.weekend
                  ? "bg-neutral-50"
                  : "bg-white",
            )}
          >
            <Link
              href={versVueJour(jour.cle)}
              aria-label={`Ouvrir la vue jour du ${jour.cle}`}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-full text-xs font-medium transition-colors tabular-nums hover:bg-primary-100 hover:text-primary-900 print:text-black",
                jour.aujourdhui
                  ? "bg-primary-600 text-white hover:bg-primary-700 hover:text-white"
                  : jour.horsMois
                    ? "text-neutral-400"
                    : "text-neutral-800",
              )}
            >
              {jour.numero}
            </Link>

            {jour.chips.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {jour.chips.slice(0, MAX_CHIPS).map((chip) => (
                  <Link
                    key={chip.visiteId}
                    href={`/app/dossiers/${chip.dossierId}`}
                    title={`${chip.heureLabel} · ${chip.nomClient}${chip.conducteurNom ? ` · ${chip.conducteurNom}` : ""}`}
                    className={cn(
                      "block truncate rounded border border-blue-200 bg-blue-50 px-1 py-0.5 text-[11px] leading-4 text-blue-900 transition-colors hover:border-blue-300 hover:bg-blue-100 print:border-neutral-400 print:bg-transparent print:text-black",
                      jour.horsMois && "opacity-60",
                    )}
                  >
                    <span className="font-medium tabular-nums">
                      {chip.heureLabel}
                    </span>{" "}
                    {chip.nomClient}
                    {chip.conducteurNom && (
                      <span className="text-blue-700"> · {chip.conducteurNom}</span>
                    )}
                  </Link>
                ))}
                {jour.chips.length > MAX_CHIPS && (
                  <Link
                    href={versVueJour(jour.cle)}
                    className="block px-1 text-[11px] font-medium text-neutral-500 transition-colors hover:text-neutral-800"
                  >
                    +{jour.chips.length - MAX_CHIPS} autre
                    {jour.chips.length - MAX_CHIPS > 1 ? "s" : ""}
                  </Link>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
