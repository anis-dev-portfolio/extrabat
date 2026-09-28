"use client";

import { useFormStatus } from "react-dom";
import { Loader2, LogOut } from "lucide-react";
import { logout } from "@/app/app/actions";
import { cn } from "@/lib/ui";

// Déconnexion partagée par les 3 emplacements des shells (sidebar back-office,
// headers mobiles) : un <form action={logout}> dont le bouton lit useFormStatus
// — spinner + bouton désactivé pendant le round-trip (plus de clic « mort »).
// `variante` : « icone » (headers, aria-label) ou « libelle » (sidebar).
export function FormDeconnexion({
  variante,
  className,
}: {
  variante: "icone" | "libelle";
  className?: string;
}) {
  return (
    <form action={logout} className={className}>
      <BoutonDeconnexion variante={variante} />
    </form>
  );
}

function BoutonDeconnexion({ variante }: { variante: "icone" | "libelle" }) {
  // useFormStatus lit le <form> parent — d'où ce composant ENFANT du form.
  const { pending } = useFormStatus();

  if (variante === "icone") {
    return (
      <button
        type="submit"
        disabled={pending}
        aria-label="Déconnexion"
        className="flex size-11 cursor-pointer items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <LogOut className="size-4" aria-hidden="true" />
        )}
      </button>
    );
  }

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100",
        "disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <LogOut className="size-3.5" aria-hidden="true" />
      )}
      {pending ? "Déconnexion…" : "Déconnexion"}
    </button>
  );
}
