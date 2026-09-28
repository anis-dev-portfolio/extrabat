"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { dateVersParamJour } from "@/lib/planning";
import { cn } from "@/lib/ui";

// Date-picker français maison (zéro dépendance hors lucide-react), pensé pour
// remplacer les <input type="date"> natifs. Les valeurs échangées sont des
// chaînes "YYYY-MM-DD" (format de parseParamJour) ; toute l'arithmétique de
// grille travaille sur des triplets civils via Date.UTC — calendrier grégorien
// pur, aucun fuseau impliqué. Seul « aujourd'hui » passe par lib/planning
// (Intl épinglé Europe/Paris, valable aussi dans le navigateur).

type Ymd = { annee: number; mois: number; jour: number }; // mois 1-12

function parseYmd(valeur: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (!m) return null;
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  return { annee, mois, jour };
}

// Triplet → "YYYY-MM-DD", en normalisant les débordements via Date.UTC
// (32 janvier → 1er février) — ce qui donne aussi les décalages de jours.
function ymdVersCle(annee: number, mois: number, jour: number): string {
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function decalerJours(cle: string, n: number): string {
  const v = parseYmd(cle)!;
  return ymdVersCle(v.annee, v.mois, v.jour + n);
}

// "2026-07-06" → "06/07/2026" (affichage des triggers).
export function afficherFr(cle: string): string {
  const v = parseYmd(cle);
  if (!v) return "";
  return `${String(v.jour).padStart(2, "0")}/${String(v.mois).padStart(2, "0")}/${v.annee}`;
}

const titreMoisFr = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const ENTETES_JOURS = ["lu", "ma", "me", "je", "ve", "sa", "di"] as const;

export type MoisAffiche = { annee: number; mois: number };

export function moisDeCle(cle: string): MoisAffiche {
  const v = parseYmd(cle)!;
  return { annee: v.annee, mois: v.mois };
}

function decalerMoisAffiche(m: MoisAffiche, n: number): MoisAffiche {
  const total = m.mois - 1 + n;
  return {
    annee: m.annee + Math.floor(total / 12),
    mois: ((total % 12) + 12) % 12 + 1,
  };
}

type JourGrille = {
  cle: string;
  numero: number;
  horsMois: boolean;
};

// 6 semaines × 7 jours (lun→dim) couvrant le mois affiché — grille stable,
// pas de saut de hauteur entre les mois.
function grilleDuMois(m: MoisAffiche): JourGrille[][] {
  const premier = new Date(Date.UTC(m.annee, m.mois - 1, 1));
  const decalageLundi = (premier.getUTCDay() + 6) % 7;
  return Array.from({ length: 6 }, (_, semaine) =>
    Array.from({ length: 7 }, (_, jour) => {
      const d = new Date(
        Date.UTC(m.annee, m.mois - 1, 1 - decalageLundi + semaine * 7 + jour),
      );
      return {
        cle: ymdVersCle(
          d.getUTCFullYear(),
          d.getUTCMonth() + 1,
          d.getUTCDate(),
        ),
        numero: d.getUTCDate(),
        horsMois: d.getUTCMonth() !== m.mois - 1,
      };
    }),
  );
}

/* ── Calendrier (grille d'un mois, contrôlée) ───────────────────────── */

export function Calendrier({
  mois,
  onChangerMois,
  selection,
  plage,
  onChoisir,
}: {
  mois: MoisAffiche;
  onChangerMois: (m: MoisAffiche) => void;
  selection: string | null;
  plage?: { du: string; au: string } | null;
  onChoisir: (jour: string) => void;
}) {
  const aujourdhui = dateVersParamJour(new Date());
  const semaines = grilleDuMois(mois);
  // Roving tabindex : un seul jour focusable à la fois, piloté au clavier.
  const [focus, setFocus] = useState<string>(
    selection ?? ymdVersCle(mois.annee, mois.mois, 1),
  );
  const gridRef = useRef<HTMLDivElement>(null);

  // Si le mois affiché change (chevrons), garder un focus visible dedans.
  const focusVisible = semaines.some((s) => s.some((j) => j.cle === focus))
    ? focus
    : ymdVersCle(mois.annee, mois.mois, 1);

  function deplacerFocus(cible: string) {
    setFocus(cible);
    const m = moisDeCle(cible);
    if (m.annee !== mois.annee || m.mois !== mois.mois) onChangerMois(m);
    // Focus DOM après le re-render de la grille.
    requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLButtonElement>(`[data-jour="${cible}"]`)
        ?.focus();
    });
  }

  function surClavier(e: React.KeyboardEvent) {
    const pas: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (e.key in pas) {
      e.preventDefault();
      deplacerFocus(decalerJours(focusVisible, pas[e.key]));
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const v = parseYmd(focusVisible)!;
      deplacerFocus(
        ymdVersCle(v.annee, v.mois + (e.key === "PageUp" ? -1 : 1), v.jour),
      );
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onChoisir(focusVisible);
    }
  }

  const dansPlage = (cle: string) =>
    plage != null && plage.du <= cle && cle <= plage.au;

  return (
    <div className="w-64 select-none">
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          onClick={() => onChangerMois(decalerMoisAffiche(mois, -1))}
          aria-label="Mois précédent"
          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <p
          aria-live="polite"
          className="text-sm font-semibold text-neutral-900 first-letter:uppercase"
        >
          {titreMoisFr.format(new Date(Date.UTC(mois.annee, mois.mois - 1, 1)))}
        </p>
        <button
          type="button"
          onClick={() => onChangerMois(decalerMoisAffiche(mois, 1))}
          aria-label="Mois suivant"
          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 pb-1">
        {ENTETES_JOURS.map((j) => (
          <span
            key={j}
            aria-hidden="true"
            className="py-1 text-center text-xs font-medium text-neutral-400"
          >
            {j}
          </span>
        ))}
      </div>

      <div ref={gridRef} role="grid" onKeyDown={surClavier}>
        {semaines.map((semaine, i) => (
          <div key={i} role="row" className="grid grid-cols-7">
            {semaine.map((jour) => {
              const choisi = jour.cle === selection;
              return (
                <button
                  key={jour.cle}
                  type="button"
                  role="gridcell"
                  data-jour={jour.cle}
                  tabIndex={jour.cle === focusVisible ? 0 : -1}
                  aria-selected={choisi}
                  aria-label={afficherFr(jour.cle)}
                  onClick={() => onChoisir(jour.cle)}
                  onFocus={() => setFocus(jour.cle)}
                  className={cn(
                    "flex size-9 cursor-pointer items-center justify-center rounded-md text-sm transition-colors tabular-nums",
                    choisi
                      ? "bg-primary-600 font-semibold text-white"
                      : cn(
                          jour.horsMois
                            ? "text-neutral-300"
                            : "text-neutral-800",
                          dansPlage(jour.cle)
                            ? "rounded-none bg-primary-50 hover:bg-primary-100"
                            : "hover:bg-neutral-100",
                          jour.cle === aujourdhui &&
                            "font-semibold ring-1 ring-inset ring-primary-400",
                        ),
                  )}
                >
                  {jour.numero}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Popover partagé ────────────────────────────────────────────────── */

export function usePopover(onFermer: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function surPointeur(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onFermer();
    }
    function surTouche(e: KeyboardEvent) {
      if (e.key === "Escape") onFermer();
    }
    document.addEventListener("pointerdown", surPointeur);
    document.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("pointerdown", surPointeur);
      document.removeEventListener("keydown", surTouche);
    };
  }, [onFermer]);
  return ref;
}

// `aDroite` : aligne le panneau sur le bord droit du trigger (barres d'outils
// alignées à droite, colonnes de droite d'un formulaire) pour éviter qu'il ne
// déborde de l'écran.
export function PanneauCalendrier({
  aDroite = false,
  children,
}: {
  aDroite?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Garde-fou viewport (petits écrans) : si le panneau, ancré au trigger,
  // déborderait de l'écran, on le décale via left/right inline — pas par
  // transform, déjà pris par l'animation pop-in. Mesure sur le parent (non
  // animé) + offsetWidth (insensible au scale du pop-in).
  const [decalage, setDecalage] = useState<React.CSSProperties>();
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const MARGE = 8;
    const largeur = el.offsetWidth;
    const rect = parent.getBoundingClientRect();
    if (aDroite) {
      // Bord gauche du panneau (aligné right-0) trop à gauche → pousser à
      // droite, sans faire sortir le bord droit du viewport.
      const necessaire = MARGE - (rect.right - largeur);
      const possible = window.innerWidth - MARGE - rect.right;
      if (necessaire > 0)
        setDecalage({ right: -Math.min(necessaire, Math.max(0, possible)) });
    } else {
      // Bord droit du panneau (aligné left-0) hors écran → pousser à gauche,
      // sans faire sortir le bord gauche du viewport.
      const necessaire = rect.left + largeur - (window.innerWidth - MARGE);
      const possible = rect.left - MARGE;
      if (necessaire > 0)
        setDecalage({ left: -Math.min(necessaire, Math.max(0, possible)) });
    }
  }, [aDroite]);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Choisir une date"
      style={decalage}
      className={cn(
        "absolute top-full z-30 mt-1 origin-top rounded-lg border border-neutral-200 bg-white p-3 shadow-lg animate-[pop-in_200ms_var(--ease-sortie)]",
        aDroite ? "right-0" : "left-0",
      )}
    >
      {children}
    </div>
  );
}

function PiedCalendrier({
  onEffacer,
  onAujourdhui,
}: {
  onEffacer: () => void;
  onAujourdhui: () => void;
}) {
  return (
    <div className="mt-2 flex items-center justify-between border-t border-neutral-100 pt-2">
      <button
        type="button"
        onClick={onEffacer}
        className="cursor-pointer rounded-md px-2 py-1 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
      >
        Effacer
      </button>
      <button
        type="button"
        onClick={onAujourdhui}
        className="cursor-pointer rounded-md px-2 py-1 text-sm font-medium text-primary-800 transition-colors hover:bg-primary-50"
      >
        Aujourd&apos;hui
      </button>
    </div>
  );
}

/* ── DatePicker (valeur simple) ─────────────────────────────────────── */

export function DatePicker({
  value,
  onChange,
  id,
  ariaLabel,
  panneauADroite = false,
  className,
}: {
  value: string; // "" = vide
  onChange: (v: string) => void;
  id?: string;
  ariaLabel: string;
  panneauADroite?: boolean;
  className?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [mois, setMois] = useState<MoisAffiche | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const ref = usePopover(() => setOuvert(false));

  function ouvrir() {
    setMois(moisDeCle(value || dateVersParamJour(new Date())));
    setOuvert(true);
  }
  function fermer() {
    setOuvert(false);
    triggerRef.current?.focus();
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        onClick={() => (ouvert ? fermer() : ouvrir())}
        className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 text-base shadow-xs transition-colors hover:border-neutral-400 sm:text-sm"
      >
        <CalendarRange
          className="size-4 shrink-0 text-neutral-400"
          aria-hidden="true"
        />
        {value ? (
          <span className="text-neutral-900 tabular-nums">
            {afficherFr(value)}
          </span>
        ) : (
          <span className="text-neutral-400">jj/mm/aaaa</span>
        )}
      </button>

      {ouvert && mois && (
        <PanneauCalendrier aDroite={panneauADroite}>
          <Calendrier
            mois={mois}
            onChangerMois={setMois}
            selection={value || null}
            onChoisir={(jour) => {
              onChange(jour);
              fermer();
            }}
          />
          <PiedCalendrier
            onEffacer={() => {
              onChange("");
              fermer();
            }}
            onAujourdhui={() => {
              onChange(dateVersParamJour(new Date()));
              fermer();
            }}
          />
        </PanneauCalendrier>
      )}
    </div>
  );
}

/* ── DateRangePicker (plage du/au) ──────────────────────────────────── */

export function DateRangePicker({
  du,
  au,
  onChange,
  labelDu = "Du",
  labelAu = "au",
  className,
}: {
  du: string;
  au: string;
  onChange: (du: string, au: string) => void;
  labelDu?: string;
  labelAu?: string;
  className?: string;
}) {
  // phase = borne que le prochain clic sur un jour renseigne.
  const [phase, setPhase] = useState<"du" | "au" | null>(null);
  const [mois, setMois] = useState<MoisAffiche | null>(null);
  const ref = usePopover(() => setPhase(null));

  function ouvrir(borne: "du" | "au") {
    const reference =
      (borne === "du" ? du : au) || du || au || dateVersParamJour(new Date());
    setMois(moisDeCle(reference));
    setPhase(borne);
  }

  function choisir(jour: string) {
    if (phase === "du") {
      // Si la nouvelle borne basse dépasse la haute, la plage se réduit au jour.
      onChange(jour, au && au < jour ? "" : au);
      setPhase("au"); // enchaîne naturellement sur la borne de fin
    } else {
      if (du && jour < du) onChange(jour, du);
      else onChange(du, jour);
      setPhase(null);
    }
  }

  const plage = du && au ? { du, au } : null;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <div className="flex h-10 items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 shadow-xs transition-colors hover:border-neutral-400">
        <CalendarRange
          className="size-4 shrink-0 text-neutral-400"
          aria-hidden="true"
        />
        <span className="text-xs text-neutral-500">{labelDu}</span>
        <BorneBouton
          valeur={du}
          actif={phase === "du"}
          ariaLabel="Créé à partir du"
          onClick={() => (phase === "du" ? setPhase(null) : ouvrir("du"))}
        />
        <span className="text-xs text-neutral-500">{labelAu}</span>
        <BorneBouton
          valeur={au}
          actif={phase === "au"}
          ariaLabel="Créé jusqu'au"
          onClick={() => (phase === "au" ? setPhase(null) : ouvrir("au"))}
        />
      </div>

      {phase && mois && (
        <PanneauCalendrier>
          <p className="pb-2 text-xs font-medium text-neutral-500">
            {phase === "du" ? "Choisissez la date de début" : "Choisissez la date de fin"}
          </p>
          <Calendrier
            mois={mois}
            onChangerMois={setMois}
            selection={(phase === "du" ? du : au) || null}
            plage={plage}
            onChoisir={choisir}
          />
          <PiedCalendrier
            onEffacer={() => {
              onChange("", "");
              setPhase(null);
            }}
            onAujourdhui={() => choisir(dateVersParamJour(new Date()))}
          />
        </PanneauCalendrier>
      )}
    </div>
  );
}

function BorneBouton({
  valeur,
  actif,
  ariaLabel,
  onClick,
}: {
  valeur: string;
  actif: boolean;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      aria-expanded={actif}
      onClick={onClick}
      className={cn(
        "h-8 cursor-pointer rounded px-1.5 text-base transition-colors tabular-nums sm:text-sm",
        actif
          ? "bg-primary-50 text-primary-900 ring-1 ring-primary-300"
          : "hover:bg-neutral-100",
        valeur ? "text-neutral-900" : "text-neutral-400",
      )}
    >
      {valeur ? afficherFr(valeur) : "jj/mm/aaaa"}
    </button>
  );
}
