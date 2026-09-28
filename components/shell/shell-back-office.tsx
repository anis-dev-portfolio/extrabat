"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardCheck,
  FolderKanban,
  HardHat,
  Palette,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { FormDeconnexion } from "@/components/shell/bouton-deconnexion";
import { Marque } from "@/components/ui/marque";
import { ROLE_LABELS } from "@/lib/metier";
import type { Role } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/ui";

// Shell back-office (ASSISTANTE / ADMIN) : sidebar desktop, header + onglets
// horizontaux en dessous de lg. Les guards restent la source de vérité — la
// nav ne fait que refléter le rôle.
type ItemNav = { href: string; label: string; Icone: LucideIcon };

// Navigation MÉTIER (le travail quotidien). Les réglages en sont séparés
// (itemsReglages) et vivent tout en bas de la sidebar — voir ShellBackOffice.
function itemsNav(): ItemNav[] {
  return [
    { href: "/app/dossiers", label: "Dossiers", Icone: FolderKanban },
    { href: "/app/planning", label: "Planning", Icone: CalendarDays },
    { href: "/app/chantiers", label: "Chantiers", Icone: HardHat },
    { href: "/app/historique", label: "Historique", Icone: Archive },
    { href: "/app/finances", label: "Chiffre d'affaires", Icone: Wallet },
    { href: "/app/statistiques", label: "Statistiques", Icone: BarChart3 },
  ];
}

// Zone « réglages », ancrée en bas de la sidebar (sous « À traiter ») : les
// Paramètres se repèrent d'entrée de jeu, à leur place attendue, hors du flux
// des tâches. Le hub Paramètres filtre ensuite ses sections par rôle
// (l'assistante y gère les disponibilités des conducteurs et son mot de passe).
function itemsReglages(role: Role): ItemNav[] {
  const items: ItemNav[] = [
    { href: "/app/parametres", label: "Paramètres", Icone: Settings },
  ];
  if (role === "ADMIN") {
    items.push({ href: "/app/design", label: "Design system", Icone: Palette });
  }
  return items;
}

// Lien de navigation de la sidebar desktop — partagé par la nav métier et la
// zone réglages pour un rendu identique (état actif = fond primaire + marque).
function LienNav({
  href,
  label,
  Icone,
  actif,
}: ItemNav & { actif: boolean }) {
  return (
    <Link
      href={href}
      aria-current={actif ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        actif
          ? "bg-primary-50 text-primary-800"
          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
      )}
    >
      <Icone className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{label}</span>
      {actif && <Marque mono className="h-3.5 w-auto text-primary-500" />}
    </Link>
  );
}

function LogoISOBAT({ tailleMarque }: { tailleMarque: string }) {
  return (
    <>
      <Marque className={cn("w-auto shrink-0", tailleMarque)} />
      <span className="flex flex-col leading-tight">
        <span className="font-display text-base font-bold tracking-wide text-primary-700">
          ISOBAT
        </span>
        <span className="text-[11px] text-neutral-500">Suivi de chantier</span>
      </span>
    </>
  );
}

function ATraiter({
  compte,
  actif,
  compact,
}: {
  compte: number;
  actif?: boolean;
  compact?: boolean;
}) {
  const enAttente = compte > 0;
  return (
    <Link
      href="/app/a-traiter"
      aria-current={actif ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border transition-colors",
        compact ? "px-2.5 py-1.5" : "px-3 py-2.5",
        enAttente
          ? "border-violet-200 bg-violet-50 hover:bg-violet-100"
          : "border-neutral-200 bg-neutral-50 hover:bg-neutral-100",
        actif &&
          (enAttente
            ? "border-violet-400 ring-1 ring-violet-300"
            : "border-neutral-400 ring-1 ring-neutral-300"),
      )}
    >
      <ClipboardCheck
        className={cn(
          "size-4 shrink-0",
          enAttente ? "text-violet-600" : "text-neutral-400",
        )}
        aria-hidden="true"
      />
      <span className="flex-1">
        <span
          className={cn(
            "block text-sm font-medium",
            enAttente ? "text-violet-900" : "text-neutral-600",
          )}
        >
          À traiter
        </span>
        {!compact && (
          <span
            className={cn(
              "block text-xs",
              enAttente ? "text-violet-700" : "text-neutral-500",
            )}
          >
            {enAttente ? "Dossiers à traiter" : "Rien en attente"}
          </span>
        )}
      </span>
      <span
        key={compte}
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors animate-[carte-in_150ms_var(--ease-sortie)]",
          enAttente ? "bg-violet-600 text-white" : "bg-neutral-200 text-neutral-600",
        )}
      >
        {compte}
      </span>
    </Link>
  );
}

