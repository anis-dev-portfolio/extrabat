"use client";

import { useActionState, useEffect } from "react";
import { ajouterNote, type AjouterNoteState } from "../actions";
import { Button, TACTILE_MOBILE } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { LIMITES } from "@/lib/validation";

const initial: AjouterNoteState = { error: null, ok: false, saisie: null };

export type NoteAffichee = {
  id: string;
  contenu: string;
  auteur: string;
  date: string; // déjà formatée côté serveur (lib/format)
};

// Notes de suivi du dossier : liste (auteur, date, contenu) + ajout.
// Visibles aussi par le conducteur sur sa fiche visite (canal bureau →
// terrain) — jamais sur les documents client.
// Journal fidèle — pas de suppression ni d'édition. Le formulaire non
// contrôlé est réinitialisé par React après l'action : reset volontaire en
// succès (toast, pas de redirect), mais après une ERREUR le defaultValue
// nourri par state.saisie re-remplit la note tapée.
export function NotesDossier({
  dossierId,
  notes,
}: {
  dossierId: string;
  notes: NoteAffichee[];
}) {
  const action = ajouterNote.bind(null, dossierId);
  const [state, formAction, pending] = useActionState(action, initial);

  useEffect(() => {
    if (state === initial) return;
    if (state.ok) toast.success("Note ajoutée.");
  }, [state]);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-2">
        <Field label="Ajouter une note" htmlFor="note-contenu">
          <Textarea
            id="note-contenu"
            name="contenu"
            required
            maxLength={LIMITES.NOTE}
            rows={3}
            defaultValue={state.saisie?.contenu ?? ""}
            placeholder="Ex. : le client a rappelé, préférer les matinées…"
          />
        </Field>
        <p className="text-xs text-neutral-500">
          Visible par le conducteur sur sa fiche visite — jamais sur les
          documents client.
        </p>

        {state.error && (
          <p role="alert" className="text-sm text-red-700">
            {state.error}
          </p>
        )}

        <Button type="submit" taille="sm" className={TACTILE_MOBILE} disabled={pending}>
          {pending ? "Ajout…" : "Ajouter la note"}
        </Button>
      </form>

      {notes.length === 0 ? (
        <p className="border-t border-neutral-100 pt-4 text-center text-sm text-neutral-500">
          Aucune note pour l&apos;instant — la première apparaîtra ici.
        </p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-lg border border-neutral-200 bg-neutral-50 p-3"
            >
              <p className="whitespace-pre-wrap text-sm text-neutral-800">
                {note.contenu}
              </p>
              <p className="mt-1.5 text-xs text-neutral-500">
                {note.auteur} · {note.date}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
