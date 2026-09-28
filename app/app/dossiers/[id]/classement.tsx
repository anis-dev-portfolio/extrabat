"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmerClassement } from "../actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { DOSSIER_STATUT_LABELS } from "@/lib/metier";

type Classement = "EN_ATTENTE_HUMIDITE" | "PRET_POUR_TRAVAUX";

// Classement d'un dossier REALISE, avec confirmation explicite (l'action est
// la décision métier de l'assistante — le taux ne fait que suggérer).
export function ClassementDossier({
  dossierId,
  suggestion,
}: {
  dossierId: string;
  suggestion: Classement;
}) {
  const [choix, setChoix] = useState<Classement | null>(null);
  // isPending capturé : les deux boutons sont désactivés pendant l'action +
  // refresh (plus de boutons « morts » ni de double classement au clic).
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function classer(statut: Classement) {
    const fd = new FormData();
    fd.set("dossierId", dossierId);
    fd.set("statut", statut);
    startTransition(async () => {
      const resultat = await confirmerClassement(fd);
      if (resultat.error) {
        // Ex. : déjà classé dans un autre onglet — le refresh resynchronise.
        toast.error(resultat.error);
      } else {
        toast.success(`Dossier classé « ${DOSSIER_STATUT_LABELS[statut]} ».`);
      }
      router.refresh();
    });
  }

  const options: { statut: Classement; label: string; aide: string }[] = [
    {
      statut: "EN_ATTENTE_HUMIDITE",
      label: DOSSIER_STATUT_LABELS.EN_ATTENTE_HUMIDITE,
      aide: "Séchage en cours — une contre-visite sera à planifier.",
    },
    {
      statut: "PRET_POUR_TRAVAUX",
      label: DOSSIER_STATUT_LABELS.PRET_POUR_TRAVAUX,
      aide: "Taux acceptable — le dossier part aux travaux.",
    },
  ];

  return (
    <div className="space-y-2">
      {options.map(({ statut, label }) => {
        const suggere = statut === suggestion;
        return (
          <Button
            key={statut}
            variante={suggere ? "primaire" : "secondaire"}
            className="w-full justify-between text-left"
            disabled={pending}
            onClick={() => setChoix(statut)}
          >
            <span>{label}</span>
            {suggere && (
              // Pleine opacité (texte décisionnel) — la hiérarchie est portée
              // par la taille et le poids, pas par un contraste réduit.
              <span className="text-xs font-normal">suggéré</span>
            )}
          </Button>
        );
      })}
      <p className="text-xs text-neutral-500">
        {options.find((o) => o.statut === suggestion)?.aide}
      </p>

      <ConfirmDialog
        ouvert={choix !== null}
        onFermer={() => setChoix(null)}
        titre={`Classer le dossier « ${choix ? DOSSIER_STATUT_LABELS[choix] : ""} » ?`}
        description={
          choix === "EN_ATTENTE_HUMIDITE"
            ? "Le dossier passera en attente humidité : une contre-visite sera à planifier après séchage."
            : "Le dossier sera marqué prêt pour travaux."
        }
        labelConfirmer="Classer"
        onConfirmer={() => {
          if (choix) classer(choix);
        }}
      />
    </div>
  );
}
