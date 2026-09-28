import Link from "next/link";
import { SearchX } from "lucide-react";
import { boutonClasses } from "@/components/ui/button";

// 404 globale (URL inconnue, hors /app comme dedans) : même charte que
// app/app/error.tsx — message non technique + retour à l'accueil. Le hub /app
// redirige selon le rôle (ou vers /login si non connecté).
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 p-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-neutral-100">
        <SearchX className="size-6 text-neutral-500" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <h1 className="text-lg font-medium text-neutral-900">
          Page introuvable
        </h1>
        <p className="mx-auto max-w-md text-sm text-neutral-500">
          Cette page n&apos;existe pas ou a été déplacée.
        </p>
      </div>
      <Link href="/app" className={boutonClasses("secondaire")}>
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
