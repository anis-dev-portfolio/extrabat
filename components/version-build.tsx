"use client";

import { cn } from "@/lib/ui";

// Version du BUNDLE CLIENT réellement exécuté (inlinée à la compilation, voir
// next.config.ts). Volontairement un composant client : si l'écran affiche une
// vieille valeur alors que le serveur est à jour, c'est que le téléphone
// exécute un vieux bundle (service worker / cache pages).
export function VersionBuild({ className }: { className?: string }) {
  return (
    <p className={cn("text-[11px] text-neutral-400", className)}>
      Version {process.env.NEXT_PUBLIC_VERSION_BUILD ?? "inconnue"}
    </p>
  );
}
