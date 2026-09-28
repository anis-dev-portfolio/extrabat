"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui";

// Boîte de dialogue modale sur l'élément natif <dialog> (focus trap et Échap
// gratuits). Le clic sur le fond (l'élément dialog lui-même) ferme.
export function Dialog({
  ouvert,
  onFermer,
  titre,
  children,
  className,
}: {
  ouvert: boolean;
  onFermer: () => void;
  titre: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (ouvert && !dialog.open) dialog.showModal();
    if (!ouvert && dialog.open) dialog.close();
  }, [ouvert]);

  return (
    <dialog
      ref={ref}
      onClose={onFermer}
      onClick={(e) => {
        if (e.target === ref.current) onFermer();
      }}
      className={cn(
        // m-auto : le preflight Tailwind écrase le centrage natif du <dialog>.
        // w-[calc(100%-2rem)] : marge de respiration sur petits écrans, le
        // max-w-md prend le relais dès que l'écran est assez large.
        "dialog-anime m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-neutral-200 bg-white p-0 shadow-xl",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4 border-b border-neutral-100 px-5 py-3.5">
        <h2 className="font-display text-base font-medium text-neutral-900">
          {titre}
        </h2>
        <button
          type="button"
          onClick={onFermer}
          aria-label="Fermer"
          className="-mr-1.5 flex size-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}

// Confirmation avant action irréversible (classement, annulation, retrait…).
export function ConfirmDialog({
  ouvert,
  onFermer,
  onConfirmer,
  titre,
  description,
  labelConfirmer = "Confirmer",
  danger = false,
}: {
  ouvert: boolean;
  onFermer: () => void;
  onConfirmer: () => void;
  titre: string;
  description: string;
  labelConfirmer?: string;
  danger?: boolean;
}) {
  return (
    <Dialog ouvert={ouvert} onFermer={onFermer} titre={titre}>
      <p className="text-sm text-neutral-600">{description}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variante="secondaire" onClick={onFermer}>
          Annuler
        </Button>
        <Button
          variante={danger ? "danger" : "primaire"}
          onClick={() => {
            onConfirmer();
            onFermer();
          }}
        >
          {labelConfirmer}
        </Button>
      </div>
    </Dialog>
  );
}
