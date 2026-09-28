import type { Metadata } from "next";
import Link from "next/link";
import { Marque } from "@/components/ui/marque";
import { LoginForm } from "./form";

const MESSAGES: Record<string, string> = {
  "non-autorise":
    "Ce compte n'est pas autorisé à accéder à l'application. Contactez un administrateur.",
};

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { erreur } = await searchParams;
  const messageInitial = erreur ? MESSAGES[erreur] : undefined;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <Marque className="h-12 w-auto" />
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Connexion</h1>
            <p className="text-sm text-neutral-500">
              Accédez à votre espace ExtraBat.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <LoginForm messageInitial={messageInitial} />
        </div>

        <p className="text-center">
          <Link
            href="/"
            className="text-sm text-neutral-500 transition-colors hover:text-neutral-800"
          >
            ← Retour à l&apos;accueil
          </Link>
        </p>
      </div>
    </main>
  );
}