// Cloche notifications du back-office : le TERRAIN notifie désormais le
// bureau (document signé par le client, chantier marqué terminé par un
// ouvrier). Même compteur serveur que la cloche du conducteur.
function ClocheNotifications({
  compte,
  actif,
}: {
  compte: number;
  actif: boolean;
}) {
  return (
    <Link
      href="/app/notifications"
      aria-label={
        compte > 0
          ? `Notifications : ${compte} non lue${compte > 1 ? "s" : ""}`
          : "Notifications"
      }
      aria-current={actif ? "page" : undefined}
      className={cn(
        "relative flex size-11 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900",
        actif && "bg-neutral-100 text-neutral-900",
      )}
    >
      <Bell className="size-4" aria-hidden="true" />
      {compte > 0 && (
        <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-none font-semibold text-white tabular-nums">
          {compte > 9 ? "9+" : compte}
        </span>
      )}
    </Link>
  );
}

export function ShellBackOffice({
  nom,
  role,
  organisation,
  aTraiter,
  notificationsNonLues,
  children,
}: {
  nom: string;
  role: Role;
  organisation: string;
  aTraiter: number;
  notificationsNonLues: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const items = itemsNav();
  const reglages = itemsReglages(role);

  const estActif = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const aTraiterActif = estActif("/app/a-traiter");
  const notificationsActif = estActif("/app/notifications");

  return (
    <div className="min-h-screen">
      {/* ── Sidebar desktop ─────────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-neutral-200 bg-white lg:flex print:hidden">
        <Link href="/app" className="flex items-center gap-2.5 px-4 py-4">
          <LogoISOBAT tailleMarque="h-8" />
        </Link>

        <nav
          aria-label="Navigation principale"
          className="flex-1 space-y-1 px-3 py-2"
        >
          {items.map((item) => (
            <LienNav key={item.href} {...item} actif={estActif(item.href)} />
          ))}
        </nav>

        {/* Ancré en bas : « À traiter » puis les Réglages (Paramètres…), pour
            qu'ils se repèrent d'entrée de jeu, séparés du flux des tâches. */}
        <div className="space-y-2 px-3 pb-3">
          <ATraiter compte={aTraiter} actif={aTraiterActif} />
          <nav
            aria-label="Réglages"
            className="space-y-1 border-t border-neutral-200 pt-2"
          >
            {reglages.map((item) => (
              <LienNav key={item.href} {...item} actif={estActif(item.href)} />
            ))}
          </nav>
        </div>

        <div className="border-t border-neutral-200 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-900">
                {nom}
              </p>
              <p className="truncate text-xs text-neutral-500">
                {ROLE_LABELS[role]} · {organisation}
              </p>
            </div>
            <ClocheNotifications
              compte={notificationsNonLues}
              actif={notificationsActif}
            />
          </div>
          <FormDeconnexion variante="libelle" className="mt-2.5" />
        </div>
      </aside>

      {/* ── Header mobile / tablette ────────────────────────────────── */}
      {/* pt safe-area : en PWA standalone (viewport-fit=cover), le header passe
          sous la barre de statut / Dynamic Island — on la compense ici. */}
      <header className="barre-givree sticky top-0 z-20 border-b border-neutral-200 pt-[env(safe-area-inset-top)] lg:hidden print:hidden">
        <div className="flex items-center justify-between gap-3 px-4 pt-2.5 pb-1.5">
          <Link href="/app" className="flex items-center gap-2">
            <LogoISOBAT tailleMarque="h-7" />
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/app/a-traiter"
              aria-label={`À traiter : ${aTraiter}`}
              aria-current={aTraiterActif ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold tabular-nums transition-colors",
                aTraiter > 0
                  ? "text-violet-800 hover:bg-violet-50"
                  : "text-neutral-500 hover:bg-neutral-100",
                aTraiterActif && (aTraiter > 0 ? "bg-violet-50" : "bg-neutral-100"),
              )}
            >
              <ClipboardCheck className="size-4" aria-hidden="true" />
              {aTraiter}
            </Link>
            <ClocheNotifications
              compte={notificationsNonLues}
              actif={notificationsActif}
            />
            <FormDeconnexion variante="icone" />
          </div>
        </div>
        <nav
          aria-label="Navigation principale"
          className="flex gap-1 overflow-x-auto px-2 pb-2"
        >
          {[...items, ...reglages].map(({ href, label, Icone }) => {
            const actif = estActif(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={actif ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  actif
                    ? "bg-primary-50 text-primary-800"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
                )}
              >
                <Icone className="size-4" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* ── Contenu ─────────────────────────────────────────────────── */}
      <main className="px-4 py-6 lg:ml-56 lg:px-8 print:m-0 print:p-0">
        <div className="mx-auto w-full max-w-7xl print:max-w-none">
          {children}
        </div>
      </main>
    </div>
  );
}
