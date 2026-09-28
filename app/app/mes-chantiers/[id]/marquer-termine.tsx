"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { marquerChantierTermineTerrain } from "./actions";

// Le geste de fin de chantier, côté terrain. Avertissement NON BLOQUANT si
// des documents restent à signer (philosophie du projet : avertir, jamais
// bloquer — le flux nominal est signer PUIS terminer).
export function MarquerTermine({
  chantierId,
  nomClient,
  documentsNonSignes,
}: {
  chantierId: string;
  nomClient: string;
  documentsNonSignes: number;
}) {
  const [confirmer, setConfirmer] = useState(false);
  const [pending, startTransition] = useTransition();

  function terminer() {
    const fd = new FormData();
    fd.set("id", chantierId);
    startTransition(async () => {
      try {
        const res = await marquerChantierTermineTerrain(fd);
        if (res.error) toast.error(res.error);
        else toast.success("Chantier terminé — le bureau est prévenu.");
      } catch {
        toast.error("Une erreur est survenue. Réessayez.");
      }
    });
  }

  const avertissement =
    documentsNonSignes > 0
      ? documentsNonSignes > 1
        ? ` Attention : ${documentsNonSignes} documents restent à faire signer.`
        : " Attention : 1 document reste à faire signer."
      : "";

  return (
    <>
      <Button
        type="button"
        taille="pouce"
        className="w-full"
        disabled={pending}
        onClick={() => setConfirmer(true)}
      >
        {pending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-5" aria-hidden="true" />
        )}
        {pending ? "Envoi…" : "Marquer le chantier terminé"}
      </Button>
      {documentsNonSignes > 0 && (
        <p className="mt-2 text-center text-xs font-medium text-amber-700">
          {documentsNonSignes > 1
            ? `${documentsNonSignes} documents restent à faire signer — pensez-y avant de terminer.`
            : "1 document reste à faire signer — pensez-y avant de terminer."}
        </p>
      )}
      {confirmer && (
        <ConfirmDialog
          ouvert
          onFermer={() => setConfirmer(false)}
          titre="Terminer ce chantier ?"
          description={`Le chantier chez ${nomClient} sera marqué terminé et le bureau prévenu.${avertissement}`}
          labelConfirmer="Terminer le chantier"
          onConfirmer={terminer}
        />
      )}
    </>
  );
}
