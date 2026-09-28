"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui/field";
import { DateRangePicker } from "@/components/ui/date-picker";
import { Segmented } from "@/components/ui/tabs";
import { useNavigationFiltres } from "@/components/ui/zone-filtres";

// Filtres de l'onglet Historique — même mécanique que la barre des Dossiers :
// tout passe par les searchParams (partageable, rechargé server-side), la
// saisie texte est débouncée, les selects sont immédiats. La recherche porte
// sur nom/adresse/téléphone ; le règlement et la période « terminé » affinent,
// le tri réordonne. « termine » (défaut) et reglement "" ne sont pas écrits
// dans l'URL (URL propre).
export type FiltresHistorique = {
  q: string;
  reglement: "" | "paye" | "attente" | "sans_devis";
  du: string;
  au: string;
  tri: "termine" | "montant" | "nom";
  // Bascule Terminés/Annulés. « termines » (défaut) n'est pas écrit dans
  // l'URL ; en vue Annulés, seuls la recherche et le Segmented s'affichent —
  // règlement/période/tri ne s'appliquent qu'aux dossiers terminés.
  vue: "termines" | "annules";
};

const REGLEMENT_OPTIONS: {
  valeur: FiltresHistorique["reglement"];
  label: string;
}[] = [
  { valeur: "", label: "Tous les règlements" },
  { valeur: "paye", label: "Payés" },
  { valeur: "attente", label: "À encaisser" },
  { valeur: "sans_devis", label: "Devis non saisi" },
];

const TRI_OPTIONS: { valeur: FiltresHistorique["tri"]; label: string }[] = [
  { valeur: "termine", label: "Terminé récemment" },
  { valeur: "montant", label: "Montant décroissant" },
  { valeur: "nom", label: "Nom du client" },
];

export function FiltresHistoriqueBar({
  filtres,
  avecBascule,
}: {
  filtres: FiltresHistorique;
  // La bascule Terminés/Annulés n'apparaît que si l'organisation a au moins
  // un dossier annulé (ou si on est déjà en vue Annulés) : une org sans
  // annulé garde une barre strictement identique à avant.
  avecBascule: boolean;
}) {
  // Transition partagée avec la page (ZoneFiltres) : chaque changement de
  // filtre estompe la liste pendant le re-render serveur — feedback immédiat.
  const { naviguer: remplacerUrl } = useNavigationFiltres();
  const [q, setQ] = useState(filtres.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vueAnnules = filtres.vue === "annules";

  function naviguer(patch: Partial<FiltresHistorique>) {
    // Changer de vue purge les filtres non applicables (règlement, période,
    // tri — et la pagination, jamais réécrite ici) : seule la recherche q
    // survit à la bascule Terminés/Annulés.
    const suivant: FiltresHistorique =
      patch.vue !== undefined && patch.vue !== filtres.vue
        ? { q, reglement: "", du: "", au: "", tri: "termine", vue: patch.vue }
        : { ...filtres, q, ...patch };
    const params = new URLSearchParams();
    // URL propre : `vue` n'apparaît que pour la vue Annulés.
    if (suivant.vue === "annules") params.set("vue", "annules");
    if (suivant.q) params.set("q", suivant.q);
    if (suivant.reglement) params.set("reglement", suivant.reglement);
    if (suivant.du) params.set("du", suivant.du);
    if (suivant.au) params.set("au", suivant.au);
    if (suivant.tri !== "termine") params.set("tri", suivant.tri);
    const qs = params.toString();
    remplacerUrl(qs ? `/app/historique?${qs}` : "/app/historique");
  }

  // Débounce de la recherche (350 ms) — les selects restent immédiats.
  // Repart de window.location.search : `vue=annules` (et tout autre paramètre
  // courant) survit naturellement à la frappe.
  function changerRecherche(valeur: string) {
    setQ(valeur);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (valeur) params.set("q", valeur);
      else params.delete("q");
      // Changer la recherche invalide la pagination courante : retour page 1.
      params.delete("page");
      const qs = params.toString();
      remplacerUrl(qs ? `/app/historique?${qs}` : "/app/historique");
    }, 350);
  }
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const filtresActifs = Boolean(
    filtres.q || filtres.reglement || filtres.du || filtres.au,
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
            aria-label={
              vueAnnules
                ? "Rechercher un dossier annulé"
                : "Rechercher un dossier terminé"
            }
            className="pl-9"
          />
        </div>

        {/* Règlement, période et tri : vue Terminés uniquement — ces filtres
            n'ont pas de sens pour un dossier annulé. */}
        {!vueAnnules && (
          <>
            <div className="w-[calc(50%-0.25rem)] sm:w-44">
              <Select
                aria-label="Filtrer par règlement"
                value={filtres.reglement}
                onChange={(v) =>
                  naviguer({ reglement: v as FiltresHistorique["reglement"] })
                }
              >
                {REGLEMENT_OPTIONS.map((o) => (
                  <option key={o.valeur} value={o.valeur}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>

            <DateRangePicker
              du={filtres.du}
              au={filtres.au}
              onChange={(du, au) => naviguer({ du, au })}
              labelDu="Terminé du"
              labelAu="au"
            />

            {/* Plus large que les autres : « Tri : Montant décroissant » doit
                tenir en entier — pas d'ellipse dans le déclencheur. */}
            <div className="w-full sm:w-56">
              <Select
                aria-label="Trier l'historique"
                value={filtres.tri}
                onChange={(v) => naviguer({ tri: v as FiltresHistorique["tri"] })}
              >
                {TRI_OPTIONS.map((o) => (
                  <option key={o.valeur} value={o.valeur}>
                    Tri : {o.label}
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}

        {filtresActifs && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              // Réinitialise les FILTRES en conservant la vue courante
              // (Terminés/Annulés) — omise de l'URL si c'est le défaut.
              remplacerUrl(
                vueAnnules ? "/app/historique?vue=annules" : "/app/historique",
              );
            }}
            className="flex h-10 cursor-pointer items-center gap-1 rounded-md px-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="size-4" aria-hidden="true" />
            Réinitialiser
          </button>
        )}

        {avecBascule && (
          <Segmented
            ariaLabel="Vue de l'historique"
            className="ml-auto"
            options={[
              { valeur: "termines", label: "Terminés" },
              { valeur: "annules", label: "Annulés" },
            ]}
            valeur={filtres.vue}
            onChange={(v) => naviguer({ vue: v })}
          />
        )}
      </div>
    </div>
  );
}
