import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOuvrier } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { urlSigneeLecture } from "@/lib/supabase/admin";
import { SignerDocument } from "./signer-client";

// Écran de signature : l'ouvrier ouvre le PDF, place le cadre de signature,
// tend le téléphone au client qui signe au doigt. Page serveur = triple
// verrou (org + affectation + document du bon chantier) et URL signée de
// LECTURE de l'original ; toute la mécanique visuelle est cliente
// (signer-client.tsx, pdfjs-dist en import dynamique).
export default async function SignerDocumentPage({
  params,
}: {
  params: Promise<{ id: string; documentId: string }>;
}) {
  const { id: chantierId, documentId } = await params;
  const { user, ouvrier } = await requireOuvrier();

  const document = await prisma.documentASigner.findFirst({
    where: {
      id: documentId,
      dossier: {
        organisationId: user.organisationId,
        chantier: {
          id: chantierId,
          affectations: { some: { ouvrierId: ouvrier.id } },
        },
      },
    },
    select: {
      id: true,
      nom: true,
      signeLe: true,
      cheminOriginal: true,
      dossier: { select: { nomClient: true } },
    },
  });
  if (!document) notFound();

  // Déjà signé (autre ouvrier, double onglet) : rien à faire ici.
  if (document.signeLe) redirect(`/app/mes-chantiers/${chantierId}`);

  // URL de lecture inline NON cachée : signée à l'ouverture de l'écran,
  // validité 1 h — largement le temps d'une signature sur le pas de la porte.
  const urlPdf = await urlSigneeLecture(document.cheminOriginal, 3600);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Link
          href={`/app/mes-chantiers/${chantierId}`}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Fiche chantier
        </Link>
        <h1 className="font-display text-lg font-bold tracking-tight text-neutral-900">
          {document.nom}
        </h1>
        <p className="text-sm text-neutral-500">
          Signature de fin de travaux — {document.dossier.nomClient}
        </p>
      </div>

      {urlPdf ? (
        <SignerDocument
          documentId={document.id}
          chantierId={chantierId}
          nomClient={document.dossier.nomClient}
          urlPdf={urlPdf}
        />
      ) : (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Document momentanément indisponible. Vérifiez le réseau puis rouvrez
          cet écran.
        </p>
      )}
    </div>
  );
}
