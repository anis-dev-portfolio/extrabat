"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { BadgeEuro, CircleCheck, Pencil, RotateCcw } from "lucide-react";
import {
  annulerPaiement,
  enregistrerDevis,
  marquerPaye,
  type DevisState,
} from "../actions";
import { Button, TACTILE_MOBILE } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { centimesVersSaisie, formatEuros } from "@/lib/finances";
import { LIMITES } from "@/lib/validation";

const initial: DevisState = { error: null, ok: false, saisie: null };

type Confirmation = "payer" | "annuler" | null;

// Carte « Devis » de la fiche dossier (back-office). Miroir des montants faits
// sur Tolteck : lecture par défaut, édition sur place (useActionState). Le
// volet paiement n'apparaît que sur un dossier terminé — « payé » est un fait
// découplé du « terminé » (le règlement arrive après les travaux).
export function DevisFinancier({
  dossier,
}: {
  dossier: {
    id: string;
    statut: string;
    montantDevis: number | null;
    franchise: number | null;
    refDevis: string | null;
    // Date de paiement pré-formatée côté serveur (null = pas encore payé).
    payeLe: string | null;
  };
}) {
  const [edition, setEdition] = useState(false);
  const action = enregistrerDevis.bind(null, dossier.id);
  const [state, formAction, pending] = useActionState(action, initial);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [paiementEnCours, setPaiementEnCours] = useState(false);

  useEffect(() => {
    if (state === initial) return;
    if (state.ok) {
      toast.success("Devis enregistré.");
      setEdition(false);
    }
  }, [state]);

  const devisSaisi = dossier.montantDevis != null;
  const estTermine = dossier.statut === "TERMINE";

  // React réinitialise les inputs non contrôlés après l'action : après une
  // erreur serveur (montant invalide…), la saisie renvoyée par l'action
  // re-remplit le formulaire — sinon les montants tapés reviendraient aux
  // valeurs du dossier. En ouverture normale, valeurs actuelles du dossier.
  const valeurs = state.saisie ?? {
    montantDevis:
      dossier.montantDevis != null
        ? centimesVersSaisie(dossier.montantDevis)
        : "",
    franchise:
      dossier.franchise != null ? centimesVersSaisie(dossier.franchise) : "",
    refDevis: dossier.refDevis ?? "",
  };

  function executerPaiement(
    action: (fd: FormData) => Promise<{ error: string | null }>,
    succes: string,
  ) {
    const fd = new FormData();
    fd.set("dossierId", dossier.id);
    setPaiementEnCours(true);
    startTransition(async () => {
      const res = await action(fd);
      setPaiementEnCours(false);
      if (res?.error) toast.error(res.error);
      else toast.success(succes);
    });
  }

  if (edition) {
    return (
      <form action={formAction} className="space-y-3">
        <Field
          label="Montant HT"
          htmlFor="montantDevis"
          aide="Le total HT lu sur le devis Tolteck (ex. « 1 500 » ou « 1500,50 »)."
        >
          <Input
            id="montantDevis"
            name="montantDevis"
            required
            inputMode="decimal"
            maxLength={16}
            defaultValue={valeurs.montantDevis}
            placeholder="1500"
          />
        </Field>
        <Field label="Franchise (optionnel)" htmlFor="franchise">
          <Input
            id="franchise"
            name="franchise"
            inputMode="decimal"
            maxLength={16}
            defaultValue={valeurs.franchise}
            placeholder="Part à la charge du client"
          />
        </Field>
        <Field label="N° de devis Tolteck (optionnel)" htmlFor="refDevis">
          <Input
            id="refDevis"
            name="refDevis"
            maxLength={LIMITES.REF_DEVIS}
            defaultValue={valeurs.refDevis}
            placeholder="Pour retrouver le devis dans Tolteck"
          />
        </Field>

        {state.error && (
          <p role="alert" className="text-sm text-red-700">
            {state.error}
          </p>
        )}

        <div className="flex gap-2">
          <Button type="submit" taille="sm" className={TACTILE_MOBILE} disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Button
            variante="fantome"
            taille="sm"
            className={TACTILE_MOBILE}
            disabled={pending}
            onClick={() => setEdition(false)}
          >
            Annuler
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {devisSaisi ? (
        <dl className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-neutral-500">Montant HT</dt>
            <dd className="font-semibold text-neutral-900 tabular-nums">
              {formatEuros(dossier.montantDevis!)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-neutral-500">Franchise</dt>
            <dd className="text-neutral-800 tabular-nums">
              {dossier.franchise != null ? (
                formatEuros(dossier.franchise)
              ) : (
                <span className="text-neutral-400">—</span>
              )}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-neutral-500">N° de devis</dt>
            <dd className="text-neutral-800">
              {dossier.refDevis || <span className="text-neutral-400">—</span>}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-neutral-500">
          Devis non saisi. Reportez ici les montants du devis Tolteck.
        </p>
      )}

      <Button variante="secondaire" taille="sm" className={TACTILE_MOBILE} onClick={() => setEdition(true)}>
        {devisSaisi ? (
          <>
            <Pencil className="size-3.5" aria-hidden="true" />
            Modifier le devis
          </>
        ) : (
          <>
            <BadgeEuro className="size-3.5" aria-hidden="true" />
            Saisir le devis
          </>
        )}
      </Button>

      {/* Volet paiement : uniquement sur un dossier terminé. */}
      {estTermine && (
        <div className="space-y-2 border-t border-neutral-100 pt-4">
          {dossier.payeLe ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
                Payé le {dossier.payeLe}
              </p>
              <Button
                variante="fantome"
                taille="sm"
                className={TACTILE_MOBILE}
                disabled={paiementEnCours}
                onClick={() => setConfirmation("annuler")}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Annuler le paiement
              </Button>
            </>
          ) : devisSaisi ? (
            <>
              <p className="text-sm text-amber-700">À encaisser.</p>
              <Button
                taille="sm"
                className={`w-full ${TACTILE_MOBILE}`}
                disabled={paiementEnCours}
                onClick={() => setConfirmation("payer")}
              >
                <CircleCheck className="size-4" aria-hidden="true" />
                Marquer payé
              </Button>
            </>
          ) : (
            <p className="text-xs text-neutral-500">
              Saisissez le montant du devis pour pouvoir marquer ce dossier
              payé — on ne marque jamais payé un montant inconnu.
            </p>
          )}
        </div>
      )}

      {confirmation === "payer" && (
        <ConfirmDialog
          ouvert
          onFermer={() => setConfirmation(null)}
          titre="Marquer ce dossier payé ?"
          description={`Le règlement de ${dossier.montantDevis != null ? formatEuros(dossier.montantDevis) : "ce dossier"} HT sera enregistré comme reçu aujourd'hui (réversible via « Annuler le paiement »).`}
          labelConfirmer="Marquer payé"
          onConfirmer={() =>
            executerPaiement(marquerPaye, "Paiement enregistré.")
          }
        />
      )}
      {confirmation === "annuler" && (
        <ConfirmDialog
          ouvert
          onFermer={() => setConfirmation(null)}
          titre="Annuler le paiement ?"
          description="Le dossier repassera « à encaisser » et sortira du chiffre d'affaires réalisé."
          labelConfirmer="Annuler le paiement"
          danger
          onConfirmer={() =>
            executerPaiement(annulerPaiement, "Paiement annulé.")
          }
        />
      )}
    </div>
  );
}
