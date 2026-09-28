import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Ban,
  CalendarPlus,
  ChevronLeft,
  ClipboardPen,
  FileText,
  HardHat,
  Minus,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { DossierStatut } from "@/lib/generated/prisma/enums";
import {
  SEUIL_HUMIDITE,
  dateContreVisiteConseillee,
  doitEtreReplanifie,
  dossierAnnulable,
  suggestStatutApresVisite,
  visiteLabel,
} from "@/lib/metier";
import { etatChantier, periodeJoursFr } from "@/lib/chantiers";
import { devisSaisi, estAEncaisser } from "@/lib/finances";
import { libelleEvenement } from "@/lib/evenements";
import {
  formatDateFr,
  formatDateTimeFr,
  formatPlageDateTimeFr,
} from "@/lib/format";
import { boutonClasses, TACTILE_MOBILE } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  BadgeAlerte,
  EtatChantierBadge,
  StatutDossierBadge,
  StatutVisiteBadge,
} from "@/components/ui/statut-badge";
import { cn } from "@/lib/ui";
import { signerPiecesJointes } from "@/lib/pieces-jointes-storage";
import { signerDocumentsASigner } from "@/lib/documents-a-signer-storage";
import { AnnulerDossier, ReprendreDossier } from "./annulation";
import { SupprimerDossier } from "./suppression";
import { ClientDossier } from "./client-form";
import { ClassementDossier } from "./classement";
import { DevisFinancier } from "./devis-financier";
import { CorrigerCompteRendu } from "./corriger-compte-rendu";
import { NotesDossier } from "./notes";
import { PiecesJointes } from "./pieces-jointes";
import { DocumentsASigner } from "./documents-a-signer";
import { TexteTronque } from "./texte-tronque";
import { VisitePlanifieeActions } from "./visite-actions";
import { titreDossier } from "./titre";

// Validité des URLs signées de téléchargement des pièces jointes : 1 h, le
// temps de la consultation. Signatures CACHÉES par chemin d'objet (TTL 30 min,
// cf. lib/pieces-jointes-storage.ts) : un rendu / router.refresh() ne re-mine
// pas d'URL Storage tant que le TTL court, sans jamais servir d'URL périmée.
const PIECES_EXPIRES_IN = 3600;

const ficheInclude = {
  visites: {
    orderBy: { numero: "desc" },
    include: { conducteur: { select: { nom: true } } },
  },
  chantier: {
    include: {
      affectations: {
        include: { ouvrier: { select: { nom: true } } },
        orderBy: { ouvrier: { nom: "asc" } },
      },
    },
  },
  createdBy: { select: { nom: true } },
  // Notes bornées aux 50 dernières (comme le journal) : la fiche reste légère
  // sur un dossier très suivi. Le compteur affiché s'appuie sur _count.notes
  // (total réel), pas sur la longueur de la page chargée.
  notes: {
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { auteur: { select: { nom: true } } },
  },
  _count: { select: { notes: true } },
  // Journal borné aux 30 derniers événements : la fiche reste légère même sur
  // un dossier très actif (l'historique complet reste en base).
  evenements: {
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { acteur: { select: { nom: true } } },
  },
  // Pièces jointes (devis, courriers…) : chemins d'objets à signer au rendu.
  piecesJointes: {
    orderBy: { createdAt: "desc" },
    select: { id: true, nom: true, taille: true, chemin: true },
  },
  // Documents à faire signer sur le terrain (PV de fin de travaux…).
  documentsASigner: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      nom: true,
      taille: true,
      cheminOriginal: true,
      cheminSigne: true,
      signeLe: true,
      nomSignataire: true,
    },
  },
} satisfies Prisma.DossierInclude;

type VisiteFiche = Prisma.DossierGetPayload<{
  include: typeof ficheInclude;
}>["visites"][number];

type ChantierFiche = Prisma.DossierGetPayload<{
  include: typeof ficheInclude;
}>["chantier"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return titreDossier(id, "Dossier");
}

