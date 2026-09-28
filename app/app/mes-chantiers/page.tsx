import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  FileSignature,
  MapPin,
} from "lucide-react";
import { requireOuvrier } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { etatChantier, dureeEnJours, periodeJoursFr } from "@/lib/chantiers";
import { formatDateFr } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { CarteRepliable } from "@/components/ui/collapsible";
import { BoutonAppel } from "@/components/conducteur/bouton-appel";
import { cn } from "@/lib/ui";

export const metadata: Metadata = { title: "Mes chantiers" };

// Espace terrain de l'ouvrier : SES chantiers (vérification d'affectation —
// jamais « les chantiers de l'org »), le chantier en cours mis en avant
// (l'écran du matin dans le camion), puis à venir, puis l'historique récent
// replié. Select minimal STRICT : zéro champ financier du dossier (frontière
// de confidentialité — voir CLAUDE.md).
export default async function MesChantiersPage() {
  const { user, ouvrier } = await requireOuvrier();

  const [actifs, terminesRecents] = await Promise.all([
    prisma.chantier.findMany({
      where: {
        organisationId: user.organisationId,
        affectations: { some: { ouvrierId: ouvrier.id } },
        termineLe: null,
      },
      orderBy: { dateDebut: "asc" },
      select: chantierCarteSelect,
    }),
    prisma.chantier.findMany({
      where: {
        organisationId: user.organisationId,
        affectations: { some: { ouvrierId: ouvrier.id } },
        termineLe: { not: null },
      },
      orderBy: { termineLe: "desc" },
      take: 5,
      select: chantierCarteSelect,
    }),
  ]);

  const maintenant = new Date();
  const groupes = {
    enCours: [] as ChantierCarte[],
    aCloturer: [] as ChantierCarte[],
    aVenir: [] as ChantierCarte[],
  };
  for (const c of actifs) {
    const etat = etatChantier(c, maintenant);
    if (etat === "EN_COURS") groupes.enCours.push(c);
    else if (etat === "A_CLOTURER") groupes.aCloturer.push(c);
    else groupes.aVenir.push(c);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-xl font-bold tracking-tight text-neutral-900">
          Mes chantiers
        </h1>
        <p className="text-sm text-neutral-500">
          {actifs.length === 0
            ? "Aucun chantier en cours"
            : `${actifs.length} chantier${actifs.length > 1 ? "s" : ""} à réaliser`}
        </p>
      </div>

      {actifs.length === 0 && terminesRecents.length === 0 ? (
        <EmptyState
          titre="Aucun chantier"
          description="Vos chantiers apparaîtront ici dès que le bureau vous y affectera."
        />
      ) : (
        <div className="space-y-6">
          <Groupe titre="En cours" chantiers={groupes.enCours} accent />
          <Groupe titre="À clôturer" chantiers={groupes.aCloturer} />
          <Groupe titre="À venir" chantiers={groupes.aVenir} />

          {terminesRecents.length > 0 && (
            <CarteRepliable
              titre="Terminés récemment"
              defautOuvert={false}
              action={
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600 tabular-nums">
                  {terminesRecents.length}
                </span>
              }
            >
              <div className="space-y-2 p-3">
                {terminesRecents.map((c) => (
                  <CarteChantier key={c.id} chantier={c} termine />
                ))}
              </div>
            </CarteRepliable>
          )}
        </div>
      )}
    </div>
  );
}

// Select minimal : les cartes n'affichent que le nécessaire — et le dossier
// ne livre JAMAIS ses champs financiers à un client ouvrier.
const chantierCarteSelect = {
  id: true,
  dateDebut: true,
  dateFin: true,
  termineLe: true,
  dossier: {
    select: {
      nomClient: true,
      adresse: true,
      telephone: true,
      documentsASigner: { where: { signeLe: null }, select: { id: true } },
    },
  },
} satisfies Prisma.ChantierSelect;

type ChantierCarte = Prisma.ChantierGetPayload<{
  select: typeof chantierCarteSelect;
}>;

function Groupe({
  titre,
  chantiers,
  accent = false,
}: {
  titre: string;
  chantiers: ChantierCarte[];
  accent?: boolean;
}) {
  if (chantiers.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2
        className={cn(
          "text-xs font-semibold tracking-wide uppercase",
          accent ? "text-primary-700" : "text-neutral-500",
        )}
      >
        {titre} <span className="font-normal">· {chantiers.length}</span>
      </h2>
      <div className="space-y-2">
        {chantiers.map((c) => (
          <CarteChantier key={c.id} chantier={c} accent={accent} />
        ))}
      </div>
    </section>
  );
}

// Carte au pouce (pattern CarteVisite du conducteur) : le Link couvre la zone
// principale, le bouton d'appel est un élément FRÈRE (jamais de lien imbriqué
// dans un lien — HTML invalide).
function CarteChantier({
  chantier,
  accent = false,
  termine = false,
}: {
  chantier: ChantierCarte;
  accent?: boolean;
  termine?: boolean;
}) {
  const nbJours = dureeEnJours(chantier);
  const docsASigner = chantier.dossier.documentsASigner.length;
  return (
    <div
      className={cn(
        "flex min-h-20 items-stretch rounded-lg border bg-white shadow-xs",
        accent ? "border-primary-200" : "border-neutral-200",
        termine && "bg-neutral-50",
      )}
    >
      <Link
        href={`/app/mes-chantiers/${chantier.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-l-lg p-4 transition-[color,background-color,transform] duration-150 active:scale-[0.99] active:bg-neutral-100"
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <p
            className={cn(
              "truncate font-medium",
              termine ? "text-neutral-500" : "text-neutral-900",
            )}
          >
            {chantier.dossier.nomClient}
          </p>
          <p className="flex items-center gap-1 text-sm text-neutral-500">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{chantier.dossier.adresse}</span>
          </p>
          <p className="truncate text-xs text-neutral-500">
            {termine && chantier.termineLe
              ? `Terminé le ${formatDateFr(chantier.termineLe)}`
              : `Travaux ${periodeJoursFr(chantier.dateDebut, chantier.dateFin)} · ${nbJours} jour${nbJours > 1 ? "s" : ""}`}
          </p>
          {!termine && docsASigner > 0 && (
            <p className="flex items-center gap-1 text-xs font-medium text-amber-700">
              <FileSignature className="size-3.5 shrink-0" aria-hidden="true" />
              {docsASigner > 1
                ? `${docsASigner} documents à faire signer`
                : "1 document à faire signer"}
            </p>
          )}
        </div>

        {termine ? (
          <CheckCircle2
            className="size-5 shrink-0 text-green-700"
            aria-hidden="true"
          />
        ) : (
          <ChevronRight
            className="size-5 shrink-0 text-neutral-400"
            aria-hidden="true"
          />
        )}
      </Link>

      {/* Appel client en 1 tap, cible ≥ 44 px, hors du Link. */}
      <div className="flex items-center border-l border-neutral-200/70 px-2.5">
        <BoutonAppel
          telephone={chantier.dossier.telephone}
          nom={chantier.dossier.nomClient}
        />
      </div>
    </div>
  );
}
