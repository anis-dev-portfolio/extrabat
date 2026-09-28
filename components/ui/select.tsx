"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { usePopover } from "@/components/ui/date-picker";
import { cn } from "@/lib/ui";

// Menu déroulant maison (listbox accessible) qui remplace le <select> natif :
// même panneau blanc animé que le calendrier, entièrement stylable et cohérent
// sur tous les navigateurs (le menu natif — chrome système bleu — n'est ni
// stylable ni animable, surtout sur iOS). On garde les <option> en enfants
// pour que le JSX des appelants reste quasi identique ; le composant les
// parse. Deux modes : contrôlé (`value` + `onChange(valeur)`), ou formulaire
// (`name` + `defaultValue` → poste via un input caché). Clavier complet
// (flèches, Origine/Fin, Entrée/Espace, Échap, recherche par frappe).

type OptionItem = { value: string; label: string; disabled?: boolean };

function texteDe(node: React.ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(texteDe).join("");
  return "";
}

// Convertit les <option> enfants en descripteurs (value = attribut, à défaut le
// texte, comme le <select> natif ; label = texte affiché ; disabled).
function parseOptions(children: React.ReactNode): OptionItem[] {
  const out: OptionItem[] = [];
  for (const enfant of Array.isArray(children) ? children.flat(Infinity) : [children]) {
    if (
      enfant == null ||
      typeof enfant !== "object" ||
      !("props" in enfant) ||
      (enfant as { type?: unknown }).type !== "option"
    ) {
      continue;
    }
    const props = (enfant as { props: { value?: string | number; disabled?: boolean; children?: React.ReactNode } }).props;
    const label = texteDe(props.children);
    out.push({
      value: props.value != null ? String(props.value) : label,
      label,
      disabled: props.disabled,
    });
  }
  return out;
}

// text-base < sm : aligné sur les Input voisins (16 px mobile, anti-zoom iOS).
const DECLENCHEUR =
  "flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-neutral-300 bg-white px-3 text-left text-base text-neutral-900 shadow-xs transition-colors hover:border-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500 sm:text-sm";

export function Select({
  value: valueProp,
  defaultValue,
  onChange,
  name,
  id,
  disabled,
  placeholder,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  value?: string;
  defaultValue?: string;
  // Signature simplifiée : la valeur directement (pas d'event de <select>).
  onChange?: (valeur: string) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  const options = useMemo(() => parseOptions(children), [children]);
  const controle = valueProp !== undefined;
  const [interne, setInterne] = useState(
    () => defaultValue ?? options[0]?.value ?? "",
  );
  const value = controle ? valueProp! : interne;

  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const idListe = useId();
  const declRef = useRef<HTMLButtonElement>(null);
  const listeRef = useRef<HTMLUListElement>(null);
  const rootRef = usePopover(() => setOuvert(false));
  const recherche = useRef({ texte: "", timer: 0 });

  const choisie = options.find((o) => o.value === value);
  // Option « placeholder » = celle explicitement désactivée (ex. « Choisir… ») :
  // affichée en gris. Une valeur "" bien réelle (« Tous les statuts ») ne l'est pas.
  const estPlaceholder = choisie ? Boolean(choisie.disabled) : true;

  const premierActif = () => Math.max(0, options.findIndex((o) => !o.disabled));
  const dernierActif = () => {
    for (let i = options.length - 1; i >= 0; i--) if (!options[i].disabled) return i;
    return 0;
  };
  const suivantActif = (from: number) => {
    for (let i = from + 1; i < options.length; i++) if (!options[i].disabled) return i;
    return from;
  };
  const precedentActif = (from: number) => {
    for (let i = from - 1; i >= 0; i--) if (!options[i].disabled) return i;
    return from;
  };

  function ouvrir() {
    const i = options.findIndex((o) => o.value === value && !o.disabled);
    setActif(i >= 0 ? i : premierActif());
    setOuvert(true);
  }
  function fermer() {
    setOuvert(false);
    declRef.current?.focus();
  }
  function choisir(i: number) {
    const opt = options[i];
    if (!opt || opt.disabled) return;
    if (!controle) setInterne(opt.value);
    onChange?.(opt.value);
    fermer();
  }

  // Garde l'option active visible pendant la navigation clavier.
  useEffect(() => {
    if (!ouvert) return;
    listeRef.current
      ?.querySelector<HTMLElement>(`[data-index="${actif}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [actif, ouvert]);

  function rechercheParFrappe(car: string) {
    const r = recherche.current;
    window.clearTimeout(r.timer);
    r.texte += car.toLowerCase();
    r.timer = window.setTimeout(() => (r.texte = ""), 600);
    const i = options.findIndex(
      (o) => !o.disabled && o.label.toLowerCase().startsWith(r.texte),
    );
    if (i >= 0) setActif(i);
  }

  function surClavier(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!ouvert) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        ouvrir();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActif(suivantActif(actif));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActif(precedentActif(actif));
        break;
      case "Home":
        e.preventDefault();
        setActif(premierActif());
        break;
      case "End":
        e.preventDefault();
        setActif(dernierActif());
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choisir(actif);
        break;
      case "Escape":
        e.preventDefault();
        fermer();
        break;
      case "Tab":
        setOuvert(false);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) rechercheParFrappe(e.key);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={declRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        aria-controls={ouvert ? idListe : undefined}
        aria-activedescendant={ouvert ? `${idListe}-${actif}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (ouvert ? setOuvert(false) : ouvrir())}
        onKeyDown={surClavier}
        className={cn(DECLENCHEUR, ouvert && "border-primary-400")}
      >
        <span className={cn("truncate", estPlaceholder && "text-neutral-400")}>
          {choisie ? choisie.label : (placeholder ?? "")}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-neutral-400 transition-transform duration-150 ease-standard",
            ouvert && "rotate-180 text-primary-600",
          )}
        />
      </button>

      {ouvert && (
        <ul
          ref={listeRef}
          role="listbox"
          id={idListe}
          aria-label={ariaLabel}
          // Le panneau se dimensionne sur son contenu (w-max) sans jamais être
          // plus étroit que le déclencheur : les libellés longs s'affichent en
          // entier même quand le déclencheur, lui, doit tronquer.
          className="scrollbar-fin absolute top-full left-0 z-30 mt-1 max-h-64 w-max min-w-full max-w-[min(22rem,calc(100vw-2rem))] overflow-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-lg animate-[pop-in_200ms_var(--ease-sortie)]"
        >
          {options.map((o, i) => {
            const estChoisie = o.value === value;
            const estActive = i === actif;
            return (
              <li
                key={`${o.value}-${i}`}
                id={`${idListe}-${i}`}
                role="option"
                data-index={i}
                aria-selected={estChoisie}
                aria-disabled={o.disabled || undefined}
                onClick={() => choisir(i)}
                onMouseEnter={() => !o.disabled && setActif(i)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  o.disabled
                    ? "cursor-not-allowed text-neutral-300"
                    : cn(
                        "cursor-pointer",
                        estActive ? "bg-neutral-100" : "",
                        estChoisie ? "font-medium text-primary-800" : "text-neutral-700",
                      ),
                )}
              >
                <span className="truncate">{o.label}</span>
                {estChoisie && !o.disabled && (
                  <Check
                    className="size-4 shrink-0 text-primary-600"
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
