"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  CloudOff,
  Droplets,
  History,
  Search,
  X,
} from "lucide-react";
import { SEUIL_HUMIDITE, visiteLabel } from "@/lib/metier";
import { formatDateTimeFr, formatPlageDateTimeFr } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/ui";
import type { ResultatRecherche } from "./recherche/route";

// Recherche instantanée dans l'historique du conducteur : débounce 250 ms,
// requêtes annulables, skeleton pendant la frappe, recherches récentes
// (localStorage) quand le champ est vide. Tant qu'aucune recherche n'est
// active, `children` (la liste serveur par mois) reste affichée.

const DEBOUNCE_MS = 250;
const CLE_RECENTES = "historique-recherches-recentes";
const MAX_RECENTES = 5;

function lireRecentes(): string[] {
  try {
    const brut = localStorage.getItem(CLE_RECENTES);
    const liste = brut ? JSON.parse(brut) : [];
    return Array.isArray(liste) ? liste.filter((r) => typeof r === "string") : [];
  } catch {
    return [];
  }
}

function memoriserRecente(q: string) {
  const liste = [q, ...lireRecentes().filter((r) => r !== q)].slice(
    0,
    MAX_RECENTES,
  );
  try {
    localStorage.setItem(CLE_RECENTES, JSON.stringify(liste));
  } catch {
    // stockage plein/indisponible : la recherche fonctionne sans récentes
  }
}

export function RechercheHistorique({
  children,
}: {
  children: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState<ResultatRecherche[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [horsLigne, setHorsLigne] = useState(false);
  const [recentes, setRecentes] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setRecentes(lireRecentes()), []);

  const requete = q.trim();
  const active = requete.length >= 2;

  // Débounce + annulation : seule la dernière requête tapée compte.
  useEffect(() => {
    if (!active) {
      setResultats(null);
      setChargement(false);
      setHorsLigne(false);
      return;
    }
    setChargement(true);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/app/mes-visites/historique/recherche?q=${encodeURIComponent(requete)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { resultats: ResultatRecherche[] };
        setResultats(data.resultats);
        setHorsLigne(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Recherche historique :", err);
        setResultats(null);
        setHorsLigne(true);
      } finally {
        if (!controller.signal.aborted) setChargement(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [active, requete]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          placeholder="Nom, adresse ou téléphone…"
          aria-label="Rechercher dans l'historique"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-12 w-full rounded-lg border border-neutral-300 bg-white pr-11 pl-9 text-base text-neutral-900 shadow-xs transition-colors placeholder:text-neutral-400 hover:border-neutral-400 [&::-webkit-search-cancel-button]:hidden"
        />
        {q !== "" && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
            aria-label="Effacer la recherche"
            className="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-neutral-500 transition-colors hover:text-neutral-800"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Recherches récentes : uniquement champ vide, pour repartir vite. */}
      {!active && recentes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <History className="size-3.5 text-neutral-400" aria-hidden="true" />
          {recentes.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setQ(r)}
              className="flex h-9 cursor-pointer items-center rounded-full border border-neutral-200 bg-white px-3 text-sm text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-900"
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {active ? (
        <ResultatsRecherche
          requete={requete}
          resultats={resultats}
          chargement={chargement}
          horsLigne={horsLigne}
        />
      ) : (
        children
      )}
    </div>
  );
}

function ResultatsRecherche({
  requete,
  resultats,
  chargement,
  horsLigne,
}: {
  requete: string;
  resultats: ResultatRecherche[] | null;
  chargement: boolean;
  horsLigne: boolean;
}) {
  if (chargement && resultats === null) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="flex min-h-20 items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="size-8 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (horsLigne) {
    return (
      <EmptyState
        icone={<CloudOff className="size-8 text-neutral-300" aria-hidden="true" />}
        titre="Recherche indisponible hors ligne"
        description="La recherche interroge le serveur. Réessayez dès que le réseau revient."
      />
    );
  }

  if (!resultats || resultats.length === 0) {
    return (
      <EmptyState
        titre={`Aucun résultat pour « ${requete} »`}
        description="Essayez avec le nom du client, un bout d'adresse ou un numéro de téléphone."
      />
    );
  }

  return (
    <div className={cn("space-y-2", chargement && "opacity-60")}>
      {resultats.map((r) => (
        <Link
          key={r.id}
          href={`/app/visites/${r.id}`}
          onClick={() => memoriserRecente(requete)}
          className="flex min-h-20 items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-xs transition-colors active:bg-neutral-100"
        >
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate font-medium text-neutral-900">
              {r.nomClient}
            </p>
            <p className="truncate text-sm text-neutral-500">{r.adresse}</p>
            <p className="truncate text-xs text-neutral-500">
              {visiteLabel(r.numero)}
              {r.statut === "REALISEE" && r.dateRealisee
                ? ` · le ${formatDateTimeFr(new Date(r.dateRealisee))}`
                : ` · prévue le ${formatPlageDateTimeFr(new Date(r.datePlanifiee), r.dureeMinutes)}`}
            </p>
          </div>

          {r.statut === "PLANIFIEE" ? (
            <span className="inline-flex shrink-0 items-center rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-800">
              À venir
            </span>
          ) : (
            r.tauxHumidite != null && (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums",
                  r.tauxHumidite > SEUIL_HUMIDITE
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-green-200 bg-green-50 text-green-800",
                )}
              >
                <Droplets className="size-3.5" aria-hidden="true" />
                {r.tauxHumidite} %
              </span>
            )
          )}
          <ChevronRight
            className="size-5 shrink-0 text-neutral-400"
            aria-hidden="true"
          />
        </Link>
      ))}
    </div>
  );
}
