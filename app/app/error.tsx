"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button, boutonClasses } from "@/components/ui/button";

// Filet de sécurité du sous-arbre /app : message non technique + relance.
// Les détails restent en console ; rien d'interne n'est montré à l'écran.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-red-50">
        <TriangleAlert className="size-6 text-red-600" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <h1 className="text-lg font-medium text-neutral-900">
          Une erreur est survenue
        </h1>
        <p className="mx-auto max-w-md text-sm text-neutral-500">
          L&apos;action n&apos;a pas pu aboutir. Réessayez ; si le problème
          persiste, contactez votre administrateur.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variante="secondaire" onClick={() => reset()}>
          Réessayer
        </Button>
        <Link href="/app" className={boutonClasses("fantome")}>
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