// Fiche dossier : infos client éditables, timeline des visites (évolution du
// taux visible), actions contextuelles selon le statut.
export default async function FicheDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole(BACK_OFFICE_ROLES);

  const dossier = await prisma.dossier.findFirst({
    where: { id, organisationId: user.organisationId },
    include: ficheInclude,
  });
  if (!dossier) notFound();

  const visites = dossier.visites; // desc par numéro
  const visitePlanifiee = visites.find((v) => v.statut === "PLANIFIEE") ?? null;
  const derniereRealisee = visites.find((v) => v.statut === "REALISEE") ?? null;
  const aReplanifier = doitEtreReplanifie(dossier, visites, new Date());

  // URLs signées de téléchargement des pièces jointes (bucket privé).
  const piecesJointes = await signerPiecesJointes(
    dossier.piecesJointes,
    PIECES_EXPIRES_IN,
  );

  // Documents à faire signer : URLs signées + dates pré-formatées (le
  // composant client ne dépend pas du fuseau du navigateur).
  const documentsASigner = await signerDocumentsASigner(
    dossier.documentsASigner,
    PIECES_EXPIRES_IN,
  );
  const datesSignature = Object.fromEntries(
    documentsASigner
      .filter((d) => d.signeLe)
      .map((d) => [d.id, formatDateTimeFr(d.signeLe as Date)]),
  );
  const nbSignes = documentsASigner.filter((d) => d.signeLe).length;

  // Journal « qui a fait quoi » (desc). Les dossiers antérieurs au journal
  // n'ont pas d'événement CREATION : la première ligne est alors synthétisée
  // depuis createdAt + createdBy — jamais de carte vide.
  const historique = dossier.evenements.map((e) => ({
    id: e.id,
    libelle: libelleEvenement(e.type, e.meta),
    acteur: e.acteur.nom,
    date: e.createdAt,
  }));
  if (!dossier.evenements.some((e) => e.type === "CREATION")) {
    historique.push({
      id: "creation-synthetique",
      libelle: libelleEvenement("CREATION", null),
      acteur: dossier.createdBy.nom,
      date: dossier.createdAt,
    });
  }

  // Volet financier (devis + paiement) : à partir de PRET_POUR_TRAVAUX (le
  // devis se fait après l'expertise) et sur toute la suite du cycle. Badge de
  // synthèse à l'en-tête de la carte : payé / à encaisser / devis non saisi.
  const montrerDevis =
    dossier.statut === "PRET_POUR_TRAVAUX" ||
    dossier.statut === "EN_CHANTIER" ||
    dossier.statut === "TERMINE";
  const badgeDevis = dossier.payeLe
    ? { ton: "vert" as const, label: "Payé" }
    : estAEncaisser(dossier)
      ? { ton: "ambre" as const, label: "À encaisser" }
      : !devisSaisi(dossier)
        ? { ton: "neutre" as const, label: "Devis non saisi" }
        : null;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Link
          href="/app/dossiers"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Dossiers
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-bold tracking-tight">
            {dossier.nomClient}
          </h1>
          <StatutDossierBadge statut={dossier.statut} />
          {aReplanifier && <BadgeAlerte>À re-planifier</BadgeAlerte>}
        </div>
        <p className="text-sm text-neutral-500">
          {dossier.adresse} · Créé le {formatDateFr(dossier.createdAt)}
        </p>
      </div>

      {/* Empêchement signalé par le conducteur (client absent, accès
          impossible…) : alerte tant qu'aucune nouvelle visite n'est
          planifiée — la planification nulle les deux champs. Masqué sur un
          dossier annulé : le bandeau d'annulation prend le relais (et le
          lien « Planifier » serait mort). */}
      {dossier.empechementLe && dossier.statut !== "ANNULE" && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
        >
          <TriangleAlert
            className="size-4 shrink-0 text-amber-700"
            aria-hidden="true"
          />
          <p className="text-sm text-amber-900">
            <strong className="font-semibold">
              Visite empêchée le {formatDateTimeFr(dossier.empechementLe)}
            </strong>
            {dossier.empechementMotif && <> — {dossier.empechementMotif}</>}. À
            re-planifier.
          </p>
          <Link
            href={`/app/dossiers/${dossier.id}/planifier?retour=dossier`}
            className="text-sm font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950"
          >
            Planifier une visite
          </Link>
        </div>
      )}

      {/* Dossier annulé : bandeau neutre (état assumé, pas une alerte) avec
          la date, le motif et la reprise à portée de main. */}
      {dossier.statut === "ANNULE" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-3">
          <Ban
            className="size-4 shrink-0 text-neutral-500"
            aria-hidden="true"
          />
          <p className="text-sm text-neutral-700">
            <strong className="font-semibold text-neutral-900">
              Dossier annulé
              {dossier.annuleLe && <> le {formatDateFr(dossier.annuleLe)}</>}
            </strong>
            {dossier.annulationMotif && <> — {dossier.annulationMotif}</>}.
          </p>
          <ReprendreDossier dossierId={dossier.id} taille="sm" className={TACTILE_MOBILE} />
        </div>
      )}

      {/* Barre latérale (1/3) + colonne principale (2/3), chacune un flux de
          cartes indépendant (items-start : hauteur naturelle, pas
          d'étirement). Latérale = référence & méta (Client, Actions, Devis,
          Pièces jointes, Journal) ; principale = le suivi qui se lit d'un
          trait (Visites puis Notes internes). Aucune carte n'est forcée à la
          hauteur d'une autre → jamais de trou au milieu, quel que soit le
          volume d'infos du dossier. */}
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader titre="Client" />
            <CardBody>
              <ClientDossier
                dossier={{
                  id: dossier.id,
                  nomClient: dossier.nomClient,
                  adresse: dossier.adresse,
                  telephone: dossier.telephone,
                  email: dossier.email,
                  infosAcces: dossier.infosAcces,
                }}
              />
            </CardBody>
          </Card>

          {/* NOUVEAU : l'empty state de la carte Visites porte déjà le CTA
              « Planifier une visite » — pas de carte Actions en doublon. */}
          {dossier.statut !== "NOUVEAU" && (
            <Card>
              <CardHeader titre="Actions" />
              <CardBody>
                <ActionsContextuelles
                  dossier={dossier}
                  chantier={dossier.chantier}
                  visitePlanifiee={visitePlanifiee}
                  derniereRealisee={derniereRealisee}
                  aReplanifier={aReplanifier}
                  seuil={user.organisation.seuilHumidite}
                  delai={user.organisation.delaiSechageJours}
                />
              </CardBody>
            </Card>
          )}

          {montrerDevis && (
            <Card>
              <CardHeader
                titre="Devis"
                action={
                  badgeDevis ? (
                    <Badge ton={badgeDevis.ton}>{badgeDevis.label}</Badge>
                  ) : undefined
                }
              />
              <CardBody>
                <DevisFinancier
                  dossier={{
                    id: dossier.id,
                    statut: dossier.statut,
                    montantDevis: dossier.montantDevis,
                    franchise: dossier.franchise,
                    refDevis: dossier.refDevis,
                    payeLe: dossier.payeLe ? formatDateFr(dossier.payeLe) : null,
                  }}
                />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              titre="Pièces jointes"
              action={
                piecesJointes.length > 0 ? (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600 tabular-nums">
                    {piecesJointes.length}
                  </span>
                ) : undefined
              }
            />
            <CardBody>
              <PiecesJointes dossierId={dossier.id} pieces={piecesJointes} />
            </CardBody>
          </Card>

          {/* PV de fin de travaux et autres documents signés sur le terrain :
              l'assistante dépose le PDF, l'ouvrier le fait signer au client
              sur son téléphone, la version signée revient ici (zéro papier). */}
          <Card>
            <CardHeader
              titre="Documents à faire signer"
              action={
                documentsASigner.length > 0 ? (
                  <Badge ton={nbSignes === documentsASigner.length ? "vert" : "ambre"}>
                    {nbSignes}/{documentsASigner.length} signé
                    {nbSignes > 1 ? "s" : ""}
                  </Badge>
                ) : undefined
              }
            />
            <CardBody>
              <DocumentsASigner
                dossierId={dossier.id}
                documents={documentsASigner}
                dates={datesSignature}
              />
            </CardBody>
          </Card>

          {/* Journal « qui a fait quoi » : des lignes courtes → il vit dans la
              barre latérale, sous les cartes de référence. */}
          <Card>
            <CardHeader
              titre="Journal"
              action={
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600 tabular-nums">
                  {historique.length}
                </span>
              }
            />
            <CardBody>
              <ol>
                {historique.map((ligne) => (
                  <li
                    key={ligne.id}
                    className="border-b border-neutral-100 py-2.5 first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <p className="text-sm text-neutral-800">{ligne.libelle}</p>
                    <p className="text-xs text-neutral-500 tabular-nums">
                      {ligne.acteur} · {formatDateTimeFr(ligne.date)}
                    </p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>

          {/* Annulation : sortie du cycle (apporteur rétracté, client
              injoignable…). Hors de la carte Actions — disponible aussi sur
              un dossier NOUVEAU, qui n'a pas de carte Actions. */}
          {dossierAnnulable(dossier.statut) && (
            <AnnulerDossier dossierId={dossier.id} />
          )}

          {/* Suppression définitive (dossier de test, doublon de saisie) :
              disponible à TOUT statut — le garde-fou est le nom du client
              retapé, re-vérifié côté serveur. */}
          <SupprimerDossier
            dossierId={dossier.id}
            nomClient={dossier.nomClient}
          />
        </div>

        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card>
            <CardHeader
              titre="Visites"
              action={
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600 tabular-nums">
                  {visites.length}
                </span>
              }
            />
            <CardBody>
              {visites.length === 0 ? (
                <EmptyState
                  titre="Aucune visite"
                  description="Planifiez la première visite d'expert pour lancer le dossier : choix du conducteur et du créneau selon ses disponibilités."
                  action={
                    <Link
                      href={`/app/dossiers/${dossier.id}/planifier?retour=dossier`}
                      className={boutonClasses("primaire")}
                    >
                      <CalendarPlus className="size-4" aria-hidden="true" />
                      Planifier une visite
                    </Link>
                  }
                />
              ) : (
                <ol className="space-y-0">
                  {visites.map((visite, i) => (
                    <TimelineVisite
                      key={visite.id}
                      dossierId={dossier.id}
                      visite={visite}
                      precedenteRealisee={
                        visites.find(
                          (v) =>
                            v.statut === "REALISEE" &&
                            v.numero < visite.numero &&
                            v.tauxHumidite != null,
                        ) ?? null
                      }
                      derniere={i === visites.length - 1}
                      seuil={user.organisation.seuilHumidite}
                    />
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>

          {/* Notes de suivi : formulaire + texte libre potentiellement long
              → colonne large, directement sous les visites (le suivi du
              dossier se lit d'un seul flux). Aussi le canal bureau → terrain :
              le conducteur assigné les lit sur sa fiche visite. */}
          <Card>
            <CardHeader
              titre="Notes de suivi"
              action={
                dossier._count.notes > 0 ? (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600 tabular-nums">
                    {dossier._count.notes}
                  </span>
                ) : undefined
              }
            />
            <CardBody>
              <NotesDossier
                dossierId={dossier.id}
                notes={dossier.notes.map((note) => ({
                  id: note.id,
                  contenu: note.contenu,
                  auteur: note.auteur.nom,
                  date: formatDateTimeFr(note.createdAt),
                }))}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ── Actions contextuelles ──────────────────────────────────────────── */

function ActionsContextuelles({
  dossier,
  chantier,
  visitePlanifiee,
  derniereRealisee,
  aReplanifier,
  seuil,
  delai,
}: {
  dossier: {
    id: string;
    statut: DossierStatut;
    classeHumiditeLe: Date | null;
  };
  chantier: ChantierFiche;
  visitePlanifiee: VisiteFiche | null;
  derniereRealisee: VisiteFiche | null;
  aReplanifier: boolean;
  seuil: number;
  delai: number;
}) {
  switch (dossier.statut) {
    case "NOUVEAU":
      return (
        <div className="space-y-2">
          <Link
            href={`/app/dossiers/${dossier.id}/planifier?retour=dossier`}
            className={cn(boutonClasses("primaire"), "w-full")}
          >
            <CalendarPlus className="size-4" aria-hidden="true" />
            Planifier une visite
          </Link>
          <p className="text-xs text-neutral-500">
            Première visite d&apos;expert : choix du conducteur et du créneau
            selon ses disponibilités.
          </p>
        </div>
      );

    case "PLANIFIE":
      return (
        <div className="space-y-2">
          <Link
            href={`/app/dossiers/${dossier.id}/saisir`}
            className={cn(boutonClasses("primaire"), "w-full")}
          >
            <ClipboardPen className="size-4" aria-hidden="true" />
            Saisir le compte-rendu
          </Link>
          <p className="text-xs text-neutral-500">
            {visitePlanifiee
              ? `Saisie back-office pour « ${visiteLabel(visitePlanifiee.numero)} » prévue le ${formatPlageDateTimeFr(visitePlanifiee.datePlanifiee, visitePlanifiee.dureeMinutes)} — normalement remplie par ${visitePlanifiee.conducteur.nom} sur le terrain. Replanifier/annuler : dans la liste des visites.`
              : "Saisie back-office du compte-rendu."}
          </p>
        </div>
      );

    case "REALISE":
      return (
        <div className="space-y-3">
          {derniereRealisee && (
            <p className="text-sm text-neutral-600">
              Taux relevé :{" "}
              <TauxFort taux={derniereRealisee.tauxHumidite} seuil={seuil} /> —
              classez le dossier :
            </p>
          )}
          <ClassementDossier
            dossierId={dossier.id}
            suggestion={suggestStatutApresVisite(
              derniereRealisee?.tauxHumidite ?? null,
              seuil,
            )}
          />
        </div>
      );

    case "EN_ATTENTE_HUMIDITE": {
      const echeance = dateContreVisiteConseillee(dossier, delai);
      return (
        <div className="space-y-2">
          <Link
            href={`/app/dossiers/${dossier.id}/planifier?retour=dossier`}
            className={cn(boutonClasses("primaire"), "w-full")}
          >
            <CalendarPlus className="size-4" aria-hidden="true" />
            Planifier la contre-visite
          </Link>
          <p className="text-xs text-neutral-500">
            {aReplanifier && echeance ? (
              <>
                Le délai de séchage est écoulé depuis le{" "}
                <strong className="font-semibold text-amber-700">
                  {formatDateFr(echeance)}
                </strong>{" "}
                — planifiez la contre-visite.
              </>
            ) : (
              <>
                Séchage en cours (dernier taux :{" "}
                {derniereRealisee?.tauxHumidite ?? "—"} %).
                {echeance && (
                  <>
                    {" "}
                    Contre-visite conseillée à partir du{" "}
                    <strong className="font-semibold text-neutral-700">
                      {formatDateFr(echeance)}
                    </strong>
                    .
                  </>
                )}
              </>
            )}
          </p>
        </div>
      );
    }

    case "PRET_POUR_TRAVAUX":
      return (
        <div className="space-y-2">
          <Link
            href={`/app/chantiers/nouveau?dossier=${dossier.id}`}
            className={cn(boutonClasses("primaire"), "w-full")}
          >
            <HardHat className="size-4" aria-hidden="true" />
            Planifier les travaux
          </Link>
          {derniereRealisee && (
            <Link
              href={`/app/visites/${derniereRealisee.id}/compte-rendu`}
              className={cn(boutonClasses("secondaire"), "w-full")}
            >
              <FileText className="size-4" aria-hidden="true" />
              Voir le compte-rendu
            </Link>
          )}
          <p className="text-xs text-neutral-500">
            Expertise terminée
            {derniereRealisee?.joursReparationEstimes != null &&
              ` — ${derniereRealisee.joursReparationEstimes} j de réparation estimés`}
            . Créez le chantier : dates, ouvriers, travaux à réaliser.
          </p>
        </div>
      );

    // ANNULE : sorti du cycle — la seule action possible est la reprise (le
    // serveur re-dérive le statut depuis les visites réalisées).
    case "ANNULE":
      return (
        <div className="space-y-2">
          <ReprendreDossier dossierId={dossier.id} className="w-full" />
          <p className="text-xs text-neutral-500">
            Dossier annulé — la reprise le remettra dans le cycle avec un
            statut dérivé de ses visites réalisées.
          </p>
        </div>
      );

    // EN_CHANTIER / TERMINE : le dossier est pris en charge par le planning
    // chantier — la boucle se referme ici avec le lien vers la fiche chantier.
    default:
      return (
        <div className="space-y-2">
          {chantier ? (
            <>
              <div className="space-y-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <EtatChantierBadge etat={etatChantier(chantier)} />
                </p>
                <p className="text-neutral-700">
                  Travaux {periodeJoursFr(chantier.dateDebut, chantier.dateFin)}
                </p>
                <p className="text-neutral-500">
                  {chantier.affectations.length > 0
                    ? chantier.affectations
                        .map((a) => a.ouvrier.nom)
                        .join(", ")
                    : "Aucun ouvrier affecté"}
                </p>
              </div>
              <Link
                href={`/app/chantiers/${chantier.id}`}
                className={cn(boutonClasses("primaire"), "w-full")}
              >
                <HardHat className="size-4" aria-hidden="true" />
                Voir le chantier
              </Link>
            </>
          ) : (
            <p className="text-xs text-neutral-500">
              Dossier {dossier.statut === "TERMINE" ? "terminé" : "en chantier"}.
            </p>
          )}
        </div>
      );
  }
}

/* ── Timeline ───────────────────────────────────────────────────────── */

function TimelineVisite({
  dossierId,
  visite,
  precedenteRealisee,
  derniere,
  seuil,
}: {
  dossierId: string;
  visite: VisiteFiche;
  precedenteRealisee: VisiteFiche | null;
  derniere: boolean;
  seuil: number;
}) {
  const planifiee = visite.statut === "PLANIFIEE";

  return (
    <li className="relative flex gap-3.5 pb-6 last:pb-0">
      {/* Rail : pastille + trait vertical. */}
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "mt-1 size-3 shrink-0 rounded-full border-2 border-white ring-2",
            planifiee ? "bg-blue-500 ring-blue-200" : "bg-green-600 ring-green-200",
          )}
          aria-hidden="true"
        />
        {!derniere && (
          <span
            className="mt-1 w-px flex-1 bg-neutral-200"
            aria-hidden="true"
          />
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-neutral-900">
            {visiteLabel(visite.numero)}
          </p>
          <StatutVisiteBadge statut={visite.statut} />
        </div>

        <p className="text-sm text-neutral-600 tabular-nums">
          Prévue le{" "}
          {formatPlageDateTimeFr(visite.datePlanifiee, visite.dureeMinutes)} ·{" "}
          {visite.conducteur.nom}
        </p>

        {visite.statut === "REALISEE" && (
          <>
            {visite.dateRealisee && (
              <p className="text-sm text-neutral-600 tabular-nums">
                Réalisée le {formatDateTimeFr(visite.dateRealisee)}
              </p>
            )}
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-neutral-600">
                Taux : <TauxFort taux={visite.tauxHumidite} seuil={seuil} />
              </span>
              <Evolution visite={visite} precedente={precedenteRealisee} />
              {visite.joursReparationEstimes != null && (
                <span className="text-neutral-500">
                  · {visite.joursReparationEstimes} j de réparation estimés
                </span>
              )}
            </p>
            {visite.piecesEndommagees.length > 0 && (
              <p className="flex flex-wrap gap-1">
                {visite.piecesEndommagees.map((piece) => (
                  <Badge key={piece} ton="neutre">
                    {piece}
                  </Badge>
                ))}
              </p>
            )}
            {visite.resume && (
              <TexteTronque
                texte={visite.resume}
                className="text-sm text-neutral-500"
              />
            )}
            {/* flex-wrap : le formulaire de correction (w-full) passe à la
                ligne sous le lien quand il est déplié. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link
                href={`/app/visites/${visite.id}/compte-rendu`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-800 hover:underline"
              >
                <FileText className="size-3.5" aria-hidden="true" />
                Compte-rendu
              </Link>
              <CorrigerCompteRendu
                visiteId={visite.id}
                valeurs={{
                  pieces: visite.piecesEndommagees,
                  taux: visite.tauxHumidite,
                  jours: visite.joursReparationEstimes,
                  resume: visite.resume,
                  conclusion: visite.conclusion,
                }}
              />
            </div>
          </>
        )}

        {planifiee && (
          <VisitePlanifieeActions
            dossierId={dossierId}
            visiteId={visite.id}
            description={`${visiteLabel(visite.numero)} prévue le ${formatPlageDateTimeFr(visite.datePlanifiee, visite.dureeMinutes)} avec ${visite.conducteur.nom}.`}
          />
        )}
      </div>
    </li>
  );
}

// Évolution du taux entre deux visites réalisées : la baisse est la bonne
// nouvelle (séchage), la hausse une alerte.
function Evolution({
  visite,
  precedente,
}: {
  visite: VisiteFiche;
  precedente: VisiteFiche | null;
}) {
  if (
    visite.tauxHumidite == null ||
    precedente?.tauxHumidite == null
  ) {
    return null;
  }
  const delta = visite.tauxHumidite - precedente.tauxHumidite;
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500">
        <Minus className="size-3.5" aria-hidden="true" />
        stable
      </span>
    );
  }
  const baisse = delta < 0;
  const Icone = baisse ? TrendingDown : TrendingUp;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
        baisse ? "text-green-700" : "text-red-700",
      )}
    >
      <Icone className="size-3.5" aria-hidden="true" />
      {baisse ? "" : "+"}
      {delta} pts
    </span>
  );
}

function TauxFort({
  taux,
  seuil = SEUIL_HUMIDITE,
}: {
  taux: number | null;
  seuil?: number;
}) {
  if (taux == null) return <span className="text-neutral-400">—</span>;
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        taux > seuil ? "text-red-600" : "text-neutral-900",
      )}
    >
      {taux}%
    </span>
  );
}
