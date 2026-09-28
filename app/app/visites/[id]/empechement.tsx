"use client";

import { useActionState, useState } from "react";
import { CircleSlash, TriangleAlert } from "lucide-react";
import { MOTIFS_EMPECHEMENT } from "@/lib/metier";
import { useSyncEnvois } from "@/lib/sync";
import { cn } from "@/lib/ui";
import { LIMITES } from "@/lib/validation";
import { signalerEmpechement, type ActionState } from "./actions";

// Le motif final composé côté serveur (./actions.ts) est au pire
// `${préset} — ${précision}`, borné à LIMITES.MOTIF_EMPECHEMENT : on borne la
// précision à la limite moins le préfixe le plus long (préset + « — ») pour
// ne jamais buter sur la validation serveur.
const PREFIXE_PRESET_MAX =
  Math.max(...MOTIFS_EMPECHEMENT.map((m) => m.length)) + " — ".length;
const MAX_PRECISION = LIMITES.MOTIF_EMPECHEMENT - PREFIXE_PRESET_MAX;

// Un redirect() serveur réussi est transporté par Next sous forme d'erreur au
// digest NEXT_REDIRECT : il doit RESSORTIR du catch (c'est le succès), seule
// la coupure réseau (fetch rejeté) est traduite en erreur affichable.
function estRedirectNext(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    String((err as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}

// Signalement d'empêchement terrain (client absent, accès impossible…) :
// bouton discret sous la fiche, qui déplie une section de confirmation
// mobile-first (présets en radios pleine largeur, cibles ≥ 44 px, texte
// 16 px). L'action supprime la visite du planning — confirmation destructive
// explicite, jamais un tap accidentel.
export function SignalerEmpechement({ visiteId }: { visiteId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState<string>("");
  const { envois } = useSyncEnvois();

  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData): Promise<ActionState> => {
      try {
        // Succès = redirect() serveur (jamais de retour) ; le `?? { error:
        // null }` n'est qu'un filet de typage.
        return (await signalerEmpechement(prev, formData)) ?? { error: null };
      } catch (err) {
        if (estRedirectNext(err)) throw err;
        // Hors-ligne : l'appel de Server Action échoue naturellement — pas de
        // file de rejeu ici (contrairement au compte-rendu) : signaler un
        // empêchement en différé n'aurait aucun sens pour le bureau.
        return {
          error:
            "Connexion requise pour signaler un empêchement. Réessayez une fois du réseau retrouvé.",
        };
      }
    },
    { error: null },
  );

  // Un compte-rendu est déjà en file locale pour cette visite : elle a été
  // faite — proposer l'empêchement serait contradictoire (et casserait le
  // rejeu, la visite étant supprimée côté serveur).
  if (envois.some((e) => e.brouillon.visiteId === visiteId)) return null;

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
      >
        <CircleSlash className="size-4 shrink-0" aria-hidden="true" />
        Impossible d&apos;effectuer la visite ?
      </button>
    );
  }

  return (
    <section
      aria-label="Signaler un empêchement"
      className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-xs animate-[carte-in_250ms_var(--ease-sortie)]"
    >
      <div className="space-y-1">
        <h2 className="font-display text-base font-medium text-neutral-900">
          Signaler un empêchement
        </h2>
        <p className="text-sm text-neutral-500">
          Indiquez au bureau pourquoi la visite ne peut pas être effectuée.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="visiteId" value={visiteId} />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-neutral-800">
            Motif
          </legend>
          {MOTIFS_EMPECHEMENT.map((m) => (
            <label
              key={m}
              className={cn(
                "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-md border bg-white px-3 text-base text-neutral-900 shadow-xs transition-colors",
                motif === m
                  ? "border-primary-400 bg-primary-50"
                  : "border-neutral-300 hover:border-neutral-400",
              )}
            >
              <input
                type="radio"
                name="motif"
                value={m}
                checked={motif === m}
                onChange={() => setMotif(m)}
                required
                className="size-5 shrink-0 accent-primary-600"
              />
              {m}
            </label>
          ))}
        </fieldset>

        <div className="space-y-1.5">
          <label
            htmlFor="precision-empechement"
            className="block text-sm font-medium text-neutral-800"
          >
            Précision{" "}
            <span className="font-normal text-neutral-500">
              {motif === "Autre" ? "(obligatoire)" : "(facultatif)"}
            </span>
          </label>
          <textarea
            id="precision-empechement"
            name="precision"
            rows={2}
            maxLength={MAX_PRECISION}
            required={motif === "Autre"}
            placeholder={
              motif === "Autre"
                ? "Décrivez l'empêchement"
                : "Ex. : personne au domicile, portail fermé…"
            }
            className="min-h-20 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-base leading-relaxed text-neutral-900 shadow-xs transition-colors placeholder:text-neutral-400 hover:border-neutral-400"
          />
        </div>

        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          La visite sera retirée de votre planning ; le bureau devra
          re-planifier.
        </p>

        {state.error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {state.error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="flex h-12 flex-[1.2] cursor-pointer items-center justify-center gap-1.5 rounded-md bg-red-600 px-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 active:bg-red-800 disabled:pointer-events-none disabled:opacity-50"
          >
            <CircleSlash className="size-4 shrink-0" aria-hidden="true" />
            {pending ? "Signalement…" : "Signaler l'empêchement"}
          </button>
          <button
            type="button"
            onClick={() => setOuvert(false)}
            disabled={pending}
            className="flex h-12 flex-1 cursor-pointer items-center justify-center rounded-md border border-neutral-300 bg-white px-2 text-sm font-medium text-neutral-800 shadow-xs transition-colors hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-50"
          >
            Annuler
          </button>
        </div>
      </form>
    </section>
  );
}
