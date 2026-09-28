import type { Metadata } from "next";
import Link from "next/link";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { chargerChiffreAffaires } from "@/lib/finances-data";
import { formatEuros } from "@/lib/finances";
import { formatDateFr } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td, Th, Tr } from "@/components/ui/table";

// Aligné sur le libellé de la nav et le <h1> — la page s'appelle « Chiffre
// d'affaires » partout où l'utilisateur la voit.
export const metadata: Metadata = { title: "Chiffre d'affaires" };

// Vue Chiffre d'affaires (ASSISTANTE + ADMIN) — une LISTE DE FAITS ADDITIONNÉS,
// pas un dashboard : encaissé par mois de règlement, dossiers à encaisser (où
// courir), carnet de commandes en cours. Chaque total est la somme des lignes
// visibles juste en dessous. Les graphiques/tendances vivent dans la page
// Statistiques (`/app/statistiques`).
export default async function FinancesPage() {
  const user = await requireRole(BACK_OFFICE_ROLES);
  const ca = await chargerChiffreAffaires(user.organisationId);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight">Chiffre d&apos;affaires</h1>
        <p className="text-sm text-neutral-500">
          Montants HT reportés des devis Tolteck. Chaque total est la somme des
          lignes ci-dessous — vérifiable dossier par dossier.
        </p>
      </div>

      {/* ── Encaissé, par mois de règlement ──────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-base font-medium text-neutral-900">
            Encaissé
          </h2>
          <p className="text-sm text-neutral-600">
            Total :{" "}
            <strong className="font-semibold text-neutral-900 tabular-nums">
              {formatEuros(ca.totalPaye)} HT
            </strong>
          </p>
        </div>
        {ca.mois.length === 0 ? (
          <EmptyState
            titre="Aucun règlement pour l'instant"
            description="Les dossiers marqués payés apparaîtront ici, groupés par mois de règlement."
          />
        ) : (
          <div className="space-y-5">
            {ca.mois.map((mois) => (
              <div key={mois.cle} className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-neutral-700 capitalize">
                    {mois.label}
                  </h3>
                  <span className="text-sm font-semibold text-neutral-900 tabular-nums">
                    {formatEuros(mois.total)} HT
                  </span>
                </div>
                {/* Mobile : cartes empilées (mêmes données) — table dès sm. */}
                <div className="space-y-2 sm:hidden">
                  {mois.dossiers.map((d) => (
                    <Link
                      key={d.id}
                      href={`/app/dossiers/${d.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-3 shadow-xs transition-colors hover:border-primary-300"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate text-sm font-semibold text-neutral-900">
                          {d.nomClient}
                        </p>
                        <p className="text-xs text-neutral-500 tabular-nums">
                          Payé le {formatDateFr(d.payeLe)}
                          {d.franchise != null &&
                            ` · franchise ${formatEuros(d.franchise)}`}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-neutral-900 tabular-nums">
                        {formatEuros(d.montantDevis)}
                      </p>
                    </Link>
                  ))}
                </div>

                <div className="hidden sm:block">
                <Table>
                  <thead>
                    <tr>
                      <Th>Client</Th>
                      <Th>Payé le</Th>
                      <Th className="text-right">Franchise</Th>
                      <Th className="text-right">Montant HT</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {mois.dossiers.map((d) => (
                      <Tr key={d.id}>
                        <Td className="font-medium">
                          <Link
                            href={`/app/dossiers/${d.id}`}
                            className="text-primary-800 hover:underline"
                          >
                            {d.nomClient}
                          </Link>
                        </Td>
                        <Td className="text-neutral-600 tabular-nums">
                          {formatDateFr(d.payeLe)}
                        </Td>
                        <Td className="text-right text-neutral-600 tabular-nums">
                          {d.franchise != null ? (
                            formatEuros(d.franchise)
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </Td>
                        <Td className="text-right font-semibold text-neutral-900 tabular-nums">
                          {formatEuros(d.montantDevis)}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
                </div>
              </div>
            ))}
            {ca.payesPlafonnes && (
              <p className="text-xs text-neutral-500">
                Seuls les 500 règlements les plus récents sont affichés.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── À encaisser (terminés, devisés, non payés) ───────────────── */}
      {/* Total + nombre seulement : le détail dossier par dossier vit dans
          l'Historique (filtre « À encaisser »), pour ne pas dupliquer la liste. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-base font-medium text-neutral-900">
            À encaisser
          </h2>
          {ca.nbAEncaisser > 0 && (
            <p className="text-sm text-neutral-600">
              {ca.nbAEncaisser} dossier{ca.nbAEncaisser > 1 ? "s" : ""} ·{" "}
              <strong className="font-semibold text-amber-700 tabular-nums">
                {formatEuros(ca.totalAEncaisser)} HT
              </strong>
            </p>
          )}
        </div>
        {ca.nbAEncaisser === 0 ? (
          <EmptyState
            titre="Rien à encaisser"
            description="Tous les dossiers terminés et devisés ont été réglés."
          />
        ) : (
          <p className="text-sm text-neutral-600">
            Dossiers terminés et devisés, pas encore réglés.{" "}
            <Link
              href="/app/historique?reglement=attente"
              className="font-medium text-primary-800 hover:underline"
            >
              Voir les {ca.nbAEncaisser} dossier
              {ca.nbAEncaisser > 1 ? "s" : ""} à encaisser dans l&apos;historique →
            </Link>
          </p>
        )}
      </section>

      {/* ── En cours (carnet de commandes) ───────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-base font-medium text-neutral-900">
            En cours
          </h2>
          {ca.nbEnCours > 0 && (
            <p className="text-sm text-neutral-600">
              {ca.nbEnCours} chantier{ca.nbEnCours > 1 ? "s" : ""} ·{" "}
              <strong className="font-semibold text-neutral-900 tabular-nums">
                {formatEuros(ca.enCours)} HT
              </strong>
            </p>
          )}
        </div>
        {ca.nbEnCours === 0 ? (
          <EmptyState
            titre="Aucun chantier en cours devisé"
            description="Le carnet de commandes — montant HT des chantiers en cours dont le devis est saisi — apparaîtra ici."
          />
        ) : (
          <p className="text-sm text-neutral-600">
            Carnet de commandes : travaux engagés et devisés, pas encore
            terminés ni encaissés.
          </p>
        )}
      </section>
    </div>
  );
}
