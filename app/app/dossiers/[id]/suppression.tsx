"use client";

import { useActionState, useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { supprimerDossier, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

const initial: ActionState = { error: null };

// Suppression DÉFINITIVE d'un dossier (dossier de test, doublon de saisie…) :
// bouton discret tout en bas de la barre latérale, qui ouvre un dialog
// exigeant de RETAPER le nom du client — le bouton de validation reste grisé
// tant que la saisie ne correspond pas (confort ; le serveur re-vérifie).
// Pas de useEffect de succès : l'action redirect() vers la liste (la fiche
// n'existe plus), le toast passe par ?succes= (toast-succes.tsx).
export function SupprimerDossier({
  dossierId,
  nomClient,
}: {
  dossierId: string;
  nomClient: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [etat, formAction, pending] = useActionState(supprimerDossier, initial);

  const correspond =
    saisie.trim().toLocaleLowerCase("fr") ===
    nomClient.trim().toLocaleLowerCase("fr");

  function fermer() {
    setOuvert(false);
    setSaisie("");
  }

  return (
    <>
      <Button
        variante="fantome"
        className="w-full text-red-700 hover:bg-red-50 hover:text-red-800"
        onClick={() => setOuvert(true)}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        Supprimer définitivement
      </Button>

      <Dialog
        ouvert={ouvert}
        onFermer={fermer}
        titre="Supprimer définitivement ce dossier ?"
      >
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="dossierId" value={dossierId} />

          <p className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>
              <strong className="font-semibold">
                Cette action est irréversible.
              </strong>{" "}
              Le dossier, ses visites, photos, pièces jointes, notes et son
              journal seront effacés. Les montants du devis disparaîtront du
              chiffre d&apos;affaires et des statistiques. Pour retirer un
              vrai dossier du suivi sans rien perdre, préférez
              l&apos;annulation.
            </span>
          </p>

          <div className="space-y-1.5">
            <label
              htmlFor="confirmation-suppression"
              className="block text-sm font-medium text-neutral-800"
            >
              Pour confirmer, tapez le nom du client :{" "}
              <span className="font-semibold">{nomClient}</span>
            </label>
            <input
              id="confirmation-suppression"
              name="confirmation"
              type="text"
              autoComplete="off"
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              placeholder={nomClient}
              className="h-11 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 shadow-xs transition-colors placeholder:text-neutral-400 hover:border-neutral-400"
            />
          </div>

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
            <Button variante="secondaire" disabled={pending} onClick={fermer}>
              Fermer
            </Button>
            <Button
              type="submit"
              variante="danger"
              disabled={!correspond || pending}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {pending ? "Suppression…" : "Supprimer définitivement"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
