"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import {
  resultatDepuisFeatureBan,
  urlRechercheBan,
  type ResultatGeocodage,
} from "@/lib/geocodage";
import { cn } from "@/lib/ui";
import { LIMITES } from "@/lib/validation";

// Autocomplétion d'adresse sur l'API Adresse (BAN), appelée directement
// depuis le navigateur (API publique, CORS ouvert). L'utilisateur choisit une
// suggestion → le champ prend le libellé normalisé ET les coordonnées de la
// suggestion CHOISIE partent dans des champs cachés (geoLatitude…), lues par
// geocodageDepuisFormulaire côté serveur. Plus de re-géocodage ambigu du
// texte final : la classe de bug « commune homonyme » disparaît à la saisie.
//
// Le texte libre reste accepté (hameau non répertorié, adresse hors BAN…) :
// sans sélection, aucun champ caché n'est envoyé et le serveur retombe sur le
// géocodage best-effort. Toute frappe APRÈS une sélection invalide celle-ci —
// les coordonnées ne doivent jamais diverger du texte affiché.

const DEBOUNCE_MS = 300;
const MIN_CARACTERES = 3;
const MAX_SUGGESTIONS = 5;

type Suggestion = { label: string; geo: ResultatGeocodage };

// Les features BAN passent par le même filtre que le géocodage serveur
// (score suffisant + département IDF) : une suggestion affichée est toujours
// une suggestion acceptable en base.
function parseSuggestions(donnees: unknown): Suggestion[] {
  const features = (donnees as { features?: unknown[] })?.features;
  if (!Array.isArray(features)) return [];
  const suggestions: Suggestion[] = [];
  for (const feature of features) {
    const geo = resultatDepuisFeatureBan(feature);
    const label = (feature as { properties?: { label?: unknown } })?.properties
      ?.label;
    if (geo && typeof label === "string" && label) {
      suggestions.push({ label, geo });
    }
  }
  return suggestions;
}

export function AdresseAutocomplete({
  id,
  name = "adresse",
  defaultValue = "",
  required,
  // Même borne que la validation serveur des adresses (LIMITES.ADRESSE).
  maxLength = LIMITES.ADRESSE,
}: {
  id: string;
  name?: string;
  defaultValue?: string;
  required?: boolean;
  maxLength?: number;
}) {
  const [texte, setTexte] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const [selection, setSelection] = useState<ResultatGeocodage | null>(null);

  const conteneurRef = useRef<HTMLDivElement>(null);
  // Après une sélection (ou au montage avec defaultValue), le changement de
  // `texte` ne doit pas relancer une recherche.
  const rechercherRef = useRef(false);

  useEffect(() => {
    if (!rechercherRef.current) return;
    const q = texte.trim();
    if (q.length < MIN_CARACTERES) {
      setSuggestions([]);
      setOuvert(false);
      return;
    }

    const controleur = new AbortController();
    const minuteur = setTimeout(async () => {
      try {
        const reponse = await fetch(urlRechercheBan(q, MAX_SUGGESTIONS), {
          signal: controleur.signal,
        });
        if (!reponse.ok) return;
        const resultats = parseSuggestions(await reponse.json());
        setSuggestions(resultats);
        setOuvert(resultats.length > 0);
        setActif(0);
      } catch {
        // Réseau down / abort : on laisse simplement la liste fermée.
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(minuteur);
      controleur.abort();
    };
  }, [texte]);

  // Fermeture au clic extérieur / Échap (même pattern que date-picker).
  useEffect(() => {
    function surPointeur(e: PointerEvent) {
      if (!conteneurRef.current?.contains(e.target as Node)) setOuvert(false);
    }
    document.addEventListener("pointerdown", surPointeur);
    return () => document.removeEventListener("pointerdown", surPointeur);
  }, []);

  function choisir(suggestion: Suggestion) {
    rechercherRef.current = false;
    setTexte(suggestion.label);
    setSelection(suggestion.geo);
    setSuggestions([]);
    setOuvert(false);
  }

  function surClavier(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOuvert(false);
      return;
    }
    if (!ouvert || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActif((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActif((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      // Ne soumet pas le formulaire tant que la liste est ouverte.
      e.preventDefault();
      choisir(suggestions[actif]);
    }
  }

  const listeId = `${id}-suggestions`;

  return (
    <div ref={conteneurRef} className="relative">
      <input
        id={id}
        name={name}
        value={texte}
        required={required}
        maxLength={maxLength}
        autoComplete="off"
        role="combobox"
        aria-expanded={ouvert}
        aria-controls={listeId}
        aria-autocomplete="list"
        aria-activedescendant={ouvert ? `${listeId}-${actif}` : undefined}
        onChange={(e) => {
          rechercherRef.current = true;
          setTexte(e.target.value);
          setSelection(null);
        }}
        onKeyDown={surClavier}
        onFocus={() => {
          if (suggestions.length > 0) setOuvert(true);
        }}
        className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-base text-neutral-900 shadow-xs transition-colors placeholder:text-neutral-400 hover:border-neutral-400 aria-invalid:border-red-400 sm:text-sm"
      />

      {selection && (
        <>
          <input type="hidden" name="geoLatitude" value={selection.latitude} />
          <input
            type="hidden"
            name="geoLongitude"
            value={selection.longitude}
          />
          <input type="hidden" name="geoScore" value={selection.score} />
          <input
            type="hidden"
            name="geoDepartement"
            value={selection.departement ?? ""}
          />
        </>
      )}

      {ouvert && suggestions.length > 0 && (
        <ul
          id={listeId}
          role="listbox"
          aria-label="Suggestions d'adresses"
          className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((suggestion, i) => (
            <li
              key={`${suggestion.label}-${i}`}
              id={`${listeId}-${i}`}
              role="option"
              aria-selected={i === actif}
              // onMouseDown (pas onClick) : sélectionne avant que le blur de
              // l'input ne referme la liste.
              onMouseDown={(e) => {
                e.preventDefault();
                choisir(suggestion);
              }}
              onMouseEnter={() => setActif(i)}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-neutral-800",
                i === actif && "bg-primary-50 text-primary-900",
              )}
            >
              <MapPin
                className="size-3.5 shrink-0 text-neutral-400"
                aria-hidden="true"
              />
              <span className="truncate">{suggestion.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
