import {
  Ban,
  CalendarClock,
  CircleCheck,
  ClipboardCheck,
  Droplets,
  Hammer,
  HardHat,
  Inbox,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type {
  DossierStatut,
  VisiteStatut,
} from "@/lib/generated/prisma/enums";
import { DOSSIER_STATUT_LABELS } from "@/lib/metier";
import { ETAT_CHANTIER_LABELS, type EtatChantier } from "@/lib/chantiers";
import { cn } from "@/lib/ui";

// Code couleur FONCTIONNEL des statuts — la lecture du kanban et du planning.
// Toujours icône + libellé, jamais la couleur seule (daltonisme).
// Turquoise exclu : réservé à la marque et aux actions.
export const DOSSIER_STATUT_UI: Record<
  DossierStatut,
  { badge: string; point: string; Icone: LucideIcon }
> = {
  // Ardoise : entrant, à prendre en charge.
  NOUVEAU: {
    badge: "border-slate-300 bg-slate-100 text-slate-800",
    point: "bg-slate-500",
    Icone: Inbox,
  },
  // Bleu : programmé, attend le terrain.
  PLANIFIE: {
    badge: "border-blue-200 bg-blue-50 text-blue-800",
    point: "bg-blue-500",
    Icone: CalendarClock,
  },
  // Violet : file « à traiter » de l'assistante (classement).
  REALISE: {
    badge: "border-violet-200 bg-violet-50 text-violet-800",
    point: "bg-violet-500",
    Icone: ClipboardCheck,
  },
  // Ambre : séchage en cours, contre-visite à prévoir.
  EN_ATTENTE_HUMIDITE: {
    badge: "border-amber-300 bg-amber-50 text-amber-900",
    point: "bg-amber-500",
    Icone: Droplets,
  },
  // Vert : expertise terminée, prêt pour travaux.
  PRET_POUR_TRAVAUX: {
    badge: "border-green-200 bg-green-50 text-green-800",
    point: "bg-green-600",
    Icone: HardHat,
  },
  // Orange : travaux pris en charge par le planning chantier.
  EN_CHANTIER: {
    badge: "border-orange-200 bg-orange-50 text-orange-800",
    point: "bg-orange-500",
    Icone: Hammer,
  },
  // Neutre : dossier clos (travaux terminés) — archivé, plus rien à faire.
  TERMINE: {
    badge: "border-neutral-300 bg-neutral-100 text-neutral-700",
    point: "bg-neutral-400",
    Icone: CircleCheck,
  },
  // Gris effacé : dossier annulé (hors cycle, réversible) — plus discret que
  // TERMINE, jamais rouge (le rouge est réservé aux alertes, cf. BadgeAlerte).
  ANNULE: {
    badge: "border-neutral-200 bg-neutral-50 text-neutral-500",
    point: "bg-neutral-300",
    Icone: Ban,
  },
};

export const VISITE_STATUT_LABELS: Record<VisiteStatut, string> = {
  PLANIFIEE: "Planifiée",
  REALISEE: "Réalisée",
};

export const VISITE_STATUT_UI: Record<
  VisiteStatut,
  { badge: string; Icone: LucideIcon }
> = {
  PLANIFIEE: {
    badge: "border-blue-200 bg-blue-50 text-blue-800",
    Icone: CalendarClock,
  },
  REALISEE: {
    badge: "border-green-200 bg-green-50 text-green-800",
    Icone: CircleCheck,
  },
};

const BADGE_BASE =
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium";

export function StatutDossierBadge({
  statut,
  className,
}: {
  statut: DossierStatut;
  className?: string;
}) {
  const { badge, Icone } = DOSSIER_STATUT_UI[statut];
  return (
    <span className={cn(BADGE_BASE, badge, className)}>
      <Icone className="size-3.5 shrink-0" aria-hidden="true" />
      {DOSSIER_STATUT_LABELS[statut]}
    </span>
  );
}

export function StatutVisiteBadge({
  statut,
  className,
}: {
  statut: VisiteStatut;
  className?: string;
}) {
  const { badge, Icone } = VISITE_STATUT_UI[statut];
  return (
    <span className={cn(BADGE_BASE, badge, className)}>
      <Icone className="size-3.5 shrink-0" aria-hidden="true" />
      {VISITE_STATUT_LABELS[statut]}
    </span>
  );
}

// État dérivé d'un chantier (lib/chantiers.ts) : à venir / en cours dérivent
// des dates ; « à clôturer » = dates passées sans marquage terminé (alerte
// douce) ; seul « terminé » est un fait explicite.
const ETAT_CHANTIER_UI: Record<
  EtatChantier,
  { badge: string; Icone: LucideIcon }
> = {
  A_VENIR: {
    badge: "border-blue-200 bg-blue-50 text-blue-800",
    Icone: CalendarClock,
  },
  EN_COURS: {
    badge: "border-orange-200 bg-orange-50 text-orange-800",
    Icone: Hammer,
  },
  A_CLOTURER: {
    badge: "border-red-200 bg-red-50 text-red-800",
    Icone: TriangleAlert,
  },
  TERMINE: {
    badge: "border-green-200 bg-green-50 text-green-800",
    Icone: CircleCheck,
  },
};

export function EtatChantierBadge({
  etat,
  className,
}: {
  etat: EtatChantier;
  className?: string;
}) {
  const { badge, Icone } = ETAT_CHANTIER_UI[etat];
  return (
    <span className={cn(BADGE_BASE, badge, className)}>
      <Icone className="size-3.5 shrink-0" aria-hidden="true" />
      {ETAT_CHANTIER_LABELS[etat]}
    </span>
  );
}

// Rouge : en retard, conflit, alerte — jamais un statut du cycle de vie.
export function BadgeAlerte({
  children = "En retard",
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        BADGE_BASE,
        "border-red-200 bg-red-50 text-red-800",
        className,
      )}
    >
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}
