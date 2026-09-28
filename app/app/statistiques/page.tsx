import type { Metadata } from "next";
import Link from "next/link";
import { requireRole, BACK_OFFICE_ROLES } from "@/lib/auth";
import { chargerStatistiques } from "@/lib/statistiques-data";
import {
  PERIODES,
  PERIODE_LABELS,
  PERIODE_DEFAUT,
  estPeriode,
  formatJours,
  formatPourcent,
  type Periode,
} from "@/lib/statistiques";
import { formatEuros } from "@/lib/finances";
import { DOSSIER_STATUT_LABELS } from "@/lib/metier";
import { DOSSIER_STATUT_UI } from "@/components/ui/statut-badge";
import { PrintButton } from "@/components/ui/print-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/lib/ui";
import {
  BarresHorizontales,
  BarresMensuelles,
  DonutStatuts,
  type BarreHorizontale,
} from "./graphes";

export const metadata: Metadata = { title: "Statistiques" };

// Page Statistiques (ASSISTANTE + ADMIN) — le pilotage de l'organisation : où
// ça rame (rouge/ambre), où ça va nickel (vert). Page en LECTURE (requireRole nu).
// Distinction affichée : « À ce jour » (snapshot) vs « Sur la période » (flux) ;
// chaque section porte son badge. Données : lib/statistiques-data.ts (scopé org).
export default async function StatistiquesPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const user = await requireRole(BACK_OFFICE_ROLES);
  const sp = await searchParams;
  const periode: Periode = estPeriode(sp.periode ?? "")
    ? (sp.periode as Periode)
    : PERIODE_DEFAUT;

  // user.organisation est déjà chargée par getCurrentUser() → seuils tenant
  // sans requête supplémentaire.
  const stats = await chargerStatistiques(user.organisationId, user.organisation, periode);

  const b = stats.backlog;
  const a = stats.argent;
  const ch = stats.chantiers;
  const ex = stats.expertise;
  const hu = stats.humidite;

  const segmentsPipeline = stats.pipeline.map((p) => ({
    label: DOSSIER_STATUT_LABELS[p.statut],
    valeur: p.compte,
    couleur: couleurDonut(DOSSIER_STATUT_UI[p.statut].point),
  }));

  const histogramme: BarreHorizontale[] = hu.histogramme.map((h) => ({
    label: h.label,
    valeur: h.compte,
    detail: String(h.compte),
    ton: h.ton,
  }));

  const geo: BarreHorizontale[] = stats.geo.map((g) => ({
    label: g.departement,
    valeur: g.compte,
    detail: String(g.compte),
    ton: "neutre" as const,
  }));

  // Élision française : « d'ISO-BAT » mais « de Duval Étanchéité ».
  const nomOrg = user.organisation.nom;
  const pilotageDe = /^[aeiouyhàâäéèêëîïôöùûü]/i.test(nomOrg)
    ? `d'${nomOrg}`
    : `de ${nomOrg}`;

  return (
    <div className="space-y-8">
      {/* ── En-tête + sélecteur de période ─────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight">Statistiques</h1>
          <p className="text-sm text-neutral-500">
            Le pilotage {pilotageDe} : où ça coince, où ça avance. Les
            indicateurs <em>À ce jour</em> reflètent l&apos;état courant ; ceux{" "}
            <em>Sur la période</em> couvrent {stats.borneLabel.toLowerCase()}.
          </p>
        </div>
        <PrintButton variante="secondaire" />
      </div>

      <SelecteurPeriode courante={stats.periode} />

      {/* ── Baromètre (synthèse) ───────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <TuileStat
          label="Backlog à traiter"
          valeur={String(b.total)}
          detail="à ce jour"
          accent={b.total > 0 ? "rouge" : "vert"}
          href="/app/a-traiter"
        />
        <TuileStat
          label="Retards de clôture"
          valeur={String(b.aClouturer)}
          detail="chantiers"
          accent={b.aClouturer > 0 ? "rouge" : "vert"}
          href="/app/a-traiter"
        />
        <TuileStat
          label="À encaisser"
          valeur={formatEuros(a.aEncaisser)}
          detail={`${a.nbAEncaisser} dossier${a.nbAEncaisser > 1 ? "s" : ""}`}
          accent={a.nbAEncaisser > 0 ? "ambre" : "vert"}
          href="/app/finances"
        />
        <TuileStat
          label="Encaissé (période)"
          valeur={formatEuros(a.encaissePeriode)}
          detail={`${a.nbEncaisse} réglé${a.nbEncaisse > 1 ? "s" : ""}`}
          accent="vert"
        />
        <TuileStat
          label="Nouveaux (période)"
          valeur={String(ex.nouveauxPeriode)}
          detail="dossiers"
        />
        <TuileStat
          label="Humidité > seuil"
          valeur={formatPourcent(hu.pourcentSuperieurSeuil)}
          detail={`sur ${hu.nbReleves} relevé${hu.nbReleves > 1 ? "s" : ""}`}
          accent={hu.pourcentSuperieurSeuil && hu.pourcentSuperieurSeuil > 50 ? "ambre" : "neutre"}
        />
      </section>

      {/* ── Ce qui coince (snapshot) ───────────────────────────────────── */}
      <Section titre="Ce qui coince" portee="snapshot">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <TuileStat
            label="À classer"
            valeur={String(b.aClasser)}
            detail="comptes-rendus reçus"
            accent={b.aClasser > 0 ? "ambre" : "vert"}
            href="/app/a-traiter"
          />
          <TuileStat
            label="À re-planifier"
            valeur={String(b.aReplanifier)}
            detail="séchage dépassé"
            accent={b.aReplanifier > 0 ? "rouge" : "vert"}
            href="/app/a-traiter"
          />
          <TuileStat
            label="Empêchements"
            valeur={String(b.empeches)}
            detail="signalés terrain"
            accent={b.empeches > 0 ? "rouge" : "vert"}
            href="/app/a-traiter"
          />
          <TuileStat
            label="Chantiers à clôturer"
            valeur={String(b.aClouturer)}
            detail="fin dépassée"
            accent={b.aClouturer > 0 ? "rouge" : "vert"}
            href="/app/a-traiter"
          />
        </div>
      </Section>

      {/* ── Pipeline (snapshot) ────────────────────────────────────────── */}
      <Section titre="Pipeline des dossiers" portee="snapshot">
        {stats.pipelineTotal === 0 ? (
          <EmptyState
            titre="Aucun dossier"
            description="Les dossiers se répartiront ici par statut au fil de leur cycle de vie."
          />
        ) : (
          <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-xs">
            <DonutStatuts segments={segmentsPipeline} uniteLegende="dossiers" />
          </div>
        )}
      </Section>

      {/* ── Argent ─────────────────────────────────────────────────────── */}
      <Section titre="Argent" portee="mixte">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <TuileStat
            label="À encaisser"
            valeur={formatEuros(a.aEncaisser)}
            detail={`${a.nbAEncaisser} dossier${a.nbAEncaisser > 1 ? "s" : ""} · à ce jour`}
            accent={a.nbAEncaisser > 0 ? "ambre" : "vert"}
            href="/app/finances"
          />
          <TuileStat
            label="Carnet de commandes"
            valeur={formatEuros(a.carnet)}
            detail={`${a.nbCarnet} en cours · à ce jour`}
            href="/app/finances"
          />
          <TuileStat
            label="Franchise cumulée"
            valeur={formatEuros(a.franchiseCumulee)}
            detail="encaissée sur la période"
          />
          <TuileStat
            label="Délai d'encaissement"
            valeur={formatJours(a.delaiEncaissementMoyen)}
            detail="terminé → payé (moyen)"
            accent={
              a.delaiEncaissementMoyen !== null && a.delaiEncaissementMoyen > 60
                ? "ambre"
                : "neutre"
            }
          />
        </div>

        <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4 shadow-xs">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-700">
              Encaissé par mois de règlement
            </h3>
            <span className="text-sm font-semibold text-emerald-700 tabular-nums">
              {formatEuros(a.encaissePeriode)} HT · sur la période
            </span>
          </div>
          <BarresMensuelles
            items={a.encaisseParMois}
            teinte="emerald"
            format={(centimes) => `${formatEuros(centimes)} HT`}
          />
          {stats.moisPlafonnes && <NotePlafond />}
        </div>
      </Section>

      {/* ── Chantiers ──────────────────────────────────────────────────── */}
      <Section titre="Chantiers" portee="mixte">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          <TuileStat label="À venir" valeur={String(ch.aVenir)} detail="à ce jour" />
          <TuileStat label="En cours" valeur={String(ch.enCours)} detail="à ce jour" />
          <TuileStat
            label="À clôturer"
            valeur={String(ch.aClouturer)}
            detail="à ce jour"
            accent={ch.aClouturer > 0 ? "rouge" : "vert"}
            href="/app/a-traiter"
          />
          <TuileStat
            label="Terminés"
            valeur={String(ch.terminesPeriode)}
            detail="sur la période"
            accent="vert"
          />
          <TuileStat
            label="Durée moyenne"
            valeur={formatJours(ch.dureeMoyenneJours)}
            detail="des travaux"
          />
        </div>
      </Section>

      {/* ── Activité expertise ─────────────────────────────────────────── */}
      <Section titre="Activité expertise" portee="mixte">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <TuileStat
            label="Nouveaux dossiers"
            valeur={String(ex.nouveauxPeriode)}
            detail="sur la période"
          />
          <TuileStat
            label="Visites réalisées"
            valeur={String(ex.visitesRealiseesPeriode)}
            detail="sur la période"
          />
          <TuileStat
            label="Taux de contre-visite"
            valeur={formatPourcent(ex.tauxContreVisite)}
            detail="des visites réalisées"
            accent={ex.tauxContreVisite !== null && ex.tauxContreVisite > 40 ? "ambre" : "neutre"}
          />
          <TuileStat
            label="Délai 1re visite"
            valeur={formatJours(ex.delaiPremiereVisiteMoyen)}
            detail="création → visite (moyen)"
          />
        </div>

        <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4 shadow-xs">
          <h3 className="text-sm font-semibold text-neutral-700">
            Nouveaux dossiers par mois
          </h3>
          <BarresMensuelles
            items={ex.nouveauxParMois}
            teinte="neutral"
            format={(n) => `${n} dossier${n > 1 ? "s" : ""}`}
            montrerValeur
          />
          {stats.moisPlafonnes && <NotePlafond />}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-700">
            Charge par conducteur
          </h3>
          {ex.parConducteur.length === 0 ? (
            <EmptyState
              titre="Aucun conducteur"
              description="Les conducteurs et leur charge de visites apparaîtront ici."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Conducteur</Th>
                  <Th className="text-right">Réalisées</Th>
                  <Th className="text-right">Amplitude</Th>
                  <Th className="text-right">À venir</Th>
                </tr>
              </thead>
              <tbody>
                {ex.parConducteur.map((c) => (
                  <Tr key={c.id}>
                    <Td className="font-medium text-neutral-900">{c.nom}</Td>
                    <Td className="text-right tabular-nums">{c.visitesRealisees}</Td>
                    <Td className="text-right text-neutral-600 tabular-nums">
                      {Math.round(c.heures)} h
                    </Td>
                    <Td className="text-right text-neutral-600 tabular-nums">
                      {c.aVenir}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="px-1 text-xs text-neutral-500">
            Réalisées et amplitude (cumul des plages horaires) : sur la période.
            À venir : visites planifiées à ce jour.
          </p>
        </div>
      </Section>

      {/* ── Humidité ───────────────────────────────────────────────────── */}
      <Section titre="Humidité" portee="flux">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <TuileStat label="Taux moyen" valeur={formatPourcent(hu.moyen)} detail={`${hu.nbReleves} relevé${hu.nbReleves > 1 ? "s" : ""}`} />
          <TuileStat label="Minimum" valeur={formatPourcent(hu.min)} detail="relevé" />
          <TuileStat label="Maximum" valeur={formatPourcent(hu.max)} detail="relevé" />
          <TuileStat
            label="> seuil"
            valeur={formatPourcent(hu.pourcentSuperieurSeuil)}
            detail={`seuil ${stats.seuilHumidite} %`}
            accent={hu.pourcentSuperieurSeuil && hu.pourcentSuperieurSeuil > 50 ? "ambre" : "neutre"}
          />
          <TuileStat
            label="Réparation"
            valeur={formatJours(hu.joursReparationMoyen)}
            detail="estimée (moyen)"
          />
          <TuileStat label="Relevés" valeur={String(hu.nbReleves)} detail="sur la période" />
        </div>

        <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4 shadow-xs">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-700">
              Répartition des relevés
            </h3>
            <span className="text-xs text-neutral-500">
              seuil de classement : {stats.seuilHumidite} %
            </span>
          </div>
          {hu.nbReleves === 0 ? (
            <p className="py-4 text-center text-sm text-neutral-500">
              Aucun relevé d&apos;humidité sur la période.
            </p>
          ) : (
            <BarresHorizontales items={histogramme} />
          )}
        </div>
      </Section>

      {/* ── Géographie ─────────────────────────────────────────────────── */}
      <Section titre="Géographie" portee="snapshot">
        <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4 shadow-xs">
          <h3 className="text-sm font-semibold text-neutral-700">
            Dossiers par département
          </h3>
          {geo.length === 0 ? (
            <p className="py-4 text-center text-sm text-neutral-500">
              Aucun dossier à situer pour l&apos;instant.
            </p>
          ) : (
            <BarresHorizontales items={geo} />
          )}
          <p className="px-1 text-xs text-neutral-500">
            Département déduit du géocodage de l&apos;adresse (best-effort) ; « Non
            renseigné » = adresse non géocodée.
          </p>
        </div>
      </Section>

    </div>
  );
}

// ── Sélecteur de période ─────────────────────────────────────────────────────

function lienPeriode(p: Periode): string {
  return p === PERIODE_DEFAUT
    ? "/app/statistiques"
    : `/app/statistiques?periode=${p}`;
}

function SelecteurPeriode({ courante }: { courante: Periode }) {
  return (
    <nav
      aria-label="Période d'analyse"
      className="inline-flex flex-wrap gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1 print:hidden"
    >
      {PERIODES.map((p) => {
        const actif = p === courante;
        return (
          <Link
            key={p}
            href={lienPeriode(p)}
            aria-current={actif ? "true" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              actif
                ? "bg-primary-600 text-white shadow-xs"
                : "text-neutral-600 hover:bg-white hover:text-neutral-900",
            )}
          >
            {PERIODE_LABELS[p]}
          </Link>
        );
      })}
    </nav>
  );
}

// ── Section (titre + badge de portée) ────────────────────────────────────────

function Section({
  titre,
  portee,
  children,
}: {
  titre: string;
  portee: "snapshot" | "flux" | "mixte";
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-base font-medium text-neutral-900">
          {titre}
        </h2>
        <BadgePortee portee={portee} />
      </div>
      {children}
    </section>
  );
}

function BadgePortee({ portee }: { portee: "snapshot" | "flux" | "mixte" }) {
  const libelle =
    portee === "snapshot"
      ? "À ce jour"
      : portee === "flux"
        ? "Sur la période"
        : "À ce jour + période";
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-xs font-medium",
        portee === "snapshot"
          ? "border-neutral-300 bg-neutral-100 text-neutral-600"
          : "border-primary-200 bg-primary-50 text-primary-700",
      )}
    >
      {libelle}
    </span>
  );
}

