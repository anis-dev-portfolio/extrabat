import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Download,
  FileSignature,
  KeyRound,
  MapPin,
  Phone,
  StickyNote,
  Users,
} from "lucide-react";
import { requireOuvrier } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { etatChantier, dureeEnJours, periodeJoursFr } from "@/lib/chantiers";
import { formatDateFr, formatDateTimeFr } from "@/lib/format";
import { formatTaille } from "@/lib/pieces-jointes";
import { signerDocumentsASigner } from "@/lib/documents-a-signer-storage";
import type { DocumentASignerSigne } from "@/lib/documents-a-signer";
import { mapsRechercheHref } from "@/lib/maps";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EtatChantierBadge } from "@/components/ui/statut-badge";
import { MarquerTermine } from "./marquer-termine";

// Validité des URLs signées des documents : 1 h, le temps de la consultation
// (signatures cachées TTL 30 min — cf. lib/pieces-jointes-storage.ts).
const DOCUMENTS_EXPIRES_IN = 3600;

// Fiche chantier de l'ouvrier : exactement le contenu de la fiche papier
// (FicheOuvrier) rendu vivant — client, adresse cliquable, téléphone,
// infos d'accès, période, co-équipiers — plus les notes du bureau, les
// documents à faire signer et le marquage terminé. RIEN d'autre : select
// minimal explicite, zéro champ financier, pas de compte-rendu d'expertise
// ni de photos de visite (la fiche est logistique).
export default async function MonChantierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, ouvrier } = await requireOuvrier();

  // Triple verrou : id + org + AFFECTATION de cet ouvrier à CE chantier.
  const chantier = await prisma.chantier.findFirst({
    where: {
      id,
      organisationId: user.organisationId,
      affectations: { some: { ouvrierId: ouvrier.id } },
    },
    select: {
      id: true,
      dateDebut: true,
      dateFin: true,
      termineLe: true,
      dossier: {
        select: {
          nomClient: true,
          adresse: true,
          telephone: true,
          infosAcces: true,
          notes: {
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              contenu: true,
              createdAt: true,
              auteur: { select: { nom: true } },
            },
          },
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
        },
      },
      affectations: {
        orderBy: { ouvrier: { nom: "asc" } },
        select: {
          ouvrier: { select: { id: true, nom: true, telephone: true } },
        },
      },
    },
  });
  if (!chantier) notFound();

  const { dossier } = chantier;
  const etat = etatChantier(chantier);
  const nbJours = dureeEnJours(chantier);
  const coEquipiers = chantier.affectations
    .map((a) => a.ouvrier)
    .filter((o) => o.id !== ouvrier.id);

  const documents = await signerDocumentsASigner(
    dossier.documentsASigner,
    DOCUMENTS_EXPIRES_IN,
  );
  const resteASigner = documents.filter((d) => !d.signeLe).length;

  return (
    <div className="space-y-5 pb-6">
      <div className="space-y-2">
        <Link
          href="/app/mes-chantiers"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Mes chantiers
        </Link>
        <h1 className="font-display text-xl font-bold tracking-tight text-neutral-900">
          {dossier.nomClient}
        </h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <EtatChantierBadge etat={etat} />
        </div>
        <p className="text-sm text-neutral-500">
          Travaux {periodeJoursFr(chantier.dateDebut, chantier.dateFin)} ·{" "}
          {nbJours} jour{nbJours > 1 ? "s" : ""}
          {chantier.termineLe && (
            <> · terminé le {formatDateFr(chantier.termineLe)}</>
          )}
        </p>
      </div>

      <Card>
        <CardBody className="space-y-4">
          {/* Adresse cliquable : ouvre l'app de cartographie du téléphone. */}
          <InfoLigne
            icone={<MapPin className="size-4" aria-hidden="true" />}
            label="Adresse"
          >
            <a
              href={mapsRechercheHref(dossier.adresse)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary-800 underline underline-offset-2"
            >
              {dossier.adresse}
            </a>
          </InfoLigne>
          <InfoLigne
            icone={<Phone className="size-4" aria-hidden="true" />}
            label="Téléphone client"
          >
            <a
              href={`tel:${dossier.telephone.replace(/[\s.\-]/g, "")}`}
              className="font-medium text-primary-800 underline underline-offset-2 tabular-nums"
            >
              {dossier.telephone}
            </a>
          </InfoLigne>
          {dossier.infosAcces && (
            <InfoLigne
              icone={<KeyRound className="size-4" aria-hidden="true" />}
              label="Infos d'accès"
            >
              <span className="whitespace-pre-wrap">{dossier.infosAcces}</span>
            </InfoLigne>
          )}
          {coEquipiers.length > 0 && (
            <InfoLigne
              icone={<Users className="size-4" aria-hidden="true" />}
              label="Avec"
            >
              <span className="space-y-0.5">
                {coEquipiers.map((o) => (
                  <span key={o.id} className="block">
                    {o.nom}
                    {o.telephone && (
                      <>
                        {" · "}
                        <a
                          href={`tel:${o.telephone.replace(/[\s.\-]/g, "")}`}
                          className="text-primary-800 underline underline-offset-2 tabular-nums"
                        >
                          {o.telephone}
                        </a>
                      </>
                    )}
                  </span>
                ))}
              </span>
            </InfoLigne>
          )}
        </CardBody>
      </Card>

      {dossier.notes.length > 0 && <NotesDuBureau notes={dossier.notes} />}

      {documents.length > 0 && (
        <DocumentsASigner chantierId={chantier.id} documents={documents} />
      )}

      {/* Marquer terminé : le geste de fin de chantier — avertissement non
          bloquant si des documents restent à signer (le flux nominal est
          signer PUIS terminer). */}
      {!chantier.termineLe && (
        <MarquerTermine
          chantierId={chantier.id}
          nomClient={dossier.nomClient}
          documentsNonSignes={resteASigner}
        />
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

// Notes du dossier rédigées par le back-office — même canal bureau → terrain
// que la fiche visite du conducteur. Lecture seule ; jamais sur les documents
// client.
function NotesDuBureau({
  notes,
}: {
  notes: {
    id: string;
    contenu: string;
    createdAt: Date;
    auteur: { nom: string };
  }[];
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

// Documents de fin de chantier : à signer → écran de signature ; signé →
// coche verte + téléchargement de la version signée. Statut dérivé de
// signeLe, jamais coché.
function DocumentsASigner({
  chantierId,
  documents,
}: {
  chantierId: string;
  documents: DocumentASignerSigne[];
}) {
  return (
    <Card>
      <CardHeader
        titre="Documents à faire signer"
        action={
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600 tabular-nums">
            {documents.length}
          </span>
        }
      />
      <CardBody>
        <ul className="space-y-2">
          {documents.map((doc) =>
            doc.signeLe ? (
              <li
                key={doc.id}
                className="flex min-h-14 items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-2.5"
              >
                <CheckCircle2
                  className="size-5 shrink-0 text-green-700"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-800">
                    {doc.nom}
                  </span>
                  <span className="block text-xs text-neutral-600">
                    Signé le {formatDateTimeFr(doc.signeLe)}
                    {doc.nomSignataire && <> par {doc.nomSignataire}</>}
                  </span>
                </span>
                {doc.urlSigne && (
                  <a
                    href={doc.urlSigne}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-green-100 hover:text-neutral-800"
                    aria-label={`Télécharger ${doc.nom} signé`}
                  >
                    <Download className="size-4" aria-hidden="true" />
                  </a>
                )}
              </li>
            ) : (
              <li key={doc.id}>
                <Link
                  href={`/app/mes-chantiers/${chantierId}/signer/${doc.id}`}
                  className="flex min-h-14 items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 transition-colors hover:bg-amber-100 active:bg-amber-100"
                >
                  <FileSignature
                    className="size-5 shrink-0 text-amber-600"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {doc.nom}
                    </span>
                    <span className="block text-xs text-neutral-600 tabular-nums">
                      À faire signer · {formatTaille(doc.taille)}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-5 shrink-0 text-amber-600"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ),
          )}
        </ul>
      </CardBody>
    </Card>
  );
}
