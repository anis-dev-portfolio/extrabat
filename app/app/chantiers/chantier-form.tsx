"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  HardHat,
  Minus,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, Input } from "@/components/ui/field";
import {
  ajouterJoursLocal,
  dateVersParamJour,
  debutSemaineLocal,
  parseParamJour,
} from "@/lib/planning";
import {
  DUREE_CHANTIER_MAX_JOURS,
  detecterConflitsOuvrier,
  finDepuisDuree,
  libelleConflitChantier,
} from "@/lib/chantiers";
import type { OuvrierDispo } from "@/lib/chantiers-data";
import { formatJourLongFr } from "@/lib/format";
import type { ChantierState } from "./actions";

// Dossier proposé au formulaire : la matière première de la fiche ouvrier
// (adresse, tél, accès) + les données de la dernière visite réalisée, POUR
// RÉFÉRENCE pendant la planification (jamais copiées automatiquement).
export type DossierOption = {
  id: string;
  nomClient: string;
  adresse: string;
  telephone: string;
  infosAcces: string | null;
  joursEstimes: number | null;
  conclusion: string | null;
};

export type ValeursChantier = {
  dateDebut: string; // YYYY-MM-DD
  nbJours: number;
  ouvrierIds: string[];
};

const initial: ChantierState = { error: null, conflits: [] };

// Recherche accent- et casse-insensible (« francois » trouve « François »).
function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const MAX_RESULTATS = 8;

