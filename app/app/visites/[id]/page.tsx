import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  ChevronRight,
  Download,
  Droplets,
  FileText,
  KeyRound,
  MapPin,
  Phone,
  StickyNote,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import {
  chargerVisiteConducteur,
  chargerVisitePrecedente,
  type VisiteConducteur,
  type VisitePrecedente,
} from "@/lib/visites";
import { SEUIL_HUMIDITE, visiteLabel } from "@/lib/metier";
import {
  formatDateFr,
  formatDateTimeFr,
  formatPlageDateTimeFr,
} from "@/lib/format";
import { debutJourLocal } from "@/lib/planning";
import { signerPhotosLecture, type PhotoSignee } from "@/lib/supabase/admin";
import { signerPiecesJointes } from "@/lib/pieces-jointes-storage";
import { formatTaille, type PieceJointeSignee } from "@/lib/pieces-jointes";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { GaleriePhotos } from "@/components/ui/galerie-photos";
import { BadgeAlerte, StatutVisiteBadge } from "@/components/ui/statut-badge";
import { cn } from "@/lib/ui";
import { BarreVisite } from "./actions-buttons";
import { SignalerEmpechement } from "./empechement";
import { TerrainForm } from "./form";
import { titreVisite } from "./titre";

// Validité des URLs signées de lecture des photos : 7 jours, alignée sur la
// rétention du cache "pages" du service worker — une fiche resservie
// hors-ligne (jusqu'à 7 j) référence des URLs encore valides si une photo
// doit être (re)téléchargée au retour du réseau. Hors-ligne, c'est le cache
// "photos-storage" du SW (clé SANS query string, cf. app/sw.ts) qui sert les
// images, quelle que soit la signature portée par l'URL. Signatures cachées
// par chemin d'objet (TTL 3,5 j = expiresIn/2, cf. urlSigneeLectureCachee) :
// re-rendre la fiche ne re-mine pas d'URL Storage tant que le TTL court.
const LECTURE_EXPIRES_IN = 7 * 24 * 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return titreVisite(id, "Visite");
}

export default async function VisitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole(["CONDUCTEUR"]);

  const visite = await chargerVisiteConducteur(user.id, user.organisationId, id);
  if (!visite) notFound();

  const { dossier } = visite;
  const realisee = visite.statut === "REALISEE";
  const enRetard =
    !realisee && visite.datePlanifiee < debutJourLocal(new Date());

  // Contexte de contre-visite (numero > 1) : la dernière visite réalisée du
  // dossier explique pourquoi le conducteur revient. Chargé seulement avant la
  // saisie (fiche réalisée = son propre compte-rendu suffit). Server component
  // → le bloc est précaché offline avec le reste de la fiche.
  const precedente = realisee
    ? null
    : await chargerVisitePrecedente(
        user.organisationId,
        dossier.id,
        visite.numero,
      );

  // Vignettes du compte-rendu (visite réalisée uniquement) : URLs signées
  // minées côté serveur sur le bucket privé.
  const photosSignees = realisee
    ? await signerPhotosLecture(visite.photos, LECTURE_EXPIRES_IN)
    : [];

  // Documents joints au dossier par le back-office (devis, courriers…) : le
  // conducteur les consulte en pleine visite. Même validité 7 j que les photos
  // (fiche resservie hors-ligne → liens encore valides), mais le téléchargement
  // lui-même demande le réseau.
  const documents = await signerPiecesJointes(
    dossier.piecesJointes,
    LECTURE_EXPIRES_IN,
  );

  return (
    // pb dégagé pour la barre d'actions fixe (au-dessus de la bottom-nav).
    <div className="space-y-5 pb-20">
      <div className="space-y-2">
        <Link
          href="/app/mes-visites"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Mes visites
        </Link>
        <h1 className="font-display text-xl font-bold tracking-tight text-neutral-900">
          {dossier.nomClient}
        </h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatutVisiteBadge statut={visite.statut} />
          {enRetard && <BadgeAlerte />}
        </div>
        <p className="text-sm text-neutral-500">
          {visiteLabel(visite.numero)} · prévue le{" "}
          {formatPlageDateTimeFr(visite.datePlanifiee, visite.dureeMinutes)}
        </p>
      </div>

      <Card>
        <CardBody className="space-y-4">
          <InfoLigne
            icone={<MapPin className="size-4" aria-hidden="true" />}
            label="Adresse"
          >
            {dossier.adresse}
          </InfoLigne>
          <InfoLigne
            icone={<Phone className="size-4" aria-hidden="true" />}
            label="Téléphone client"
          >
            {dossier.telephone}
          </InfoLigne>
          {dossier.infosAcces && (
            <InfoLigne
              icone={<KeyRound className="size-4" aria-hidden="true" />}
              label="Infos d'accès"
            >
              <span className="whitespace-pre-wrap">{dossier.infosAcces}</span>
            </InfoLigne>
          )}
        </CardBody>
      </Card>

      {dossier.notes.length > 0 && <NotesDuBureau notes={dossier.notes} />}

      {documents.length > 0 && <DocumentsDossier documents={documents} />}

      {realisee ? (
        <>
          <CompteRenduLecture visite={visite} photos={photosSignees} />
          <BarreVisite telephone={dossier.telephone} adresse={dossier.adresse} />
        </>
      ) : (
        <>
          {precedente && (
            <VisitePrecedenteBloc
              precedente={precedente}
              classeHumiditeLe={dossier.classeHumiditeLe}
            />
          )}
          <TerrainForm
            visiteId={visite.id}
            nomClient={dossier.nomClient}
            telephone={dossier.telephone}
            adresse={dossier.adresse}
            piecesInitiales={precedente?.piecesEndommagees ?? []}
          />
          {/* Issue de secours terrain (client absent, accès impossible…) :
              uniquement tant que la visite est PLANIFIEE. */}
          {visite.statut === "PLANIFIEE" && (
            <SignalerEmpechement visiteId={visite.id} />
          )}
        </>
      )}
    </div>
  );
}

