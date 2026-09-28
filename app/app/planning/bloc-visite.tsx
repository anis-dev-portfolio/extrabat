"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, MapPin, Navigation, UserRound } from "lucide-react";
import { annulerVisite, type ActionState } from "@/app/app/dossiers/actions";
import { boutonClasses, Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { visiteLabel } from "@/lib/metier";
import { formatDistanceKm } from "@/lib/geo";
import { cn } from "@/lib/ui";
import type { BlocSerialise } from "./grille";

const initial: ActionState = { error: null };

// Bloc visite positionné en absolu dans sa colonne (échelle 1 min ≈ 1 px).
// Clic → détails + actions Replanifier / Annuler.
export function BlocVisite({
  bloc,
  echelle,
}: {
  bloc: BlocSerialise;
  echelle: number;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [confirmerAnnulation, setConfirmerAnnulation] = useState(false);
  const [etat, annuler, annulation] = useActionState(annulerVisite, initial);
  const router = useRouter();

  // Résultat de l'annulation (l'état initial est ignoré par identité) :
  // toast + refresh pour faire disparaître le bloc.
  useEffect(() => {
    if (etat === initial) return;
    if (etat.error) {
      toast.error(etat.error);
    } else {
      toast.success("Visite annulée.");
      router.refresh();
    }
  }, [etat, router]);

  const largeur = `calc((100% - 6px) / ${bloc.lanes})`;
  const gauche = `calc(3px + ${bloc.lane} * (100% - 6px) / ${bloc.lanes})`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        title={`${bloc.nomClient} · ${bloc.heureLabel}`}
        className={cn(
          // Print : les fonds ne s'impriment pas — lisibilité N&B par
          // bordures + texte noir (même principe que le compte-rendu).
          "absolute z-10 flex cursor-pointer flex-col overflow-hidden rounded-md border border-blue-300 bg-blue-50 px-1.5 py-1 text-left shadow-xs transition-colors hover:border-blue-400 hover:bg-blue-100 print:border-neutral-500 print:bg-transparent print:shadow-none",
          bloc.clampHaut && "rounded-t-none border-t-2 border-t-blue-500",
          bloc.clampBas && "rounded-b-none border-b-2 border-b-blue-500",
        )}
        style={{
          top: bloc.top * echelle,
          height: Math.max(bloc.hauteur * echelle, 18),
          left: gauche,
          width: largeur,
        }}
      >
        {bloc.proximite && (
          <span
            className={cn(
              "absolute top-1 right-1 size-1.5 rounded-full print:hidden",
              bloc.proximite === "proche" ? "bg-green-500" : "bg-amber-500",
            )}
            aria-hidden="true"
            title={
              bloc.proximite === "proche"
                ? "À proximité d'une autre visite"
                : "Loin d'une autre visite"
            }
          />
        )}
        <span className="truncate text-xs font-semibold text-blue-900 print:text-black">
          {bloc.nomClient}
        </span>
        {bloc.hauteur >= 38 && (
          <span className="truncate text-[11px] text-blue-800 tabular-nums print:text-black">
            {bloc.heureLabel}
          </span>
        )}
        {bloc.conducteurNom && bloc.hauteur >= 56 && (
          <span className="truncate text-[11px] text-blue-700 print:text-black">
            {bloc.conducteurNom}
          </span>
        )}
      </button>

      <Dialog
        ouvert={ouvert}
        onFermer={() => setOuvert(false)}
        titre={bloc.nomClient}
      >
        <div className="space-y-3">
          <p className="text-sm font-medium text-neutral-900">
            {visiteLabel(bloc.numero)}
          </p>
          <dl className="space-y-1.5 text-sm text-neutral-600">
            <div className="flex items-center gap-2">
              <CalendarClock
                className="size-4 shrink-0 text-neutral-400"
                aria-hidden="true"
              />
              <span className="tabular-nums">
                {bloc.dateLabel}, {bloc.heureLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin
                className="size-4 shrink-0 text-neutral-400"
                aria-hidden="true"
              />
              {bloc.adresse}
            </div>
            <div className="flex items-center gap-2">
              <UserRound
                className="size-4 shrink-0 text-neutral-400"
                aria-hidden="true"
              />
              {bloc.conducteurNomComplet}
            </div>
            {bloc.proximite && bloc.distanceProximiteKm !== null && (
              <div
                className={cn(
                  "flex items-center gap-2",
                  bloc.proximite === "proche" ? "text-green-700" : "text-amber-700",
                )}
              >
                <Navigation className="size-4 shrink-0" aria-hidden="true" />
                {bloc.proximite === "proche"
                  ? `À ${formatDistanceKm(bloc.distanceProximiteKm)} de la visite la plus proche`
                  : `Visite isolée : à ${formatDistanceKm(bloc.distanceProximiteKm)} de la visite la plus proche`}
              </div>
            )}
          </dl>

          <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-100 pt-3">
            <Link
              href={`/app/dossiers/${bloc.dossierId}`}
              className={boutonClasses("fantome", "md", "mr-auto")}
            >
              Voir le dossier
            </Link>
            <Button
              variante="fantome"
              className="text-red-700 hover:bg-red-50 hover:text-red-800"
              disabled={annulation}
              onClick={() => setConfirmerAnnulation(true)}
            >
              {annulation ? "Annulation…" : "Annuler la visite"}
            </Button>
            <Link
              href={`/app/dossiers/${bloc.dossierId}/planifier?visite=${bloc.visiteId}&retour=planning`}
              className={boutonClasses("secondaire")}
            >
              Replanifier
            </Link>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        ouvert={confirmerAnnulation}
        onFermer={() => setConfirmerAnnulation(false)}
        titre="Annuler cette visite ?"
        description={`La visite chez ${bloc.nomClient} (${bloc.dateLabel}, ${bloc.heureLabel}) sera supprimée et le dossier retrouvera un statut cohérent. Cette action est définitive.`}
        labelConfirmer="Annuler la visite"
        danger
        onConfirmer={() => {
          setOuvert(false);
          const fd = new FormData();
          fd.set("visiteId", bloc.visiteId);
          startTransition(() => annuler(fd));
        }}
      />
    </>
  );
}
