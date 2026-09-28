import { formatDateFr } from "@/lib/format";
import { finAbsenceExclusive } from "@/lib/planning";
import { Badge } from "@/components/ui/badge";
import { BoutonSupprimer } from "@/components/ui/bouton-supprimer";

// Liste d'absences partagée (conducteurs & ouvriers) : période formatée,
// badge « Passée », bouton retirer avec confirmation. La server action de
// retrait et la conséquence affichée dans la confirmation sont passées en
// props — le rendu reste identique aux deux implémentations d'origine.
export function ListeAbsences({
  absences,
  actionRetirer,
  consequenceRetrait,
}: {
  absences: {
    id: string;
    dateDebut: Date;
    dateFin: Date;
    motif: string | null;
  }[];
  actionRetirer: (formData: FormData) => Promise<{ error: string | null }>;
  // Fin de la phrase de confirmation, après « {période} : » — ex. « l'ouvrier
  // redeviendra disponible à l'affectation sur cette période. »
  consequenceRetrait: string;
}) {
  const maintenant = new Date();

  if (absences.length === 0) {
    return (
      <p className="py-2 text-sm text-neutral-500">
        Aucune absence enregistrée.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-neutral-100">
      {absences.map((a) => {
        // dateFin = minuit du dernier jour INCLUS : l'absence est passée une
        // fois ce jour entier écoulé. finAbsenceExclusive = minuit Paris du
        // lendemain (décalage de jour civil DST-safe, jamais + 24 h en ms).
        const passee =
          finAbsenceExclusive(a).getTime() < maintenant.getTime();
        const periode =
          a.dateDebut.getTime() === a.dateFin.getTime()
            ? formatDateFr(a.dateDebut)
            : `${formatDateFr(a.dateDebut)} → ${formatDateFr(a.dateFin)}`;
        return (
          <li
            key={a.id}
            className="flex items-center justify-between gap-3 py-2"
          >
            <div className={passee ? "text-neutral-400" : "text-neutral-800"}>
              <p className="text-sm font-medium tabular-nums">
                {periode}
                {passee && (
                  <Badge ton="neutre" className="ml-2">
                    Passée
                  </Badge>
                )}
              </p>
              {a.motif && <p className="text-sm text-neutral-500">{a.motif}</p>}
            </div>
            <BoutonSupprimer
              action={actionRetirer}
              id={a.id}
              titre="Retirer cette absence ?"
              succes="Absence retirée."
              ariaLabel={`Retirer l'absence ${periode}`}
              description={`${periode}${a.motif ? ` (${a.motif})` : ""} : ${consequenceRetrait}`}
              className="flex size-11 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-700 sm:size-8"
            />
          </li>
        );
      })}
    </ul>
  );
}