function InfoLigne({
  icone,
  label,
  children,
}: {
  icone: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 shrink-0 text-neutral-400">{icone}</span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-medium text-neutral-500">{label}</p>
        <p className="text-sm text-neutral-900">{children}</p>
      </div>
    </div>
  );
}

// Notes du dossier rédigées par le back-office — l'assistante s'en sert comme
// canal de consignes vers le terrain (« prévenir le client avant de passer »,
// « prendre la clé chez le gardien »…). Lecture seule côté conducteur ; les
// 20 dernières, la plus récente en premier. N'apparaissent JAMAIS sur le
// compte-rendu imprimable (document client).
function NotesDuBureau({
  notes,
}: {
  notes: VisiteConducteur["dossier"]["notes"];
}) {
  return (
    <Card>
      <CardHeader
        titre="Notes du bureau"
        action={
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600 tabular-nums">
            {notes.length}
          </span>
        }
      />
      <CardBody>
        <ul className="space-y-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3"
            >
              <StickyNote
                className="mt-0.5 size-4 shrink-0 text-amber-500"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm whitespace-pre-wrap text-neutral-800">
                  {note.contenu}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {note.auteur.nom} · {formatDateTimeFr(note.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

// Documents du dossier (devis, courriers…) déposés par le back-office —
// lecture seule côté terrain : liens de téléchargement signés, cibles ≥ 44 px.
// Une signature échouée donne une ligne dégradée sans lien (url null).
function DocumentsDossier({ documents }: { documents: PieceJointeSignee[] }) {
  return (
    <Card>
      <CardHeader
        titre="Documents du dossier"
        action={
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600 tabular-nums">
            {documents.length}
          </span>
        }
      />
      <CardBody>
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li key={doc.id}>
              {doc.url ? (
                <a
                  href={doc.url}
                  className="flex min-h-12 items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 transition-colors hover:bg-neutral-100 active:bg-neutral-200"
                >
                  <FileText
                    className="size-5 shrink-0 text-neutral-400"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-800">
                      {doc.nom}
                    </span>
                    <span className="block text-xs text-neutral-500 tabular-nums">
                      {formatTaille(doc.taille)}
                    </span>
                  </span>
                  <Download
                    className="size-4 shrink-0 text-neutral-500"
                    aria-hidden="true"
                  />
                </a>
              ) : (
                <div className="flex min-h-12 items-center gap-3 rounded-lg border border-dashed border-neutral-300 p-2.5">
                  <FileText
                    className="size-5 shrink-0 text-neutral-300"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-500">
                      {doc.nom}
                    </span>
                    <span className="block text-xs text-neutral-400">
                      lien indisponible
                    </span>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

// Contexte de contre-visite : rappel compact de la dernière visite réalisée
// (taux mis en évidence, pièces, résumé) + date de classement en attente
// humidité — le conducteur sait pourquoi il revient avant de saisir.
function VisitePrecedenteBloc({
  precedente,
  classeHumiditeLe,
}: {
  precedente: VisitePrecedente;
  classeHumiditeLe: Date | null;
}) {
  const taux = precedente.tauxHumidite;
  return (
    <Card>
      <CardHeader
        titre="Visite précédente"
        action={
          precedente.dateRealisee && (
            <span className="text-xs text-neutral-500">
              {formatDateFr(precedente.dateRealisee)}
            </span>
          )
        }
      />
      <CardBody className="space-y-3">
        <p className="text-sm text-neutral-500">
          {visiteLabel(precedente.numero)}
        </p>

        <p
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-display text-base font-bold tabular-nums",
            taux != null && taux > SEUIL_HUMIDITE
              ? "bg-red-50 text-red-700"
              : "bg-neutral-100 text-neutral-900",
          )}
        >
          <Droplets className="size-4" aria-hidden="true" />
          {taux != null ? `${taux} % d'humidité relevés` : "Taux non relevé"}
        </p>

        {precedente.piecesEndommagees.length > 0 && (
          <p className="text-sm text-neutral-900">
            <span className="text-neutral-500">Pièces : </span>
            {precedente.piecesEndommagees.join(", ")}
          </p>
        )}

        {precedente.resume && (
          <p className="line-clamp-3 text-sm whitespace-pre-wrap text-neutral-700">
            {precedente.resume}
          </p>
        )}

        {classeHumiditeLe && (
          <p className="border-t border-neutral-100 pt-2.5 text-sm text-neutral-600">
            Classé en attente humidité le {formatDateFr(classeHumiditeLe)}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

// Récapitulatif en lecture seule d'une visite déjà réalisée.
function CompteRenduLecture({
  visite,
  photos,
}: {
  visite: VisiteConducteur;
  photos: PhotoSignee[];
}) {
  const taux = visite.tauxHumidite;
  return (
    <Card>
      <CardHeader
        titre="Compte-rendu envoyé"
        action={
          visite.dateRealisee && (
            <span className="text-xs text-neutral-500">
              {formatDateTimeFr(visite.dateRealisee)}
            </span>
          )
        }
      />
      <CardBody className="space-y-4">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Taux d&apos;humidité</dt>
            <dd
              className={cn(
                "text-right font-medium tabular-nums",
                taux != null && taux > SEUIL_HUMIDITE
                  ? "text-red-700"
                  : "text-neutral-900",
              )}
            >
              {taux != null ? (
                <span className="inline-flex items-center gap-1">
                  <Droplets className="size-3.5" aria-hidden="true" />
                  {taux} %
                </span>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Jours estimés</dt>
            <dd className="text-right font-medium text-neutral-900 tabular-nums">
              {visite.joursReparationEstimes != null
                ? visite.joursReparationEstimes
                : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Photos</dt>
            <dd className="text-right font-medium text-neutral-900 tabular-nums">
              <span className="inline-flex items-center gap-1">
                <Camera className="size-3.5" aria-hidden="true" />
                {visite.photos.length}
              </span>
            </dd>
          </div>
        </dl>

        {visite.piecesEndommagees.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-neutral-500">Pièces</p>
            <ul className="flex flex-wrap gap-1.5">
              {visite.piecesEndommagees.map((piece) => (
                <li
                  key={piece}
                  className="inline-flex h-8 items-center rounded-full border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-800"
                >
                  {piece}
                </li>
              ))}
            </ul>
          </div>
        )}

        {visite.resume && (
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-neutral-500">Résumé</p>
            <p className="text-sm whitespace-pre-wrap text-neutral-900">
              {visite.resume}
            </p>
          </div>
        )}
        {visite.conclusion && (
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-neutral-500">Conclusion</p>
            <p className="text-sm whitespace-pre-wrap text-neutral-900">
              {visite.conclusion}
            </p>
          </div>
        )}

        {photos.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-neutral-500">Photos</p>
            <GaleriePhotos
              photos={photos}
              classeGrille="grid grid-cols-3 gap-2"
              classeVignette="aspect-square w-full rounded-md border border-neutral-200 object-cover"
              classeIndispo="flex aspect-square items-center justify-center rounded-md border border-dashed border-neutral-300 p-1 text-center text-xs text-neutral-500"
            />
          </div>
        )}

        <Link
          href={`/app/visites/${visite.id}/compte-rendu`}
          className="flex min-h-12 items-center justify-center gap-1.5 rounded-md border border-neutral-300 bg-white text-sm font-medium text-neutral-800 shadow-xs transition-colors hover:bg-neutral-100 active:bg-neutral-200"
        >
          Voir le compte-rendu
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </CardBody>
    </Card>
  );
}
