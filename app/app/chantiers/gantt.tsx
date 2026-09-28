import Link from "next/link";
import type { EtatChantier } from "@/lib/chantiers";
import { cn } from "@/lib/ui";

// Gantt semaine — composant serveur purement présentationnel : tout est
// précalculé par page.tsx (colonnes de jours, barres clippées, lanes),
// même philosophie que la grille du planning visites. Lignes = ouvriers,
// colonnes = lun→dim, barres multi-jours cliquables vers la fiche chantier.

export type JourColonne = {
  cle: string; // YYYY-MM-DD
  label: string; // « lun. 6 juil. »
  aujourdhui: boolean;
  weekend: boolean;
};

export type BarreChantier = {
  chantierId: string;
  nomClient: string;
  title: string; // tooltip natif : client + période + co-équipiers + alerte
  colDebut: number; // 0..6
  colFin: number; // 0..6 (inclus)
  clampGauche: boolean; // continue avant la semaine affichée
  clampDroite: boolean; // continue après
  etat: EtatChantier;
  conflit: boolean; // chevauche une autre barre de la même ligne (surbooking)
  lane: number;
};

export type ZoneAbsence = {
  colDebut: number;
  colFin: number;
  title: string;
};

export type LigneOuvrier = {
  ouvrierId: string;
  nom: string;
  actif: boolean;
  lanes: number; // hauteur de la ligne (barres empilées)
  barres: BarreChantier[];
  absences: ZoneAbsence[];
};

// Teintes par état dérivé — bordure + fond léger + texte foncé : lisible à
// l'écran ET à l'impression (un fond seul ne s'imprime pas par défaut).
const BARRE_UI: Record<EtatChantier, string> = {
  A_VENIR: "border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100",
  EN_COURS: "border-orange-300 bg-orange-100/70 text-orange-900 hover:bg-orange-100",
  A_CLOTURER: "border-red-300 bg-red-50 text-red-900 hover:bg-red-100",
  TERMINE: "border-green-300 bg-green-50 text-green-900/80 hover:bg-green-100",
};

const HACHURES =
  "repeating-linear-gradient(-45deg, transparent, transparent 7px, rgba(0,0,0,0.035) 7px, rgba(0,0,0,0.035) 14px)";

export function GanttSemaine({
  jours,
  lignes,
}: {
  jours: JourColonne[];
  lignes: LigneOuvrier[];
}) {
  return (
    <div className="scrollbar-fin overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-xs print:overflow-visible print:shadow-none">
      {/* min-w : lisible à l'écran avec scroll ; en impression la page
          paysage absorbe tout, on laisse la largeur naturelle. */}
      <div className="min-w-[52rem] print:min-w-0">
        {/* ── En-têtes des jours ── */}
        <div className="grid grid-cols-[9rem_1fr] border-b border-neutral-200">
          <div className="border-r border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-500">
            Ouvrier
          </div>
          <div className="grid grid-cols-7">
            {jours.map((j) => (
              <div
                key={j.cle}
                className={cn(
                  "border-l border-neutral-200 px-1 py-2 text-center first:border-l-0",
                  j.aujourdhui
                    ? "bg-primary-50"
                    : j.weekend
                      ? "bg-neutral-50"
                      : "bg-white",
                )}
              >
                <p
                  className={cn(
                    "truncate text-xs font-medium",
                    j.aujourdhui ? "text-primary-800" : "text-neutral-700",
                  )}
                >
                  {j.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Lignes ouvriers ── */}
        {lignes.map((ligne) => (
          <div
            key={ligne.ouvrierId}
            className="grid grid-cols-[9rem_1fr] border-b border-neutral-100 last:border-b-0"
          >
            <div className="flex items-center border-r border-neutral-200 px-3 py-1.5">
              <p
                className={cn(
                  "truncate text-sm font-medium",
                  ligne.actif ? "text-neutral-900" : "text-neutral-400",
                )}
              >
                {ligne.nom}
                {!ligne.actif && (
                  <span className="ml-1 text-xs font-normal">(inactif)</span>
                )}
              </p>
            </div>

            {/* Zone jours : fond (week-end/aujourd'hui/absences) + barres. */}
            <div className="relative">
              {/* Couche de fond, alignée sur les 7 colonnes. */}
              <div
                className="absolute inset-0 grid grid-cols-7"
                aria-hidden="true"
              >
                {jours.map((j) => (
                  <div
                    key={j.cle}
                    className={cn(
                      "border-l border-neutral-100 first:border-l-0",
                      j.aujourdhui
                        ? "bg-primary-50/50"
                        : j.weekend && "bg-neutral-50/70",
                    )}
                  />
                ))}
              </div>
              {/* Absences hachurées (même langage visuel que le planning). */}
              <div
                className="absolute inset-0 grid grid-cols-7"
                aria-hidden="true"
              >
                {ligne.absences.map((a, i) => (
                  <div
                    key={i}
                    title={a.title}
                    className="bg-amber-50"
                    style={{
                      gridColumn: `${a.colDebut + 1} / ${a.colFin + 2}`,
                      backgroundImage: HACHURES,
                    }}
                  />
                ))}
              </div>

              {/* Barres de chantiers (grille 7 colonnes × lanes). */}
              <div
                className="relative grid grid-cols-7 gap-y-1 py-1.5"
                style={{ gridAutoRows: "2rem" }}
              >
                {ligne.barres.map((b) => (
                  <Link
                    key={`${b.chantierId}-${b.lane}`}
                    href={`/app/chantiers/${b.chantierId}`}
                    title={b.title}
                    className={cn(
                      "z-10 mx-0.5 flex items-center overflow-hidden border px-2 text-xs font-medium shadow-xs transition-colors",
                      BARRE_UI[b.etat],
                      b.clampGauche ? "ml-0 rounded-l-none border-l-0" : "rounded-l-md",
                      b.clampDroite ? "mr-0 rounded-r-none border-r-0" : "rounded-r-md",
                      b.conflit && "ring-2 ring-red-400",
                    )}
                    style={{
                      gridColumn: `${b.colDebut + 1} / ${b.colFin + 2}`,
                      gridRow: b.lane + 1,
                    }}
                  >
                    <span className="truncate">
                      {b.clampGauche && "… "}
                      {b.nomClient}
                      {b.clampDroite && " …"}
                    </span>
                  </Link>
                ))}
                {/* Réserve la hauteur même sans barre (ligne vide lisible). */}
                {ligne.barres.length === 0 && (
                  <div style={{ gridColumn: "1 / 8", gridRow: 1 }} />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
