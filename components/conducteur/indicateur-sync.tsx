"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  CloudOff,
  CloudUpload,
  FilePenLine,
  RefreshCw,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  useSyncEnvois,
  synchroniser,
  reessayer,
  remettreEnBrouillon,
} from "@/lib/sync";
import { VersionBuild } from "@/components/version-build";
import { cn } from "@/lib/ui";

// Indicateur global de connectivité + file d'attente d'envoi, dans le header
// conducteur. Discret : rien à afficher = rien de rendu. Toucher la pastille
// ouvre une feuille listant les envois en attente/erreur, avec réessai et
// retour en brouillon (aucune saisie n'est jamais perdue en silence).
export function IndicateurSync() {
  const { enLigne, synchronisation, envois } = useSyncEnvois();
  const [ouvert, setOuvert] = useState(false);

  const erreurs = envois.filter((e) => e.statut === "ERREUR").length;
  if (enLigne && envois.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className={cn(
          "flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
          erreurs > 0
            ? "border-red-200 bg-red-50 text-red-800"
            : !enLigne
              ? "border-neutral-300 bg-neutral-100 text-neutral-700"
              : "border-amber-300 bg-amber-50 text-amber-900",
        )}
      >
        {!enLigne ? (
          <CloudOff className="size-3.5" aria-hidden="true" />
        ) : synchronisation ? (
          <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
        ) : erreurs > 0 ? (
          <TriangleAlert className="size-3.5" aria-hidden="true" />
        ) : (
          <CloudUpload className="size-3.5" aria-hidden="true" />
        )}
        {!enLigne && envois.length === 0 && "Hors ligne"}
        {envois.length > 0 &&
          `${envois.length} en attente${erreurs > 0 ? ` · ${erreurs} refus` : ""}`}
      </button>

      {/* Portal vers <body> : l'indicateur vit dans le header sticky (z-20),
          qui crée un contexte d'empilement — rendue à l'intérieur, la feuille
          serait peinte SOUS la barre d'onglets (fixed z-20, plus tard dans le
          DOM) et son bouton « Envoyer maintenant » resterait masqué en bas. */}
      {ouvert &&
        createPortal(
          <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setOuvert(false)}
            className="absolute inset-0 cursor-default bg-black/40 animate-[overlay-in_250ms_ease-out]"
          />
          {/* Feuille en colonne : en-tête et pied fixes, contenu scrollable
              entre les deux — le bouton d'action reste TOUJOURS visible,
              au-dessus de la barre home (safe-area). */}
          <div className="absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col rounded-t-2xl bg-white shadow-lg animate-[feuille-in_350ms_var(--ease-sortie)]">
            <div
              aria-hidden="true"
              className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-neutral-300"
            />
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-2.5">
              <h2 className="font-display text-base font-bold text-neutral-900">
                Envois en attente
              </h2>
              <button
                type="button"
                onClick={() => setOuvert(false)}
                aria-label="Fermer"
                className="flex size-11 cursor-pointer items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {!enLigne && (
                <p className="flex items-start gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-700">
                  <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Réseau indisponible ou instable — tout partira automatiquement
                  à son retour.
                </p>
              )}

              {envois.length === 0 ? (
                <p className="py-4 text-center text-sm text-neutral-500">
                  Aucun envoi en attente.
                </p>
              ) : (
                envois.map((envoi) => {
                  const { visiteId, titre } = envoi.brouillon;
                  const enErreur = envoi.statut === "ERREUR";
                  return (
                    <div
                      key={visiteId}
                      className={cn(
                        "space-y-2 rounded-lg border p-3",
                        enErreur
                          ? "border-red-200 bg-red-50"
                          : "border-neutral-200 bg-white",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium text-neutral-900">
                          {titre ?? "Compte-rendu de visite"}
                        </p>
                        <span
                          className={cn(
                            "shrink-0 text-xs font-medium",
                            enErreur ? "text-red-700" : "text-amber-800",
                          )}
                        >
                          {envoi.statut === "ENVOI"
                            ? "Envoi…"
                            : enErreur
                              ? "Refusé"
                              : "En attente"}
                        </span>
                      </div>
                      {enErreur && envoi.derniereErreur && (
                        <p className="text-xs text-red-700">
                          {envoi.derniereErreur}
                        </p>
                      )}
                      {envoi.statut === "EN_ATTENTE" && envoi.tentatives > 0 && (
                        <p className="text-xs text-amber-800">
                          {envoi.derniereErreur ?? "Dernier essai infructueux"} —
                          nouvel essai automatique.
                        </p>
                      )}
                      {envoi.statut !== "ENVOI" &&
                        (enErreur || envoi.tentatives > 0) && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void reessayer(visiteId)}
                            className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-primary-600 px-2 text-xs font-semibold text-white transition-colors hover:bg-primary-700"
                          >
                            <RefreshCw className="size-3.5" aria-hidden="true" />
                            Réessayer maintenant
                          </button>
                          <Link
                            href={`/app/visites/${visiteId}`}
                            onClick={() => {
                              void remettreEnBrouillon(visiteId);
                              setOuvert(false);
                            }}
                            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-100"
                          >
                            <FilePenLine className="size-3.5" aria-hidden="true" />
                            Reprendre en brouillon
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Diagnostic : version du bundle client réellement exécuté. */}
              <VersionBuild className="pt-1 text-center" />
            </div>

            {/* Toujours proposé s'il reste des envois rejouables — même si
                l'appareil se CROIT hors-ligne (navigator.onLine ment parfois
                en PWA iOS) : l'essai tranche en quelques secondes. */}
            {envois.some((e) => e.statut !== "ERREUR") && (
              <div className="shrink-0 border-t border-neutral-200 bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
                <button
                  type="button"
                  disabled={synchronisation}
                  onClick={() => void synchroniser()}
                  className="flex h-12 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-primary-600 text-sm font-semibold text-white transition-colors hover:bg-primary-700 active:bg-primary-800 disabled:pointer-events-none disabled:opacity-50"
                >
                  <RefreshCw
                    className={cn("size-4", synchronisation && "animate-spin")}
                    aria-hidden="true"
                  />
                  {synchronisation ? "Envoi en cours…" : "Envoyer maintenant"}
                </button>
              </div>
            )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
