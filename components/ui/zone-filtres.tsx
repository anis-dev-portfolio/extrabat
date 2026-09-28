"use client";

import { createContext, useCallback, useContext, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/ui";

// Navigation par searchParams AVEC feedback : les barres de filtres déclenchent
// leur router.replace dans une transition partagée, et le contenu serveur en
// cours de re-render est estompé (opacity-50 + aria-busy — même pattern que
// l'agenda de planifier/form.tsx). Le provider ne rend aucun DOM : les enfants
// restent des enfants directs du conteneur (space-y-* intact).
type NavigationFiltres = {
  pending: boolean;
  naviguer: (url: string) => void;
};

const NavigationFiltresContext = createContext<NavigationFiltres | null>(null);

export function ZoneFiltres({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const naviguer = useCallback(
    (url: string) => startTransition(() => router.replace(url)),
    [router],
  );
  return (
    <NavigationFiltresContext.Provider value={{ pending, naviguer }}>
      {children}
    </NavigationFiltresContext.Provider>
  );
}

export function useNavigationFiltres(): NavigationFiltres {
  const ctx = useContext(NavigationFiltresContext);
  if (!ctx) {
    throw new Error("useNavigationFiltres s'utilise sous <ZoneFiltres>.");
  }
  return ctx;
}

// Enveloppe du contenu re-rendu par les filtres : estompé mais interactif
// pendant la transition — le serveur reste le juge du résultat affiché.
export function ContenuFiltrable({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useNavigationFiltres();
  return (
    <div
      aria-busy={pending || undefined}
      className={cn(
        "transition-opacity delay-150",
        pending && "opacity-50",
        className,
      )}
    >
      {children}
    </div>
  );
}