// Formulaire partagé création/édition. Les avertissements de dispo par
// ouvrier sont calculés EN DIRECT côté client (fonctions pures de
// lib/chantiers.ts sur les dispos préchargées) — le serveur re-vérifie de
// toute façon en transaction et renvoie `state.conflits` si `forcer` manque.
export function ChantierForm({
  action,
  dossiers,
  dossierInitialId,
  dossierFige,
  ouvriers,
  valeursInitiales,
  labelSubmit,
}: {
  action: (
    state: ChantierState,
    formData: FormData,
  ) => Promise<ChantierState>;
  dossiers: DossierOption[];
  dossierInitialId: string; // "" = aucun présélectionné (recherche d'abord)
  dossierFige: boolean; // édition : le dossier ne change pas
  ouvriers: OuvrierDispo[];
  valeursInitiales?: ValeursChantier;
  labelSubmit: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  const [dossierId, setDossierId] = useState(dossierInitialId);
  const [recherche, setRecherche] = useState("");
  const dossier = dossiers.find((d) => d.id === dossierId) ?? null;

  const [dateDebut, setDateDebut] = useState(valeursInitiales?.dateDebut ?? "");
  const [nbJours, setNbJours] = useState(
    valeursInitiales
      ? String(valeursInitiales.nbJours)
      : String(dossier?.joursEstimes ?? 1),
  );
  const [coches, setCoches] = useState<Set<string>>(
    new Set(valeursInitiales?.ouvrierIds ?? []),
  );

  // Plage candidate (jours civils inclus) — null tant que la saisie est
  // incomplète/invalide : les avertissements de dispo attendent des dates.
  const plage = useMemo(() => {
    const debut = parseParamJour(dateDebut || undefined);
    const n = Number(nbJours);
    if (!debut || !Number.isInteger(n) || n < 1 || n > DUREE_CHANTIER_MAX_JOURS) {
      return null;
    }
    return { dateDebut: debut, dateFin: finDepuisDuree(debut, n) };
  }, [dateDebut, nbJours]);

  // Raccourcis de début : les départs réels d'un chantier (aujourd'hui,
  // demain, début de semaine suivante). Calculés une fois au montage.
  const raccourcisDebut = useMemo(() => {
    const maintenant = new Date();
    return [
      { label: "Aujourd'hui", valeur: dateVersParamJour(maintenant) },
      {
        label: "Demain",
        valeur: dateVersParamJour(ajouterJoursLocal(maintenant, 1)),
      },
      {
        label: "Lundi prochain",
        valeur: dateVersParamJour(
          ajouterJoursLocal(debutSemaineLocal(maintenant), 7),
        ),
      },
    ];
  }, []);

  // Résultats de recherche : sans saisie, la file complète (les plus anciens
  // d'abord, comme la liste « à planifier ») ; sinon filtre nom + adresse.
  const resultats = useMemo(() => {
    const q = normaliser(recherche.trim());
    if (!q) return dossiers;
    return dossiers.filter((d) =>
      normaliser(`${d.nomClient} ${d.adresse}`).includes(q),
    );
  }, [dossiers, recherche]);

  function changerDossier(id: string) {
    setDossierId(id);
    // La durée proposée suit le dossier choisi (jours estimés de la dernière
    // visite) — modifiable ensuite.
    const suivant = dossiers.find((d) => d.id === id);
    setNbJours(String(suivant?.joursEstimes ?? 1));
  }

  function ajusterJours(delta: number) {
    setNbJours((prev) => {
      const n = Number(prev);
      const base = Number.isInteger(n) && n >= 1 ? n : 1;
      return String(
        Math.min(DUREE_CHANTIER_MAX_JOURS, Math.max(1, base + delta)),
      );
    });
  }

  function basculerOuvrier(id: string, coche: boolean) {
    setCoches((prev) => {
      const suivant = new Set(prev);
      if (coche) suivant.add(id);
      else suivant.delete(id);
      return suivant;
    });
  }

  return (
    <form action={formAction} className="space-y-5">
      {/* ── Client (dossier prêt pour travaux) ──────────────────── */}
      <input type="hidden" name="dossierId" value={dossierId} />

      {!dossierFige && !dossier && (
        <Field
          label="Client"
          htmlFor="recherche-client"
          aide="Seuls les dossiers « Prêt pour travaux » peuvent passer en chantier."
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400"
              aria-hidden="true"
            />
            <Input
              id="recherche-client"
              type="search"
              autoFocus
              autoComplete="off"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un client (nom, adresse)…"
              className="pl-9"
            />
          </div>
          {resultats.length === 0 ? (
            <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
              Aucun dossier « Prêt pour travaux » ne correspond à «{" "}
              {recherche.trim()} ».
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
              {resultats.slice(0, MAX_RESULTATS).map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => changerDossier(d.id)}
                    className="flex w-full cursor-pointer flex-wrap items-baseline gap-x-2 px-3 py-2 text-left text-sm transition-colors hover:bg-primary-50"
                  >
                    <span className="font-medium text-neutral-900">
                      {d.nomClient}
                    </span>
                    <span className="text-neutral-500">{d.adresse}</span>
                  </button>
                </li>
              ))}
              {resultats.length > MAX_RESULTATS && (
                <li className="px-3 py-2 text-xs text-neutral-500">
                  {resultats.length - MAX_RESULTATS} autre
                  {resultats.length - MAX_RESULTATS > 1 ? "s" : ""} dossier
                  {resultats.length - MAX_RESULTATS > 1 ? "s" : ""} — affinez la
                  recherche.
                </li>
              )}
            </ul>
          )}
        </Field>
      )}

      {dossier && (
        <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium text-neutral-900">
              {dossier.nomClient}
              <span className="ml-2 font-normal text-neutral-500">
                {dossier.telephone}
              </span>
            </p>
            {!dossierFige && (
              <button
                type="button"
                onClick={() => {
                  setDossierId("");
                  setRecherche("");
                }}
                className="shrink-0 cursor-pointer text-xs font-medium text-primary-800 hover:underline"
              >
                Changer de client
              </button>
            )}
          </div>
          <p className="text-neutral-600">{dossier.adresse}</p>
          {dossier.infosAcces && (
            <p className="text-neutral-600">
              <span className="text-xs font-medium text-neutral-500 uppercase">
                Accès :
              </span>{" "}
              {dossier.infosAcces}
            </p>
          )}
          {(dossier.joursEstimes != null || dossier.conclusion) && (
            <div className="border-t border-neutral-200 pt-2 text-neutral-600">
              <p className="text-xs font-medium text-neutral-500 uppercase">
                Dernière visite d&apos;expert
              </p>
              {dossier.joursEstimes != null && (
                <p>{dossier.joursEstimes} j de réparation estimés</p>
              )}
              {dossier.conclusion && (
                <p className="line-clamp-4 whitespace-pre-wrap text-neutral-500">
                  {dossier.conclusion}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Dates (jours entiers) ───────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Début des travaux" htmlFor="dateDebut">
          <input type="hidden" name="dateDebut" value={dateDebut} />
          <DatePicker
            id="dateDebut"
            ariaLabel="Date de début des travaux"
            value={dateDebut}
            onChange={setDateDebut}
          />
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {raccourcisDebut.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => setDateDebut(r.valeur)}
                className={
                  dateDebut === r.valeur
                    ? "inline-flex h-7 cursor-pointer items-center rounded-full border border-primary-300 bg-primary-50 px-2.5 text-xs font-medium text-primary-800"
                    : "inline-flex h-7 cursor-pointer items-center rounded-full border border-neutral-300 bg-white px-2.5 text-xs text-neutral-700 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-900"
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        </Field>
        <Field
          label="Durée (jours)"
          htmlFor="nbJours"
          aide={
            dossier?.joursEstimes != null
              ? `Proposée d'après la visite (${dossier.joursEstimes} j), modifiable.`
              : undefined
          }
        >
          <div className="flex items-stretch gap-1.5">
            <button
              type="button"
              onClick={() => ajusterJours(-1)}
              disabled={Number(nbJours) <= 1}
              aria-label="Un jour de moins"
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 shadow-xs transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-white"
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <Input
              id="nbJours"
              name="nbJours"
              type="number"
              min={1}
              max={DUREE_CHANTIER_MAX_JOURS}
              required
              value={nbJours}
              onChange={(e) => setNbJours(e.target.value)}
              className="text-center tabular-nums"
            />
            <button
              type="button"
              onClick={() => ajusterJours(1)}
              disabled={Number(nbJours) >= DUREE_CHANTIER_MAX_JOURS}
              aria-label="Un jour de plus"
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 shadow-xs transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-white"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </div>
        </Field>
      </div>
      {plage && (
        <p className="flex items-center gap-2 rounded-md border border-primary-100 bg-primary-50 px-3 py-2 text-sm text-primary-900">
          <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
          <span>
            Du <strong>{formatJourLongFr(plage.dateDebut)}</strong> au{" "}
            <strong>{formatJourLongFr(plage.dateFin)}</strong> inclus.
          </span>
        </p>
      )}

      {/* ── Ouvriers ────────────────────────────────────────────── */}
      <fieldset className="space-y-2">
        <legend className="block text-sm font-medium text-neutral-800">
          Ouvriers affectés
        </legend>
        {ouvriers.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setCoches(new Set(ouvriers.map((o) => o.id)))}
              className="cursor-pointer font-medium text-primary-800 hover:underline"
            >
              Tout sélectionner
            </button>
            <span aria-hidden="true" className="text-neutral-300">
              ·
            </span>
            <button
              type="button"
              onClick={() => setCoches(new Set())}
              className="cursor-pointer font-medium text-primary-800 hover:underline"
            >
              Tout retirer
            </button>
          </div>
        )}
        {ouvriers.length === 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Aucun ouvrier actif —{" "}
            <Link
              href="/app/parametres/ouvriers"
              className="font-medium underline"
            >
              ajoutez l&apos;équipe dans Paramètres → Ouvriers
            </Link>{" "}
            avant de créer un chantier.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
            {ouvriers.map((o) => {
              const conflits = plage
                ? detecterConflitsOuvrier(plage, {
                    chantiers: o.chantiers,
                    absences: o.absences,
                  })
                : [];
              return (
                <li key={o.id} className="px-3 py-2">
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      name="ouvriers"
                      value={o.id}
                      checked={coches.has(o.id)}
                      onChange={(e) => basculerOuvrier(o.id, e.target.checked)}
                      className="size-4 accent-primary-600"
                    />
                    <span className="font-medium text-neutral-900">
                      {o.nom}
                      {!o.actif && (
                        <span className="ml-1.5 text-xs font-normal text-neutral-400">
                          (inactif)
                        </span>
                      )}
                    </span>
                  </label>
                  {conflits.length > 0 && (
                    <ul className="mt-1 space-y-0.5 pl-6.5">
                      {conflits.map((c, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-1 text-xs text-amber-700"
                        >
                          <TriangleAlert
                            className="mt-0.5 size-3 shrink-0"
                            aria-hidden="true"
                          />
                          {libelleConflitChantier(c)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      {/* ── Conflits re-détectés par le serveur + forçage ───────── */}
      {state.conflits.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            Conflits de disponibilité
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-sm text-amber-800">
            {state.conflits.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm font-medium text-amber-900">
            <input
              type="checkbox"
              name="forcer"
              value="1"
              className="size-4 accent-amber-600"
            />
            {labelSubmit} quand même malgré les conflits
          </label>
        </div>
      )}

      {state.error && state.conflits.length === 0 && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending || ouvriers.length === 0 || !dossierId || !dateDebut}
        className="w-full sm:w-auto"
      >
        <HardHat className="size-4" aria-hidden="true" />
        {pending ? "Enregistrement…" : labelSubmit}
      </Button>
    </form>
  );
}
