"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BUCKET_SINISTRES } from "@/lib/supabase/bucket";
import { Button, TACTILE_MOBILE } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/ui";
import {
  ACCEPT_PIECE_JOINTE,
  MAX_TAILLE_PIECE_OCTETS,
  extensionPieceJointe,
  formatTaille,
  type PieceJointeSignee,
} from "@/lib/pieces-jointes";
import {
  creerUploadPieceJointe,
  enregistrerPieceJointe,
  supprimerPieceJointe,
} from "./pieces-jointes-actions";

// Pièces jointes du dossier (devis, courriers…) — back-office. Upload direct
// vers le Storage via URL signée (le fichier ne transite jamais par le serveur
// Next), déclenché soit par le bouton, soit par GLISSER-DÉPOSER sur la zone.
// Liste avec téléchargement (URL signée, nom d'origine forcé) et suppression.
// Après chaque mutation, router.refresh() re-signe la liste côté serveur.
export function PiecesJointes({
  dossierId,
  pieces,
}: {
  dossierId: string;
  pieces: PieceJointeSignee[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [suppression, startSuppression] = useTransition();
  // Pièce en attente de confirmation de suppression (ConfirmDialog maison —
  // même pattern que les autres actions destructives, pas de window.confirm).
  const [aSupprimer, setASupprimer] = useState<{
    id: string;
    nom: string;
  } | null>(null);
  const [glisse, setGlisse] = useState(false);
  // Compteur de profondeur : dragenter/dragleave se déclenchent AUSSI en
  // survolant les enfants — on ne retire le surlignage qu'en quittant vraiment
  // la zone (compteur revenu à 0).
  const profondeur = useRef(0);

  const occupe = envoiEnCours || suppression;

  async function uploaderFichier(fichier: File): Promise<string | null> {
    if (!extensionPieceJointe(fichier.type)) {
      return `« ${fichier.name} » : type de fichier non pris en charge.`;
    }
    if (fichier.size > MAX_TAILLE_PIECE_OCTETS) {
      return `« ${fichier.name} » : fichier trop volumineux (maximum 15 Mo).`;
    }

    const signe = await creerUploadPieceJointe(dossierId, fichier.type);
    if ("error" in signe) return signe.error;

    const supabase = createClient();
    const { error } = await supabase.storage
      .from(BUCKET_SINISTRES)
      .uploadToSignedUrl(signe.path, signe.token, fichier, {
        contentType: fichier.type,
      });
    if (error) return `Échec de l'envoi de « ${fichier.name} ».`;

    const res = await enregistrerPieceJointe(dossierId, {
      path: signe.path,
      nom: fichier.name,
      mimeType: fichier.type,
      taille: fichier.size,
    });
    return res.error;
  }

  // Boucle d'envoi partagée par le bouton (input) et le glisser-déposer.
  async function traiterFichiers(fichiers: File[]) {
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
        reussis > 1 ? `${reussis} pièces ajoutées.` : "Pièce ajoutée.",
      );
      router.refresh();
    }
  }

  function surSelection(e: React.ChangeEvent<HTMLInputElement>) {
    const fichiers = Array.from(e.target.files ?? []);
    // On réinitialise l'input tout de suite : re-sélectionner le même fichier
    // après un échec doit re-déclencher l'événement change.
    e.target.value = "";
    void traiterFichiers(fichiers);
  }

  const aDesFichiers = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types).includes("Files");

  function surDragEnter(e: React.DragEvent) {
    if (!aDesFichiers(e)) return; // ignorer les glissers de texte/éléments
    e.preventDefault();
    profondeur.current += 1;
    setGlisse(true);
  }

  function surDragLeave() {
    profondeur.current -= 1;
    if (profondeur.current <= 0) {
      profondeur.current = 0;
      setGlisse(false);
    }
  }

  function surDrop(e: React.DragEvent) {
    if (!aDesFichiers(e)) return;
    e.preventDefault();
    profondeur.current = 0;
    setGlisse(false);
    void traiterFichiers(Array.from(e.dataTransfer.files ?? []));
  }

  // Déclenchée par le ConfirmDialog (jamais directement) : `suppression`
  // (useTransition) garde les boutons désactivés jusqu'au retour serveur.
  function surSuppression(id: string) {
    startSuppression(async () => {
      const res = await supprimerPieceJointe(id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Pièce supprimée.");
        router.refresh();
      }
    });
  }

  return (
    <div
      onDragEnter={surDragEnter}
      onDragOver={(e) => {
        // preventDefault sur dragover est requis pour que « drop » se déclenche.
        if (aDesFichiers(e)) e.preventDefault();
      }}
      onDragLeave={surDragLeave}
      onDrop={surDrop}
      className={cn(
        "relative space-y-4 rounded-lg transition-colors",
        glisse && "ring-2 ring-primary-300",
      )}
    >
      {/* Invite superposée pendant le survol d'un fichier. */}
      {glisse && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-primary-50/85">
          <span className="flex items-center gap-2 text-sm font-semibold text-primary-800">
            <UploadCloud className="size-5" aria-hidden="true" />
            Déposez les fichiers pour les joindre
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_PIECE_JOINTE}
        onChange={surSelection}
        className="hidden"
        disabled={occupe}
      />

      {pieces.length === 0 ? (
        // État vide = zone de dépôt cliquable (répond au « ça paraît vide »).
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={occupe}
          className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 bg-neutral-50/60 px-6 py-8 text-center transition-colors hover:border-primary-300 hover:bg-primary-50/40 disabled:pointer-events-none disabled:opacity-60"
        >
          {envoiEnCours ? (
            <Loader2
              className="size-6 animate-spin text-neutral-400"
              aria-hidden="true"
            />
          ) : (
            <UploadCloud className="size-6 text-neutral-400" aria-hidden="true" />
          )}
          <span className="text-sm font-medium text-neutral-700">
            {envoiEnCours ? "Envoi…" : "Glissez-déposez vos fichiers ici"}
          </span>
          <span className="text-xs text-neutral-500">
            ou cliquez pour parcourir — devis, courriers, rapports (PDF, images,
            Word, Excel — 15 Mo max)
          </span>
        </button>
      ) : (
        <>
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
                <Paperclip className="size-4" aria-hidden="true" />
              )}
              {envoiEnCours ? "Envoi…" : "Ajouter une pièce"}
            </Button>
            <p className="text-xs text-neutral-500">
              …ou glissez-déposez les fichiers sur la liste. PDF, images, Word ou
              Excel — 15 Mo max par fichier.
            </p>
          </div>

          <ul className="space-y-2">
            {pieces.map((piece) => (
              <li
                key={piece.id}
                className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5"
              >
                <FileText
                  className="size-5 shrink-0 text-neutral-400"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-800">
                    {piece.nom}
                  </p>
                  <p className="text-xs text-neutral-500 tabular-nums">
                    {formatTaille(piece.taille)}
                  </p>
                </div>
                {piece.url ? (
                  <a
                    href={piece.url}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-800 sm:size-9"
                    aria-label={`Télécharger ${piece.nom}`}
                  >
                    <Download className="size-4" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="text-xs text-neutral-400">indisponible</span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setASupprimer({ id: piece.id, nom: piece.nom })
                  }
                  disabled={occupe}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:pointer-events-none disabled:opacity-50 sm:size-9"
                  aria-label={`Supprimer ${piece.nom}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {aSupprimer && (
        <ConfirmDialog
          ouvert
          onFermer={() => setASupprimer(null)}
          titre="Supprimer cette pièce jointe ?"
          description={`« ${aSupprimer.nom} » sera définitivement supprimée du dossier.`}
          labelConfirmer="Supprimer"
          danger
          onConfirmer={() => surSuppression(aSupprimer.id)}
        />
      )}
    </div>
  );
}
