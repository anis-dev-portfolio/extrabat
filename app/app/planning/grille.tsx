import { minutesVersLabel, type PlageMinutes } from "@/lib/planning";
import type { Proximite } from "@/lib/geo";
import { cn } from "@/lib/ui";
import { BlocVisite } from "./bloc-visite";

// Grille du planning — composant serveur purement présentationnel : tout est
// précalculé par page.tsx (blocs positionnés, zones, lanes). Échelle verticale
// 1 min ≈ 1 px via --echelle (grid-row imposerait une granularité fixe).
export type ZoneSerialisee = {
  top: number; // minutes depuis l'ouverture
  hauteur: number;
  genre: "indispo" | "absence";
  label: string | null;
};

export type BlocSerialise = {
  visiteId: string;
  dossierId: string;
  nomClient: string;
  adresse: string;
  numero: number;
  conducteurNom: string | null; // affiché sur le bloc (vue « tous »)
  conducteurNomComplet: string; // toujours dans le détail
  heureLabel: string;
  dateLabel: string;
  dureeMinutes: number; // durée réelle (pas la hauteur clampée)
  top: number;
  hauteur: number;
  clampHaut: boolean;
  clampBas: boolean;
  lane: number;
  lanes: number;
  proximite: Proximite; // signal géo passif (distance à vol d'oiseau) — voir lib/geo.ts
  distanceProximiteKm: number | null;
};

export type ColonneSerialisee = {
  cle: string;
  titre: string;
  sousTitre: string | null;
  aujourdhui: boolean;
  weekend: boolean; // colonne samedi/dimanche (vue semaine), grisée
  zones: ZoneSerialisee[];
  blocs: BlocSerialise[];
  horsBornes: number;
};

const ECHELLE = 1; // px par minute

export function Grille({
  colonnes,
  bornes,
  minuteMaintenant,
}: {
  colonnes: ColonneSerialisee[];
  bornes: PlageMinutes;
  minuteMaintenant: number | null; // minutes depuis l'ouverture, null si hors bornes
}) {
  const totalMin = bornes.heureFin - bornes.heureDebut;
  const hauteurPx = totalMin * ECHELLE;

  // Traits d'heure pleine entre les bornes (labels précalculés serveur — un
  // navigateur à l'étranger afficherait sinon la grille dans son fuseau).
  const heures: { top: number; label: string }[] = [];
  for (
    let m = Math.ceil(bornes.heureDebut / 60) * 60;
    m <= bornes.heureFin;
    m += 60
  ) {
    heures.push({ top: (m - bornes.heureDebut) * ECHELLE, label: minutesVersLabel(m) });
  }

  return (
    // UN SEUL conteneur de scroll (2 axes) : la page ne scrolle plus, la
    // grille oui — gouttière des heures figée à gauche, en-têtes figés en
    // haut, scrollbar fine. min-h-0 + flex-1 : remplit la hauteur allouée
    // par la page (plein écran en desktop).
    <div className="scrollbar-fin min-h-0 flex-1 overflow-auto overscroll-contain rounded-lg border border-neutral-200 bg-white shadow-xs print:overflow-visible print:shadow-none">
      {/* --cols : réutilisé par la règle print de globals.css pour resserrer
          les colonnes (minmax(0,1fr)) et tenir dans la page imprimée. */}
      <div
        className="grille-planning grid min-w-fit"
        style={
          {
            "--cols": colonnes.length,
            gridTemplateColumns: `3.5rem repeat(${colonnes.length}, minmax(9rem, 1fr))`,
          } as React.CSSProperties
        }
      >
        {/* ── Rangée d'en-têtes (sticky top) ── */}
        <div className="sticky top-0 left-0 z-30 border-b border-neutral-200 bg-white" />
        {colonnes.map((col) => (
          <div
            key={col.cle}
            className={cn(
              "sticky top-0 z-20 border-b border-l border-neutral-200 px-2 py-2 text-center",
              col.aujourdhui
                ? "bg-primary-50"
                : col.weekend
                  ? "bg-neutral-50"
                  : "bg-white",
            )}
          >
            <p
              className={cn(
                "truncate text-sm font-medium",
                col.aujourdhui ? "text-primary-800" : "text-neutral-900",
              )}
            >
              {col.titre}
            </p>
            {col.sousTitre && (
              <p className="truncate text-[11px] text-amber-700">{col.sousTitre}</p>
            )}
            {col.blocs.length + col.horsBornes > 0 && (
              <p className="truncate text-[11px] text-neutral-500 tabular-nums">
                {col.blocs.length + col.horsBornes} visite
                {col.blocs.length + col.horsBornes > 1 ? "s" : ""}
                {col.horsBornes > 0 && ` (+${col.horsBornes} hors plage)`}
              </p>
            )}
          </div>
        ))}

        {/* ── Gouttière des heures ── */}
        <div
          className="sticky left-0 z-10 border-neutral-200 bg-white"
          style={{ height: hauteurPx }}
        >
          <div className="relative h-full">
            {heures.map((h) => (
              <span
                key={h.top}
                className={cn(
                  "absolute right-1.5 text-[11px] text-neutral-400 tabular-nums",
                  // Le centrage -translate-y-1/2 peint la moitié du libellé
                  // au-delà du bord : la première heure remontait DERRIÈRE la
                  // rangée d'en-têtes sticky (fond opaque, z supérieur) — « 8h »
                  // à moitié rogné. Bornes : première alignée sous le bord,
                  // dernière au-dessus.
                  h.top === 0
                    ? "pt-0.5"
                    : h.top === hauteurPx
                      ? "-translate-y-full"
                      : "-translate-y-1/2",
                )}
                style={{ top: h.top }}
              >
                {h.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Colonnes ── */}
        {colonnes.map((col) => (
          <div
            key={col.cle}
            className={cn(
              "relative border-l border-neutral-200",
              col.aujourdhui
                ? "bg-primary-50/40"
                : col.weekend && "bg-neutral-50/60",
            )}
            style={{ height: hauteurPx }}
          >
            {/* Zones hors dispo / absence, sous les visites (z-0). */}
            {col.zones.map((z, i) => (
              <div
                key={i}
                className={cn(
                  "absolute inset-x-0 z-0",
                  z.genre === "absence" ? "bg-amber-50" : "bg-neutral-100/80",
                )}
                style={{
                  top: z.top * ECHELLE,
                  height: z.hauteur * ECHELLE,
                  backgroundImage:
                    "repeating-linear-gradient(-45deg, transparent, transparent 7px, rgba(0,0,0,0.035) 7px, rgba(0,0,0,0.035) 14px)",
                }}
              >
                {z.label && z.hauteur >= 40 && (
                  <span className="block truncate px-2 pt-1.5 text-[11px] font-medium text-amber-800">
                    {z.label}
                  </span>
                )}
              </div>
            ))}

            {/* Traits d'heures. */}
            {heures.map((h) =>
              h.top === 0 ? null : (
                <div
                  key={h.top}
                  aria-hidden="true"
                  className="absolute inset-x-0 z-0 border-t border-neutral-100"
                  style={{ top: h.top }}
                />
              ),
            )}

            {/* Fil « maintenant » (colonne du jour uniquement). */}
            {col.aujourdhui && minuteMaintenant !== null && (
              <div
                aria-hidden="true"
                className="absolute inset-x-0 z-20 border-t-2 border-red-500/70 print:hidden"
                style={{ top: minuteMaintenant * ECHELLE }}
              />
            )}

            {/* Visites. */}
            {col.blocs.map((bloc) => (
              <BlocVisite key={bloc.visiteId} bloc={bloc} echelle={ECHELLE} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
