"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays, HardHat, UserRound } from "lucide-react";
import { FormDeconnexion } from "@/components/shell/bouton-deconnexion";
import { Marque } from "@/components/ui/marque";
import { cn } from "@/lib/ui";

// Shell ouvrier, mobile d'abord — miroir du shell conducteur : header minimal
// + barre d'onglets en bas (zone du pouce). La fiche chantier et la page de
// signature (/app/mes-chantiers/…) allument « Mes chantiers ».
const ONGLETS = [
  {
    href: "/app/mes-chantiers",
    label: "Mes chantiers",
    Icone: HardHat,
    estActif: (pathname: string) => pathname.startsWith("/app/mes-chantiers"),
  },
  {
    href: "/app/mon-planning",
    label: "Mon planning",
    Icone: CalendarDays,
    estActif: (pathname: string) => pathname.startsWith("/app/mon-planning"),
  },
  // Hub Paramètres : pour un ouvrier, il n'expose que le mot de passe.
  {
    href: "/app/parametres",
    label: "Compte",
    Icone: UserRound,
    estActif: (pathname: string) => pathname.startsWith("/app/parametres"),
  },
];

export function ShellOuvrier({
  nom,
  notificationsNonLues,
  children,
}: {
  nom: string;
  // Compteur serveur (app/app/layout.tsx) — même mécanisme que la pastille du
  // conducteur, pas de polling client.
  notificationsNonLues: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      {/* pt safe-area : en PWA standalone (viewport-fit=cover), le header passe
          sous la barre de statut / Dynamic Island — on la compense ici. */}
      <header className="barre-givree sticky top-0 z-20 border-b border-neutral-200 pt-[env(safe-area-inset-top)] print:hidden">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-2">
          <Link href="/app" className="flex shrink-0 items-center gap-2">
            <Marque className="h-7 w-auto" />
            <span className="font-display text-base font-bold tracking-wide text-primary-700">
              ISOBAT
            </span>
          </Link>
          {/* min-w-0 : sur un téléphone de 375–390 px, seul le NOM cède de la
              place (tronqué) — la pastille d'envois, la cloche et la
              déconnexion gardent leur taille, l'en-tête ne déborde plus. */}
          <div className="flex min-w-0 items-center gap-1.5">
            {/* Cloche : « le bureau a touché à mes chantiers » — la pastille
                compte les notifications non lues (lien vers la liste). */}
            <Link
              href="/app/notifications"
              aria-label={
                notificationsNonLues > 0
                  ? `Notifications : ${notificationsNonLues} non lue${notificationsNonLues > 1 ? "s" : ""}`
                  : "Notifications"
              }
              aria-current={
                pathname.startsWith("/app/notifications") ? "page" : undefined
              }
              className="relative flex size-11 shrink-0 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              <Bell className="size-4" aria-hidden="true" />
              {notificationsNonLues > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-none font-semibold text-white tabular-nums">
                  {notificationsNonLues > 9 ? "9+" : notificationsNonLues}
                </span>
              )}
            </Link>
            <span className="min-w-0 max-w-40 truncate text-sm text-neutral-600">
              {nom}
            </span>
            <FormDeconnexion variante="icone" className="shrink-0" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-4 pb-24 print:max-w-none print:p-0">
        {children}
      </main>

      <nav
        aria-label="Navigation principale"
        className="barre-givree fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 pb-[env(safe-area-inset-bottom)] print:hidden"
      >
        <div className="mx-auto flex w-full max-w-2xl">
          {ONGLETS.map(({ href, label, Icone, estActif }) => {
            const actif = estActif(pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={actif ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-[color,transform] active:scale-95",
                  actif
                    ? "text-primary-700"
                    : "text-neutral-500 hover:text-neutral-800",
                )}
              >
                <Icone className="size-5" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
