"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Ban, RotateCcw, TriangleAlert } from "lucide-react";
import { MOTIFS_ANNULATION } from "@/lib/metier";
import { cn } from "@/lib/ui";
import { LIMITES } from "@/lib/validation";
import { annulerDossier, reprendreDossier, type ActionState } from "../actions";
import { Button, type BoutonTaille } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";

// Le motif final composé côté serveur (../actions.ts) est au pire
// `${préset} — ${précision}`, borné à LIMITES.MOTIF_ANNULATION : on borne la
// précision à la limite moins le préfixe le plus long (préset + « — ») pour
// ne jamais buter sur la validation serveur.
const PREFIXE_PRESET_MAX =
  Math.max(...MOTIFS_ANNULATION.map((m) => m.length)) + " — ".length;
const MAX_PRECISION = LIMITES.MOTIF_ANNULATION - PREFIXE_PRESET_MAX;

const initial: ActionState = { error: null };

// Annulation d'un dossier (apporteur qui se rétracte, client injoignable…) :
// bouton discret en bas de la barre latérale, qui ouvre un dialog de
// confirmation avec motif (présets en radios + précision libre). L'action
// supprime les visites planifiées — conséquences annoncées avant de valider.
export function AnnulerDossier({ dossierId }: { dossierId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState<string>("");
  const precisionRef = useRef<HTMLTextAreaElement>(null);
  const [etat, formAction, pending] = useActionState(annulerDossier, initial);
  const router = useRouter();

  // Succès : toast + fermeture + refresh (le dossier passe ANNULE, le bouton
  // disparaît du rendu serveur). L'erreur, elle, reste affichée dans le dialog.
  useEffect(() => {
    if (etat === initial || etat.error) return;
    toast.success("Dossier annulé.");
    setOuvert(false);
    router.refresh();
  }, [etat, router]);

  function choisirMotif(m: string) {
    setMotif(m);
    // « Autre » rend la précision obligatoire : on y amène la saisie.
    if (m === "Autre") precisionRef.current?.focus();
  }

  return (
    <>
      <Button
        variante="fantome"
        className="w-full text-red-700 hover:bg-red-50 hover:text-red-800"
        onClick={() => setOuvert(true)}
      >
        <Ban className="size-4" aria-hidden="true" />
        Annuler le dossier
      </Button>

      <Dialog
        ouvert={ouvert}
        onFermer={() => setOuvert(false)}
        titre="Annuler le dossier ?"
      >
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="dossierId" value={dossierId} />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-neutral-800">
              Motif
            </legend>
            {MOTIFS_ANNULATION.map((m) => (
              <label
                key={m}
                className={cn(
                  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md border bg-white px-3 text-sm text-neutral-900 shadow-xs transition-colors",
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
                  onChange={() => choisirMotif(m)}
                  required
                  className="size-4 shrink-0 accent-primary-600"
                />
                {m}
              </label>
            ))}
          </fieldset>

          <div className="space-y-1.5">
            <label
              htmlFor="precision-annulation"
              className="block text-sm font-medium text-neutral-800"
            >
              Précision{" "}
              <span className="font-normal text-neutral-500">
                {motif === "Autre" ? "(obligatoire)" : "(facultatif)"}
              </span>
            </label>
            <textarea
              ref={precisionRef}
              id="precision-annulation"
              name="precision"
              rows={2}
              maxLength={MAX_PRECISION}
              required={motif === "Autre"}
              placeholder={
                motif === "Autre"
                  ? "Décrivez le motif d'annulation"
                  : "Ex. : pris en charge par une autre entreprise…"
              }
              className="min-h-20 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm leading-relaxed text-neutral-900 shadow-xs transition-colors placeholder:text-neutral-400 hover:border-neutral-400"
            />
          </div>

          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            Les visites planifiées seront supprimées et les conducteurs
            prévenus. Le dossier restera consultable dans l&apos;Historique et
            pourra être repris.
          </p>

          {etat.error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
            >
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {etat.error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variante="secondaire"
              disabled={pending}
              onClick={() => setOuvert(false)}
            >
              Fermer
            </Button>
            <Button type="submit" variante="danger" disabled={pending}>
              <Ban className="size-4" aria-hidden="true" />
              {pending ? "Annulation…" : "Annuler le dossier"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

// Reprise d'un dossier ANNULE : confirmation simple (non destructive), le
// serveur re-dérive le statut depuis les visites réalisées. Affiché dans le
// bandeau « Dossier annulé » et dans la carte Actions.
export function ReprendreDossier({
  dossierId,
  taille = "md",
  className,
}: {
  dossierId: string;
  taille?: BoutonTaille;
  className?: string;
}) {
  const [confirmer, setConfirmer] = useState(false);
  const [etat, reprendre, pending] = useActionState(reprendreDossier, initial);
  const router = useRouter();

  useEffect(() => {
    if (etat === initial) return;
    if (etat.error) {
      toast.error(etat.error);
    } else {
      toast.success("Dossier repris.");
      router.refresh();
    }
  }, [etat, router]);

  return (
    <>
      <Button
        variante="secondaire"
        taille={taille}
        className={className}
        disabled={pending}
        onClick={() => setConfirmer(true)}
      >
        <RotateCcw className="size-4" aria-hidden="true" />
        {pending ? "Reprise…" : "Reprendre le dossier"}
      </Button>

      <ConfirmDialog
        ouvert={confirmer}
        onFermer={() => setConfirmer(false)}
        titre="Reprendre ce dossier ?"
        description="Le dossier retrouvera un statut cohérent, dérivé de ses visites réalisées."
        labelConfirmer="Reprendre"
        onConfirmer={() => {
          const fd = new FormData();
          fd.set("dossierId", dossierId);
          startTransition(() => reprendre(fd));
        }}
      />
    </>
  );
}
