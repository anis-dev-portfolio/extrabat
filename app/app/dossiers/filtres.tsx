"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui/field";
import { DateRangePicker } from "@/components/ui/date-picker";
import { Segmented } from "@/components/ui/tabs";
import { useNavigationFiltres } from "@/components/ui/zone-filtres";
import { DOSSIER_STATUTS, DOSSIER_STATUT_LABELS } from "@/lib/metier";

export type FiltresDossiers = {
  q: string;
  statut: string;
  conducteur: string;
  du: string;
  au: string;
  vue: "kanban" | "liste";
  // Tri de la vue liste uniquement (le kanban garde son ordre de priorité) —
  // whitelist stricte, appliquée server-side. « priorite » est le défaut.
  tri: "priorite" | "recent" | "creation" | "nom";
};

const TRI_OPTIONS: { valeur: FiltresDossiers["tri"]; label: string }[] = [
  { valeur: "priorite", label: "Priorité" },
  { valeur: "recent", label: "Activité récente" },
  { valeur: "creation", label: "Date de création" },
  { valeur: "nom", label: "Nom du client" },
];

// Recherche + filtres server-side : tout passe par les searchParams (partagés
// entre kanban et vue liste). La saisie texte est débouncée.
// NB : cn() ne fusionne pas les conflits Tailwind — les largeurs des contrôles
// (w-full de base) sont contraintes par des conteneurs, pas par des overrides.
export function FiltresDossiersBar({
  filtres,
  conducteurs,
  vueDefaut,
  triDefaut,
}: {
  filtres: FiltresDossiers;
  conducteurs: { id: string; nom: string }[];
  // Défauts d'affichage réglés par l'organisation (Paramètres → Préférences
  // d'affichage). On n'écrit vue/tri dans l'URL que s'ils DIFFÈRENT de ce
  // défaut : URLs propres ET bascule correcte même quand le défaut n'est pas
  // « kanban »/« priorite ».
  vueDefaut: FiltresDossiers["vue"];
  triDefaut: FiltresDossiers["tri"];
}) {
  // Transition partagée avec la page (ZoneFiltres) : chaque changement de
  // filtre estompe la liste pendant le re-render serveur — feedback immédiat.
  const { naviguer: remplacerUrl } = useNavigationFiltres();
  const [q, setQ] = useState(filtres.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function naviguer(patch: Partial<FiltresDossiers>) {
    const suivant = { ...filtres, q, ...patch };
    const params = new URLSearchParams();
    if (suivant.q) params.set("q", suivant.q);
    if (suivant.statut) params.set("statut", suivant.statut);
    if (suivant.conducteur) params.set("conducteur", suivant.conducteur);
    if (suivant.du) params.set("du", suivant.du);
    if (suivant.au) params.set("au", suivant.au);
    if (suivant.vue !== vueDefaut) params.set("vue", suivant.vue);
    if (suivant.tri !== triDefaut) params.set("tri", suivant.tri);
    const qs = params.toString();
    remplacerUrl(qs ? `/app/dossiers?${qs}` : "/app/dossiers");
  }

  // Débounce de la recherche (350 ms) — filtres select restent immédiats.
  function changerRecherche(valeur: string) {
    setQ(valeur);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (valeur) params.set("q", valeur);
      else params.delete("q");
      // Changer la recherche invalide la pagination courante : retour page 1
      // (naviguer() fait de même pour les autres filtres en repartant de zéro).
      params.delete("page");
      const qs = params.toString();
      remplacerUrl(qs ? `/app/dossiers?${qs}` : "/app/dossiers");
    }, 350);
  }
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const filtresActifs = Boolean(
    filtres.q || filtres.statut || filtres.conducteur || filtres.du || filtres.au,
  );

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-60">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => changerRecherche(e.target.value)}
            placeholder="Nom, adresse ou téléphone…"
            aria-label="Rechercher un dossier"
            className="pl-9"
          />
        </div>

        <div className="w-[calc(50%-0.25rem)] sm:w-44">
          <Select
            aria-label="Filtrer par statut"
            value={filtres.statut}
            onChange={(v) => naviguer({ statut: v })}
          >
            <option value="">Tous les statuts</option>
            {DOSSIER_STATUTS.map((s) => (
              <option key={s} value={s}>
                {DOSSIER_STATUT_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-[calc(50%-0.25rem)] sm:w-44">
          <Select
            aria-label="Filtrer par conducteur"
            value={filtres.conducteur}
            onChange={(v) => naviguer({ conducteur: v })}
          >
            <option value="">Tous les conducteurs</option>
            {conducteurs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </Select>
        </div>

        <DateRangePicker
          du={filtres.du}
          au={filtres.au}
          onChange={(du, au) => naviguer({ du, au })}
          labelDu="Créé du"
          labelAu="au"
        />

        {/* Tri : vue liste uniquement — le kanban garde son ordre. */}
        {filtres.vue === "liste" && (
          // Plus large que les autres selects : « Tri : Activité récente » doit
          // tenir en entier — pas d'ellipse dans le déclencheur.
          <div className="w-full sm:w-52">
            <Select
              aria-label="Trier les dossiers"
              value={filtres.tri}
              onChange={(v) => naviguer({ tri: v as FiltresDossiers["tri"] })}
            >
              {TRI_OPTIONS.map((o) => (
                <option key={o.valeur} value={o.valeur}>
                  Tri : {o.label}
                </option>
              ))}
            </Select>
          </div>
        )}

        {filtresActifs && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              // Réinitialise les FILTRES, en conservant la vue et le tri
              // courants (préférences d'affichage) — omis de l'URL s'ils
              // valent le défaut de l'organisation.
              const params = new URLSearchParams();
              if (filtres.vue !== vueDefaut) params.set("vue", filtres.vue);
              if (filtres.tri !== triDefaut) params.set("tri", filtres.tri);
              const qs = params.toString();
              remplacerUrl(qs ? `/app/dossiers?${qs}` : "/app/dossiers");
            }}
            className="flex h-10 cursor-pointer items-center gap-1 rounded-md px-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="size-4" aria-hidden="true" />
            Réinitialiser
          </button>
        )}

        <Segmented
          ariaLabel="Vue des dossiers"
          className="ml-auto"
          options={[
            { valeur: "kanban", label: "Kanban" },
            { valeur: "liste", label: "Liste" },
          ]}
          valeur={filtres.vue}
          onChange={(v) => naviguer({ vue: v })}
        />
      </div>
    </div>
  );
}
