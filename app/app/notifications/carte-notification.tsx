"use client";

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CalendarPlus,
  CalendarX,
  CheckCircle2,
  ChevronRight,
  FileSignature,
  HardHat,
  type LucideIcon,
} from "lucide-react";
import type { TypeNotification } from "@/lib/generated/prisma/enums";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/ui";
import { marquerNotificationLue } from "./actions";

// Icône par type — ce qui arrive en vert (du travail, une signature), ce qui
// bouge en ambre, ce qui disparaît en rouge.
const TYPE_UI: Record<TypeNotification, { Icone: LucideIcon; classe: string }> =
  {
    VISITE_ASSIGNEE: { Icone: CalendarPlus, classe: "text-green-700" },
    VISITE_REPLANIFIEE: { Icone: CalendarClock, classe: "text-amber-600" },
    VISITE_ANNULEE: { Icone: CalendarX, classe: "text-red-600" },
    CHANTIER_AFFECTE: { Icone: HardHat, classe: "text-green-700" },
    CHANTIER_REPLANIFIE: { Icone: CalendarClock, classe: "text-amber-600" },
    CHANTIER_RETIRE: { Icone: CalendarX, classe: "text-red-600" },
    DOCUMENT_A_SIGNER_RECU: { Icone: FileSignature, classe: "text-amber-600" },
    DOCUMENT_SIGNE_RECU: { Icone: FileSignature, classe: "text-green-700" },
    CHANTIER_TERMINE_TERRAIN: { Icone: CheckCircle2, classe: "text-green-700" },
  };

// Carte au pouce : la zone principale est un Link vers la fiche visite quand
// elle existe encore, un simple bloc sinon ; le bouton « Marquer lu » est un
// élément FRÈRE (jamais de bouton imbriqué dans un lien — HTML invalide).
// Composant CLIENT pour le marquage lu OPTIMISTE : la carte se restyle « lue »
// à l'instant du clic (le geste le plus fréquent du conducteur) ; le
// revalidatePath de l'action ramène l'état serveur (pastille de la cloche,
// re-tri de la liste), et l'optimisme retombe seul en cas d'erreur. Libellé et
// date arrivent PRÉ-FORMATÉS du serveur (lib/notifications reste serveur).
export function CarteNotification({
  id,
  type,
  lu,
  libelle,
  dateLabel,
  href,
}: {
  id: string;
  type: TypeNotification;
  lu: boolean;
  libelle: string;
  dateLabel: string;
  // Lien de navigation calculé par la page serveur selon le rôle (fiche
  // visite / fiche chantier / fiche dossier) — null si la cible n'existe
  // plus ou n'appartient plus au destinataire.
  href: string | null;
}) {
  const [luAffiche, marquerLuOptimiste] = useOptimistic(lu);
  const [, startTransition] = useTransition();
  const { Icone, classe } = TYPE_UI[type];

  function marquer() {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      marquerLuOptimiste(true);
      try {
        const res = await marquerNotificationLue(fd);
        if (res.error) toast.error(res.error);
      } catch {
        toast.error("Une erreur est survenue. Réessayez.");
      }
    });
  }

  const contenu = (
    <>
      <Icone className={cn("size-5 shrink-0", classe)} aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p
          className={cn(
            "text-sm",
            luAffiche ? "text-neutral-600" : "font-medium text-neutral-900",
          )}
        >
          {libelle}
        </p>
        <p className="text-xs text-neutral-500">{dateLabel}</p>
      </div>
      {href && (
        <ChevronRight
          className="size-5 shrink-0 text-neutral-400"
          aria-hidden="true"
        />
      )}
    </>
  );

  return (
    <div
      className={cn(
        "flex min-h-16 items-stretch rounded-lg border shadow-xs",
        luAffiche
          ? "border-neutral-200 bg-neutral-50"
          : "border-primary-200 bg-white",
      )}
    >
      {href ? (
        <Link
          href={href}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-l-lg p-4 transition-colors active:bg-neutral-100"
        >
          {contenu}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 p-4">
          {contenu}
        </div>
      )}

      {!luAffiche && (
        <div className="flex items-center border-l border-neutral-200/70 px-1.5">
          <button
            type="button"
            onClick={marquer}
            // Cible tactile ≥ 44 px (terrain conducteur), libellé explicite.
            className="flex min-h-11 cursor-pointer items-center rounded-md px-2 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          >
            Marquer lu
          </button>
        </div>
      )}
    </div>
  );
}