// ── Tuile de statistique ─────────────────────────────────────────────────────
// Clone de la TuileStat de l'Historique : un fait (comptage / somme / %) +
// détail. Optionnellement cliquable (href) et accentuée (vert/ambre/rouge).

type Accent = "vert" | "ambre" | "rouge" | "neutre";

const ACCENT_VALEUR: Record<Accent, string> = {
  vert: "text-emerald-700",
  ambre: "text-amber-700",
  rouge: "text-red-700",
  neutre: "text-neutral-900",
};

function TuileStat({
  label,
  valeur,
  detail,
  accent = "neutre",
  href,
}: {
  label: string;
  valeur: string;
  detail?: string;
  accent?: Accent;
  href?: string;
}) {
  const contenu = (
    <>
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className={cn("mt-0.5 text-lg font-bold tabular-nums", ACCENT_VALEUR[accent])}>
        {valeur}
      </p>
      {detail && <p className="text-xs text-neutral-500">{detail}</p>}
    </>
  );
  const classe =
    "rounded-xl border border-neutral-200 bg-white p-3 shadow-xs transition-colors";
  if (href) {
    return (
      <Link href={href} className={cn(classe, "hover:border-neutral-300")}>
        {contenu}
      </Link>
    );
  }
  return <div className={classe}>{contenu}</div>;
}

// Depuis le passage des agrégats en SQL, seul l'axe mensuel est plafonné (les
// moyennes/délais sont calculés en base sur l'exhaustivité des lignes).
function NotePlafond() {
  return (
    <p className="px-1 text-xs text-neutral-400">
      Seuls les 36 derniers mois sont affichés.
    </p>
  );
}

// « bg-slate-500 » → « var(--color-slate-500) » : réutilise la couleur de
// statut (DOSSIER_STATUT_UI.point) pour l'arc du donut, sans dupliquer la
// palette (Tailwind v4 expose chaque teinte en variable CSS).
function couleurDonut(pointClass: string): string {
  return `var(--color-${pointClass.replace(/^bg-/, "")})`;
}
