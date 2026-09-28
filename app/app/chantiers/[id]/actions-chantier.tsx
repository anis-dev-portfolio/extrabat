"use client";

import { useState, useTransition } from "react";
import { CircleCheck, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import {
  rouvrirChantier,
  supprimerChantier,
  terminerChantier,
} from "../actions";

type Confirmation = "terminer" | "rouvrir" | "supprimer" | null;

// Actions du cycle de vie sur la fiche chantier. Terminer/rouvrir restent sur
// la page (revalidatePath rafraîchit) ; supprimer redirige côté serveur vers
// la liste (la fiche n'existe plus).
export function ActionsChantier({
  chantierId,
  termine,
  nomClient,
}: {
  chantierId: string;
  termine: boolean;
  nomClient: string;
}) {
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  // isPending capturé : après la fermeture du dialog de confirmation, les
  // boutons restent désactivés jusqu'au retour serveur (pas de double clic).
  const [pending, startTransition] = useTransition();

  function executer(
    action: (fd: FormData) => Promise<{ error: string | null }>,
    succes: string | null,
  ) {
    const fd = new FormData();
    fd.set("id", chantierId);
    startTransition(async () => {
      // Pas de try/catch : un redirect() serveur (suppression) est gérée par
      // le routeur — l'attraper afficherait une fausse erreur.
      const res = await action(fd);
      if (res?.error) toast.error(res.error);
      else if (succes) toast.success(succes);
    });
  }

  return (
    <div className="space-y-2">
      {termine ? (
        <Button
          variante="secondaire"
          className="w-full"
          disabled={pending}
          onClick={() => setConfirmation("rouvrir")}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Rouvrir le chantier
        </Button>
      ) : (
        <>
          <Button
            className="w-full"
            disabled={pending}
            onClick={() => setConfirmation("terminer")}
          >
            <CircleCheck className="size-4" aria-hidden="true" />
            Marquer terminé
          </Button>
          <Button
            variante="fantome"
            className="w-full text-red-700 hover:bg-red-50 hover:text-red-800"
            disabled={pending}
            onClick={() => setConfirmation("supprimer")}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Supprimer le chantier
          </Button>
        </>
      )}

      {confirmation === "terminer" && (
        <ConfirmDialog
          ouvert
          onFermer={() => setConfirmation(null)}
          titre="Marquer ce chantier terminé ?"
          description={`Les travaux chez ${nomClient} seront marqués terminés et le dossier passera « Terminé » (réversible via « Rouvrir »).`}
          labelConfirmer="Terminer"
          onConfirmer={() =>
            executer(terminerChantier, "Chantier terminé — dossier clos.")
          }
        />
      )}
      {confirmation === "rouvrir" && (
        <ConfirmDialog
          ouvert
          onFermer={() => setConfirmation(null)}
          titre="Rouvrir ce chantier ?"
          description={`Le chantier chez ${nomClient} redeviendra en cours et le dossier repassera « En chantier ».`}
          labelConfirmer="Rouvrir"
          onConfirmer={() =>
            executer(rouvrirChantier, "Chantier rouvert — dossier « En chantier ».")
          }
        />
      )}
      {confirmation === "supprimer" && (
        <ConfirmDialog
          ouvert
          onFermer={() => setConfirmation(null)}
          titre="Supprimer ce chantier ?"
          description={`Le chantier chez ${nomClient} sera supprimé (dates, travaux, affectations) et le dossier redeviendra « Prêt pour travaux », de retour dans la file à planifier.`}
          labelConfirmer="Supprimer"
          danger
          onConfirmer={() => executer(supprimerChantier, null)}
        />
      )}
    </div>
  );
}
