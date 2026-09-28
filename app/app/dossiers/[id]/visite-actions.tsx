"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { annulerVisite, type ActionState } from "../actions";
import { boutonClasses, Button, TACTILE_MOBILE } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";

const initial: ActionState = { error: null };

// Actions d'une visite encore PLANIFIEE, depuis la fiche dossier :
// Replanifier (sélecteur de créneaux en mode replanification) et Annuler
// (confirmation ; le statut du dossier est re-dérivé côté serveur).
export function VisitePlanifieeActions({
  dossierId,
  visiteId,
  description,
}: {
  dossierId: string;
  visiteId: string;
  description: string;
}) {
  const [confirmer, setConfirmer] = useState(false);
  const [etat, annuler, annulation] = useActionState(annulerVisite, initial);
  const router = useRouter();

  useEffect(() => {
    if (etat === initial) return;
    if (etat.error) {
      toast.error(etat.error);
    } else {
      toast.success("Visite annulée.");
      router.refresh();
    }
  }, [etat, router]);

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={`/app/dossiers/${dossierId}/planifier?visite=${visiteId}&retour=dossier`}
        className={boutonClasses("secondaire", "sm", TACTILE_MOBILE)}
      >
        Replanifier
      </Link>
      <Button
        variante="fantome"
        taille="sm"
        disabled={annulation}
        className={`text-red-700 hover:bg-red-50 hover:text-red-800 ${TACTILE_MOBILE}`}
        onClick={() => setConfirmer(true)}
      >
        {annulation ? "Annulation…" : "Annuler la visite"}
      </Button>

      <ConfirmDialog
        ouvert={confirmer}
        onFermer={() => setConfirmer(false)}
        titre="Annuler cette visite ?"
        description={`${description} La visite sera supprimée et le dossier retrouvera un statut cohérent. Cette action est définitive.`}
        labelConfirmer="Annuler la visite"
        danger
        onConfirmer={() => {
          const fd = new FormData();
          fd.set("visiteId", visiteId);
          startTransition(() => annuler(fd));
        }}
      />
    </div>
  );
}
