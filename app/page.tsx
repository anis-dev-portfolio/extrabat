import Link from "next/link";
import { boutonClasses } from "@/components/ui/button";
import { Marque } from "@/components/ui/marque";

// Page d'accueil publique : porte d'entrée sobre aux couleurs ISOBAT — la
// marque, le produit, une action. Tout le reste vit derrière /login.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 text-center">
      <div className="flex flex-col items-center gap-5">
        <Marque className="h-20 w-auto" />
        <div className="space-y-2">
          <p className="font-display text-sm font-bold tracking-[0.25em] text-primary-700 uppercase">
            ISOBAT
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            ExtraBat
          </h1>
          <p className="max-w-md text-balance text-neutral-600">
            Suivi de chantier et d&apos;expertise humidité : dossiers, planning
            des visites et comptes-rendus terrain.
          </p>
        </div>
      </div>
      <Link href="/login" className={boutonClasses("primaire", "pouce", "px-8")}>
        Se connecter
      </Link>
    </main>
  );
}
