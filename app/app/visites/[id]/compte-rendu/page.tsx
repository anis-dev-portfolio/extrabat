import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { BACK_OFFICE_ROLES, isBackOffice, requireRole } from "@/lib/auth";
import { chargerVisitePourLecture } from "@/lib/visites";
import { visiteLabel } from "@/lib/metier";
import { formatDateTimeFr } from "@/lib/format";
import { urlSigneeLectureCachee, signerPhotosLecture } from "@/lib/supabase/admin";
import { Marque } from "@/components/ui/marque";
import { EmptyState } from "@/components/ui/empty-state";
import { GaleriePhotos } from "@/components/ui/galerie-photos";
import { PrintButton } from "@/components/ui/print-button";
import { titreVisite } from "../titre";

// Validité des URLs signées de lecture : 1 h, le temps de consulter/imprimer.
// Signatures cachées par chemin d'objet (TTL 30 min, cf. urlSigneeLectureCachee) :
// recharger la page ne re-mine d'URL qu'à l'expiration du TTL, jamais au-delà
// de la validité de la signature.
const LECTURE_EXPIRES_IN = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return titreVisite(id, "Compte-rendu");
}

export default async function CompteRenduPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Back-office + conducteur uniquement (le loader applique en plus le
  // périmètre du rôle : ses visites assignées pour un conducteur).
  const user = await requireRole([...BACK_OFFICE_ROLES, "CONDUCTEUR"]);

  const visite = await chargerVisitePourLecture(user, id);
  if (!visite) notFound();

  // Retour adapté au rôle : le back-office revient à la fiche dossier, le
  // conducteur à sa fiche visite (il n'a pas accès aux dossiers).
  const retourHref = isBackOffice(user.role)
    ? `/app/dossiers/${visite.dossier.id}`
    : `/app/visites/${visite.id}`;
  const retourLabel = isBackOffice(user.role) ? "Dossier" : "Fiche visite";

  if (visite.statut !== "REALISEE") {
    return (
      <div className="mx-auto max-w-md py-12">
        <EmptyState
          titre="Pas encore de compte-rendu"
          description="Cette visite est planifiée mais n'a pas encore été réalisée : il n'y a rien à imprimer pour l'instant."
          action={
            <Link
              href={retourHref}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary-800 hover:underline"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              {retourLabel}
            </Link>
          }
        />
      </div>
    );
  }

  // Logo de l'organisation (bucket privé) — sans logo, marque ISOBAT.
  const [photos, logoSrc] = await Promise.all([
    signerPhotosLecture(visite.photos, LECTURE_EXPIRES_IN),
    urlSigneeLectureCachee(user.organisation.logoUrl, LECTURE_EXPIRES_IN),
  ]);
  const { dossier } = visite;
  const organisation = user.organisation;
  const tauxEleve =
    visite.tauxHumidite != null &&
    visite.tauxHumidite > organisation.seuilHumidite;

  const coordonnees = [
    organisation.adresse,
    organisation.telephone ? `Tél. ${organisation.telephone}` : null,
    organisation.emailContact,
    organisation.siteWeb,
    organisation.siret ? `SIRET ${organisation.siret}` : null,
  ].filter((v): v is string => Boolean(v));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <Link
          href={retourHref}
          className="inline-flex items-center gap-1 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {retourLabel}
        </Link>
        <PrintButton />
      </div>

      {/* La « feuille » : aperçu papier à l'écran, pleine page sans cadre à
          l'impression. Les couleurs tiennent sans fond imprimé (bordures +
          texte uniquement). */}
      <div className="space-y-6 rounded-xl border border-neutral-200 bg-white p-8 text-neutral-900 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="border-b-2 border-primary-600 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div className="flex items-center gap-3.5">
              {logoSrc ? (
                /* URL signée à durée limitée : next/image n'apporte rien ici. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logoSrc}
                  alt={`Logo ${organisation.nom}`}
                  width={112}
                  height={56}
                  className="h-14 w-auto max-w-28 object-contain"
                />
              ) : (
                <Marque className="h-14 w-auto" />
              )}
              <div>
                <p className="font-display text-xl leading-tight font-bold">
                  {organisation.nom}
                </p>
                <p className="text-xs text-neutral-500">
                  Expertise sinistres humidité
                </p>
                {coordonnees.length > 0 && (
                  <p className="text-xs text-neutral-500">
                    {coordonnees.join(" · ")}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <h1 className="text-base font-bold">Compte-rendu de visite</h1>
              <p className="text-sm text-neutral-600">
                {visiteLabel(visite.numero)}
              </p>
              {visite.dateRealisee && (
                <p className="text-sm text-neutral-600 tabular-nums">
                  Réalisée le {formatDateTimeFr(visite.dateRealisee)}
                </p>
              )}
            </div>
          </div>
        </header>

        <section className="space-y-2">
          <TitreSection>Client</TitreSection>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-3 print:grid-cols-3">
            <Champ label="Nom" valeur={dossier.nomClient} />
            <Champ label="Adresse" valeur={dossier.adresse} />
            <Champ label="Téléphone" valeur={dossier.telephone} />
          </dl>
        </section>

        <section className="space-y-2">
          <TitreSection>Relevés</TitreSection>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-3 print:grid-cols-3">
            <Champ
              label="Taux d'humidité"
              valeur={
                visite.tauxHumidite == null ? (
                  "—"
                ) : tauxEleve ? (
                  <span className="font-semibold text-red-700">
                    {visite.tauxHumidite} % — supérieur au seuil de{" "}
                    {organisation.seuilHumidite} %
                  </span>
                ) : (
                  `${visite.tauxHumidite} %`
                )
              }
            />
            <Champ
              label="Pièces endommagées"
              valeur={
                visite.piecesEndommagees.length === 0 ? (
                  "—"
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {visite.piecesEndommagees.map((piece) => (
                      /* Puce bordée volontairement sans fond : un fond coloré
                         ne s'imprime pas par défaut, une bordure si. */
                      <span
                        key={piece}
                        className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs font-medium"
                      >
                        {piece}
                      </span>
                    ))}
                  </span>
                )
              }
            />
            <Champ
              label="Jours de réparation estimés"
              valeur={
                visite.joursReparationEstimes != null
                  ? String(visite.joursReparationEstimes)
                  : "—"
              }
            />
          </dl>
        </section>

        {visite.resume && (
          <section className="space-y-2">
            <TitreSection>Résumé</TitreSection>
            <p className="text-sm whitespace-pre-wrap">{visite.resume}</p>
          </section>
        )}

        {visite.conclusion && (
          <section className="space-y-2">
            <TitreSection>Conclusion / recommandations</TitreSection>
            <p className="text-sm whitespace-pre-wrap">{visite.conclusion}</p>
          </section>
        )}

        {photos.length > 0 && (
          <section className="space-y-2">
            <TitreSection>Photos ({photos.length})</TitreSection>
            <GaleriePhotos
              photos={photos}
              classeGrille="grid grid-cols-2 gap-3"
              classeVignette="w-full rounded-md border border-neutral-200 object-contain"
              classeIndispo="flex aspect-video items-center justify-center rounded-md border border-dashed border-neutral-300 text-xs text-neutral-500"
              legendes
            />
          </section>
        )}

        <footer className="space-y-1 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
          <p>
            Compte-rendu généré le {formatDateTimeFr(new Date())} —{" "}
            {[organisation.nom, ...coordonnees].join(" · ")}
          </p>
          {organisation.assuranceDecennale && (
            <p>Assurance décennale : {organisation.assuranceDecennale}</p>
          )}
          {organisation.mentionsLegales && (
            <p className="whitespace-pre-wrap">
              {organisation.mentionsLegales}
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}

function TitreSection({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
      {children}
    </h2>
  );
}

function Champ({
  label,
  valeur,
}: {
  label: string;
  valeur: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="font-medium">{valeur}</dd>
    </div>
  );
}
