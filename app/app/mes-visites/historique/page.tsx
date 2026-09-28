import type { Metadata } from "next";
import Link from "next/link";
import { Camera, ChevronRight, Droplets } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { SEUIL_HUMIDITE, visiteLabel } from "@/lib/metier";
import { formatDateTimeFr } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/ui";
import { RechercheHistorique } from "./recherche";

const HISTORIQUE_MAX = 100;

// « juillet 2026 » — en-têtes de groupe de l'historique.
const moisAnneeFr = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

export const metadata: Metadata = { title: "Historique des visites" };

// Historique du conducteur : SES visites réalisées, de la plus récente à la
// plus ancienne, groupées par mois (fuseau Europe/Paris).
export default async function HistoriquePage() {
  const user = await requireRole(["CONDUCTEUR"]);

  const [visites, total] = await Promise.all([
    prisma.visite.findMany({
      where: {
        conducteurId: user.id,
        statut: "REALISEE",
        dossier: { organisationId: user.organisationId },
      },
      orderBy: { dateRealisee: "desc" },
      take: HISTORIQUE_MAX,
      select: visiteHistoriqueSelect,
    }),
    prisma.visite.count({
      where: {
        conducteurId: user.id,
        statut: "REALISEE",
        dossier: { organisationId: user.organisationId },
      },
    }),
  ]);

  // Groupes par mois, dans l'ordre d'arrivée (déjà trié desc).
  const parMois = new Map<string, VisiteHistorique[]>();
  for (const v of visites) {
    const cle = moisAnneeFr.format(v.dateRealisee ?? v.datePlanifiee);
    const groupe = parMois.get(cle);
    if (groupe) groupe.push(v);
    else parMois.set(cle, [v]);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-xl font-bold tracking-tight text-neutral-900">
          Historique
        </h1>
        <p className="text-sm text-neutral-500">
          {total === 0
            ? "Aucune visite réalisée"
            : `${total} visite${total > 1 ? "s" : ""} réalisée${total > 1 ? "s" : ""}`}
        </p>
      </div>

      {/* La recherche (client) interroge le serveur sur TOUT le périmètre du
          conducteur ; tant qu'elle est inactive, la liste par mois s'affiche. */}
      <RechercheHistorique>
        {visites.length === 0 ? (
          <EmptyState
            titre="Aucune visite réalisée pour l'instant"
            description="Vos comptes-rendus envoyés apparaîtront ici, du plus récent au plus ancien."
          />
        ) : (
          <div className="space-y-6">
            {[...parMois.entries()].map(([mois, groupe]) => (
              <section key={mois} className="space-y-2">
                <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                  {mois} <span className="font-normal">· {groupe.length}</span>
                </h2>
                <div className="space-y-2">
                  {groupe.map((v) => (
                    <CarteHistorique key={v.id} visite={v} />
                  ))}
                </div>
              </section>
            ))}
            {total > visites.length && (
              <p className="text-center text-xs text-neutral-500">
                Les {visites.length} visites les plus récentes sont affichées —
                la recherche couvre tout l&apos;historique.
              </p>
            )}
          </div>
        )}
      </RechercheHistorique>
    </div>
  );
}

// select minimal : les cartes n'affichent ni resume/conclusion (≤ 5000 car.
// chacun) ni piecesEndommagees — on ne transfère que les champs rendus.
const visiteHistoriqueSelect = {
  id: true,
  numero: true,
  tauxHumidite: true,
  datePlanifiee: true,
  dateRealisee: true,
  dossier: { select: { nomClient: true, adresse: true } },
  _count: { select: { photos: true } },
} satisfies Prisma.VisiteSelect;

type VisiteHistorique = Prisma.VisiteGetPayload<{
  select: typeof visiteHistoriqueSelect;
}>;

// Carte au pouce : lien vers la fiche (lecture seule), taux d'humidité mis en
// avant — rouge au-dessus du seuil de contre-visite, vert sinon.
function CarteHistorique({ visite }: { visite: VisiteHistorique }) {
  const taux = visite.tauxHumidite;
  return (
    <Link
      href={`/app/visites/${visite.id}`}
      className="flex min-h-20 items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-xs transition-colors active:bg-neutral-100"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate font-medium text-neutral-900">
          {visite.dossier.nomClient}
        </p>
        <p className="truncate text-sm text-neutral-500">
          {visite.dossier.adresse}
        </p>
        <p className="truncate text-xs text-neutral-500">
          {visiteLabel(visite.numero)}
          {visite.dateRealisee &&
            ` · le ${formatDateTimeFr(visite.dateRealisee)}`}
          {visite._count.photos > 0 && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 align-text-bottom">
              <Camera className="size-3.5" aria-hidden="true" />
              {visite._count.photos}
            </span>
          )}
        </p>
      </div>

      {taux != null && (
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums",
            taux > SEUIL_HUMIDITE
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-green-200 bg-green-50 text-green-800",
          )}
        >
          <Droplets className="size-3.5" aria-hidden="true" />
          {taux} %
        </span>
      )}
      <ChevronRight
        className="size-5 shrink-0 text-neutral-400"
        aria-hidden="true"
      />
    </Link>
  );
}
