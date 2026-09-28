"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChipsInput } from "@/components/ui/chips-input";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { PIECES_SUGGEREES } from "@/lib/metier";

// Démos nécessitant de l'état client (la page reste un composant serveur).
export function DemoSegmented() {
  const [vue, setVue] = useState<"semaine" | "jour">("semaine");
  return (
    <Segmented
      ariaLabel="Vue du planning (démo)"
      options={[
        { valeur: "semaine", label: "Semaine" },
        { valeur: "jour", label: "Jour" },
      ]}
      valeur={vue}
      onChange={setVue}
    />
  );
}

export function DemoDialogs() {
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [confirmOuvert, setConfirmOuvert] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button variante="secondaire" onClick={() => setDialogOuvert(true)}>
        Ouvrir un dialogue
      </Button>
      <Button variante="danger" onClick={() => setConfirmOuvert(true)}>
        Action à confirmer
      </Button>

      <Dialog
        ouvert={dialogOuvert}
        onFermer={() => setDialogOuvert(false)}
        titre="Détail de la visite"
      >
        <p className="text-sm text-neutral-600">
          Contenu libre : formulaires, récapitulatifs, aides. Échap ou clic sur
          le fond pour fermer.
        </p>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setDialogOuvert(false)}>Fermer</Button>
        </div>
      </Dialog>

      <ConfirmDialog
        ouvert={confirmOuvert}
        onFermer={() => setConfirmOuvert(false)}
        onConfirmer={() => toast.success("Visite annulée")}
        titre="Annuler la visite ?"
        description="Le dossier reviendra à son statut précédent. Cette action ne peut pas être annulée."
        labelConfirmer="Annuler la visite"
        danger
      />
    </div>
  );
}

export function DemoToasts() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variante="secondaire"
        onClick={() => toast.success("Visite planifiée")}
      >
        Toast succès
      </Button>
      <Button
        variante="secondaire"
        onClick={() =>
          toast.error("Le créneau chevauche une visite existante")
        }
      >
        Toast erreur
      </Button>
    </div>
  );
}

export function DemoChips() {
  return (
    <ChipsInput
      name="piecesDemo"
      suggestions={PIECES_SUGGEREES}
      valeursInitiales={["Salle de bain"]}
    />
  );
}
