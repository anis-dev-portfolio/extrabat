"use client";

import { startTransition, useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/ui";

// Une action de suppression renvoie { error } : null = succès ; deleteMany à
// 0 ligne (déjà supprimé, autre onglet) = erreur explicite, pas de faux succès.
type ActionSuppression = (
  formData: FormData,
) => Promise<{ error: string | null }>;

// Bouton corbeille générique : confirmation avant suppression, toast de succès
// ou d'erreur au retour. Le rafraîchissement vient du revalidatePath de
// l'action (pas de router.refresh — le POST de l'action renvoie déjà la page
// à jour). Le style du déclencheur est passé par le parent.
export function BoutonSupprimer({
  action,
  id,
  titre,
  description,
  succes,
  ariaLabel,
  className,
  iconeClassName = "size-4",
}: {
  action: ActionSuppression;
  id: string;
  titre: string;
  description: string;
  succes: string;
  ariaLabel: string;
  className?: string;
  iconeClassName?: string;
}) {
  const [confirmer, setConfirmer] = useState(false);

  function supprimer() {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      try {
        const res = await action(fd);
        if (res.error) toast.error(res.error);
        else toast.success(succes);
      } catch {
        toast.error("Une erreur est survenue. Réessayez.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmer(true)}
        aria-label={ariaLabel}
        className={cn("cursor-pointer", className)}
      >
        <Trash2 className={iconeClassName} aria-hidden="true" />
      </button>
      {confirmer && (
        <ConfirmDialog
          ouvert
          onFermer={() => setConfirmer(false)}
          titre={titre}
          description={description}
          labelConfirmer="Retirer"
          danger
          onConfirmer={supprimer}
        />
      )}
    </>
  );
}
