"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Download,
  FileSignature,
  Loader2,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BUCKET_SINISTRES } from "@/lib/supabase/bucket";
import { Button, TACTILE_MOBILE } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { formatTaille } from "@/lib/pieces-jointes";
import {
  MIME_DOCUMENT_A_SIGNER,
  MAX_TAILLE_DOCUMENT_OCTETS,
  type DocumentASignerSigne,
} from "@/lib/documents-a-signer";
import {
  creerUploadDocumentASigner,
  enregistrerDocumentASigner,
  supprimerDocumentASigner,
} from "./documents-a-signer-actions";

// Documents à faire signer par le client sur le téléphone de l'ouvrier —
// back-office. Upload direct vers le Storage via URL signée (pattern pièces
// jointes), PDF uniquement. La liste montre l'état DÉRIVÉ : à signer / signé
// (avec téléchargement de la version signée). Pas d'édition possible : un
// document À SIGNER erroné se supprime et se renvoie ; un document SIGNÉ est
// une preuve, jamais supprimable (le serveur le refuse aussi).
export function DocumentsASigner({
  dossierId,
  documents,
  dates,
}: {
  dossierId: string;
  documents: DocumentASignerSigne[];
  // signeLe pré-formaté côté serveur (fuseau Paris), indexé par id.
  dates: Record<string, string>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [suppression, startSuppression] = useTransition();
  const [aSupprimer, setASupprimer] = useState<{
    id: string;
    nom: string;
  } | null>(null);

  const occupe = envoiEnCours || suppression;

  async function uploaderFichier(fichier: File): Promise<string | null> {
    if (fichier.type !== MIME_DOCUMENT_A_SIGNER) {
      return `« ${fichier.name} » : seuls les PDF peuvent être envoyés à la signature.`;
    }
    if (fichier.size > MAX_TAILLE_DOCUMENT_OCTETS) {
      return `« ${fichier.name} » : fichier trop volumineux (maximum 15 Mo).`;
    }

    const signe = await creerUploadDocumentASigner(dossierId, fichier.type);
    if ("error" in signe) return signe.error;

    const supabase = createClient();
    const { error } = await supabase.storage
      .from(BUCKET_SINISTRES)
      .uploadToSignedUrl(signe.path, signe.token, fichier, {
        contentType: fichier.type,
      });
    if (error) return `Échec de l'envoi de « ${fichier.name} ».`;

    const res = await enregistrerDocumentASigner(dossierId, {
      path: signe.path,
      nom: fichier.name,
      taille: fichier.size,
    });
    return res.error;
  }

  async function surSelection(e: React.ChangeEvent<HTMLInputElement>) {
    const fichiers = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (fichiers.length === 0 || occupe) return;

    setEnvoiEnCours(true);
    let reussis = 0;
    for (const fichier of fichiers) {
      const erreur = await uploaderFichier(fichier);
      if (erreur) toast.error(erreur);
      else reussis++;
    }
    setEnvoiEnCours(false);

    if (reussis > 0) {
      toast.success(
        reussis > 1
          ? `${reussis} documents envoyés à la signature.`
          : "Document envoyé à la signature — les ouvriers affectés sont prévenus.",
      );
      router.refresh();
    }
  }

  function surSuppression(id: string) {
    startSuppression(async () => {
      const res = await supprimerDocumentASigner(id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Document supprimé.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={MIME_DOCUMENT_A_SIGNER}
        onChange={surSelection}
        className="hidden"
        disabled={occupe}
      />

      <div className="space-y-1.5">
        <Button
          type="button"
          taille="sm"
          className={TACTILE_MOBILE}
          onClick={() => inputRef.current?.click()}
          disabled={occupe}
        >
          {envoiEnCours ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileSignature className="size-4" aria-hidden="true" />
          )}
          {envoiEnCours ? "Envoi…" : "Ajouter un document à faire signer"}
        </Button>
        <p className="text-xs text-neutral-500">
          PDF uniquement, 15 Mo max. L&apos;ouvrier le fait signer au client
          sur son téléphone — le document signé revient ici automatiquement.
        </p>
      </div>

      {documents.length > 0 && (
        <ul className="space-y-2">
          {documents.map((doc) => {
            const signe = doc.signeLe !== null;
            return (
              <li
                key={doc.id}
                className={
                  signe
                    ? "flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-2.5"
                    : "flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5"
                }
              >
                {signe ? (
                  <CheckCircle2
                    className="size-5 shrink-0 text-green-700"
                    aria-hidden="true"
                  />
                ) : (
                  <FileSignature
                    className="size-5 shrink-0 text-amber-600"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-800">
                    {doc.nom}
                  </p>
                  <p className="text-xs text-neutral-600">
                    {signe ? (
                      <>
                        Signé ✓{dates[doc.id] && <> le {dates[doc.id]}</>}
                        {doc.nomSignataire && <> par {doc.nomSignataire}</>}
                      </>
                    ) : (
                      <>À signer · {formatTaille(doc.taille)}</>
                    )}
                  </p>
                </div>
                {signe && doc.urlSigne ? (
                  <a
                    href={doc.urlSigne}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-green-100 hover:text-neutral-800 sm:size-9"
                    aria-label={`Télécharger ${doc.nom} signé`}
                  >
                    <Download className="size-4" aria-hidden="true" />
                  </a>
                ) : doc.urlOriginal ? (
                  <a
                    href={doc.urlOriginal}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-800 sm:size-9"
                    aria-label={`Télécharger ${doc.nom}`}
                  >
                    <Download className="size-4" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="text-xs text-neutral-400">indisponible</span>
                )}
                {!signe && (
                  <button
                    type="button"
                    onClick={() => setASupprimer({ id: doc.id, nom: doc.nom })}
                    disabled={occupe}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:pointer-events-none disabled:opacity-50 sm:size-9"
                    aria-label={`Supprimer ${doc.nom}`}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {aSupprimer && (
        <ConfirmDialog
          ouvert
          onFermer={() => setASupprimer(null)}
          titre="Supprimer ce document ?"
          description={`« ${aSupprimer.nom} » ne sera plus proposé à la signature sur le terrain.`}
          labelConfirmer="Supprimer"
          danger
          onConfirmer={() => surSuppression(aSupprimer.id)}
        />
      )}
    </div>
  );
}
