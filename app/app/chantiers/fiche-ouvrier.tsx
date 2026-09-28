import { Marque } from "@/components/ui/marque";

// La « fiche ouvrier » : l'ordre de travail papier qu'un ouvrier emporte —
// où aller, qui appeler, comment entrer, avec qui. Le détail des travaux est
// sur le devis (version sans prix) imprimé et remis à part par l'assistante.
// Aucune donnée d'expertise (taux, photos) : la fiche parle logistique, pas
// sinistre. Même mécanique « feuille » que le compte-rendu de visite : aperçu
// à l'écran, pleine page à l'impression, bordures + texte (pas de fond).

export type ChantierPourFiche = {
  id: string;
  periode: string; // « du 6 juillet au 10 juillet »
  nbJours: number;
  nomClient: string;
  adresse: string;
  telephone: string;
  infosAcces: string | null;
  coEquipiers: string[];
};

export type OrganisationFiche = {
  nom: string;
  logoSrc: string | null;
  coordonnees: string[];
};

export function FicheOuvrier({
  organisation,
  titre,
  ouvrier,
  chantiers,
  genereLe,
}: {
  organisation: OrganisationFiche;
  titre: string; // « Semaine du 6 au 12 juillet »
  ouvrier: { nom: string; telephone: string | null };
  chantiers: ChantierPourFiche[];
  genereLe: string;
}) {
  return (
    <div className="space-y-6 rounded-xl border border-neutral-200 bg-white p-8 text-neutral-900 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="border-b-2 border-primary-600 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex items-center gap-3.5">
            {organisation.logoSrc ? (
              /* URL signée à durée limitée : next/image n'apporte rien ici. */
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={organisation.logoSrc}
                alt={`Logo ${organisation.nom}`}
                width={96}
                height={48}
                className="h-12 w-auto max-w-24 object-contain"
              />
            ) : (
              <Marque className="h-12 w-auto" />
            )}
            <div>
              <p className="font-display text-lg leading-tight font-bold">
                {organisation.nom}
              </p>
              {organisation.coordonnees.length > 0 && (
                <p className="text-xs text-neutral-500">
                  {organisation.coordonnees.join(" · ")}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-base font-bold">Fiche de chantier</h2>
            <p className="text-sm text-neutral-600">{titre}</p>
            <p className="mt-1 text-lg font-bold text-primary-800">
              {ouvrier.nom}
            </p>
            {ouvrier.telephone && (
              <p className="text-xs text-neutral-500 tabular-nums">
                {ouvrier.telephone}
              </p>
            )}
          </div>
        </div>
      </header>

      {chantiers.map((c) => (
        <section
          key={c.id}
          className="break-inside-avoid space-y-3 rounded-lg border border-neutral-300 p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-200 pb-2">
            <h3 className="text-base font-bold">Chez {c.nomClient}</h3>
            <p className="text-sm font-medium text-neutral-700 tabular-nums">
              Travaux {c.periode} · {c.nbJours} jour{c.nbJours > 1 ? "s" : ""}
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2 print:grid-cols-2">
            <div className="space-y-0.5">
              <dt className="text-xs text-neutral-500">Adresse</dt>
              <dd className="font-medium">{c.adresse}</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-neutral-500">Téléphone client</dt>
              <dd className="font-medium tabular-nums">{c.telephone}</dd>
            </div>
            {c.infosAcces && (
              <div className="space-y-0.5 sm:col-span-2 print:col-span-2">
                <dt className="text-xs text-neutral-500">Infos d&apos;accès</dt>
                <dd className="font-medium whitespace-pre-wrap">
                  {c.infosAcces}
                </dd>
              </div>
            )}
          </dl>

          {c.coEquipiers.length > 0 && (
            <p className="border-t border-neutral-200 pt-2 text-sm text-neutral-600">
              <span className="font-medium text-neutral-800">Avec :</span>{" "}
              {c.coEquipiers.join(", ")}
            </p>
          )}
        </section>
      ))}

      <footer className="border-t border-neutral-200 pt-3 text-xs text-neutral-500">
        <p>
          Fiche générée le {genereLe} —{" "}
          {[organisation.nom, ...organisation.coordonnees].join(" · ")}
        </p>
      </footer>
    </div>
  );
}
