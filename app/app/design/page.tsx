import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Marque } from "@/components/ui/marque";
import { Skeleton, SkeletonTexte } from "@/components/ui/skeleton";
import {
  BadgeAlerte,
  StatutDossierBadge,
  StatutVisiteBadge,
} from "@/components/ui/statut-badge";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { DOSSIER_STATUTS } from "@/lib/metier";
import {
  DemoChips,
  DemoDialogs,
  DemoSegmented,
  DemoToasts,
} from "./demo-interactifs";

export const metadata = { title: "Design system" };

// Échelle turquoise ISOBAT (tokens @theme de app/globals.css).
const PALETTE_PRIMAIRE = [
  { nom: "50", classe: "bg-primary-50", hex: "#F0FCFE", sombre: false },
  { nom: "100", classe: "bg-primary-100", hex: "#DBF5FA", sombre: false },
  { nom: "200", classe: "bg-primary-200", hex: "#B6EBF4", sombre: false },
  { nom: "300", classe: "bg-primary-300", hex: "#81D9E9", sombre: false },
  { nom: "400", classe: "bg-primary-400", hex: "#3FBFD3", sombre: false },
  { nom: "500", classe: "bg-primary-500", hex: "#0FA8BC", sombre: true },
  { nom: "600", classe: "bg-primary-600", hex: "#008192", sombre: true },
  { nom: "700", classe: "bg-primary-700", hex: "#007282", sombre: true },
  { nom: "800", classe: "bg-primary-800", hex: "#075F6B", sombre: true },
  { nom: "900", classe: "bg-primary-900", hex: "#144F58", sombre: true },
  { nom: "950", classe: "bg-primary-950", hex: "#083138", sombre: true },
];

const SENS_STATUTS: Record<string, string> = {
  NOUVEAU: "Entrant, à prendre en charge",
  PLANIFIE: "Programmé, attend le terrain",
  REALISE: "File « à traiter » de l'assistante",
  EN_ATTENTE_HUMIDITE: "Séchage en cours, contre-visite à prévoir",
  PRET_POUR_TRAVAUX: "Terminé, prêt pour travaux",
  ANNULE: "Annulé avant travaux — réversible (reprise)",
};

function Section({
  titre,
  description,
  children,
}: {
  titre: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-medium text-neutral-900">
          {titre}
        </h2>
        {description && (
          <p className="mt-0.5 text-sm text-neutral-500">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

// Proposition B : chevron épuré (faces extérieures seules) — meilleure
// lisibilité aux très petites tailles.
function MarqueEpuree({ className }: { className?: string }) {
  return (
    <svg viewBox="61 31 692 764" className={className} aria-hidden="true">
      <polygon fill="#12A8BC" points="406,61 91,297 91,765 406,529" />
      <polygon fill="#A8A8A8" points="408,61 723,297 723,765 408,529" />
    </svg>
  );
}

export default async function DesignPage() {
  // Page interne de développement : aucune raison d'exister en production
  // (surface morte), même correctement gardée ADMIN.
  if (process.env.NODE_ENV === "production") notFound();
  await requireRole(["ADMIN"]);

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-neutral-900">
            Design system
          </h1>
          <Badge ton="neutre">Interne — Admin</Badge>
        </div>
        <p className="max-w-2xl text-sm text-neutral-500">
          Référence visuelle de la refonte : identité ISOBAT, code couleur des
          statuts et bibliothèque de composants. Cette page sert à valider
          l&apos;aperçu avant l&apos;application écran par écran.
        </p>
      </header>

      {/* ── Identité ──────────────────────────────────────────────────── */}
      <Section
        titre="Identité"
        description="Marque isométrique vectorisée depuis l'actif d'origine ; turquoise échantillonné #12A8BC, gris #A8A8A8 (= échelle neutral)."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardBody className="flex items-center justify-center gap-6 py-8">
              <Marque className="h-20 w-auto" />
              <div className="flex flex-col leading-tight">
                <span className="font-display text-3xl font-bold tracking-wide text-primary-700">
                  ISOBAT
                </span>
                <span className="text-sm text-neutral-500">
                  Suivi de chantier
                </span>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="flex items-center justify-center gap-8 py-8">
              <Marque mono className="h-14 w-auto text-primary-600" />
              <Marque mono className="h-14 w-auto text-neutral-300" />
            </CardBody>
          </Card>
          <Card>
            <CardBody className="py-8">
              <p className="text-sm text-neutral-600">
                Version <span className="font-medium">mono</span> (currentColor)
                : état actif de la navigation, états vides, filigranes. Un seul
                geste identitaire, le reste sobre.
              </p>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader titre="Turquoise ISOBAT — primary" />
          <CardBody>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
              {PALETTE_PRIMAIRE.map(({ nom, classe, hex, sombre }) => (
                <div key={nom} className="space-y-1">
                  <div
                    className={`${classe} flex h-14 items-end rounded-md px-1.5 pb-1 ${
                      sombre ? "text-white" : "text-neutral-900"
                    }`}
                  >
                    <span className="text-[11px] font-semibold">{nom}</span>
                  </div>
                  <p className="text-center text-[10px] text-neutral-500 uppercase">
                    {hex}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Rôle : marque + actions (boutons, liens, focus, nav active) —
              jamais un statut. 500 = turquoise de la marque ; à partir de 600,
              texte blanc ≥ 4.5:1. Le gris ISOBAT est l&apos;échelle{" "}
              <code className="rounded bg-neutral-100 px-1">neutral</code> de
              Tailwind (neutral-400 ≈ #A3A3A3 ≈ gris de la marque).
            </p>
          </CardBody>
        </Card>
      </Section>

      {/* ── Typographie ───────────────────────────────────────────────── */}
      <Section
        titre="Typographie"
        description="Ubuntu pour la marque et les titres, Ubuntu Sans pour le corps et l'UI."
      >
        <Card>
          <CardBody className="space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
                Titres — Ubuntu
              </p>
              <p className="font-display text-3xl font-bold text-neutral-900">
                Dossier Martin — dégât des eaux
              </p>
              <p className="font-display text-xl font-medium text-neutral-900">
                Première visite d&apos;expert
              </p>
            </div>
            <div className="space-y-2 border-t border-neutral-100 pt-4">
              <p className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
                Corps — Ubuntu Sans
              </p>
              <p className="max-w-2xl text-sm text-neutral-700">
                Le taux d&apos;humidité relevé dans la chambre principale
                atteint 32 % : au-delà du seuil de 25 %, une contre-visite est
                nécessaire après séchage. L&apos;assistante confirme le
                classement suggéré.
              </p>
            </div>
            <div className="space-y-2 border-t border-neutral-100 pt-4">
              <p className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
                Chiffres tabulaires — tables, taux, heures du planning
              </p>
              <p className="font-medium text-neutral-900 tabular-nums">
                08:00 → 09:30 · 32,4 % · 14 jours · n° 2026-041
              </p>
            </div>
          </CardBody>
        </Card>
      </Section>

      {/* ── Statuts ───────────────────────────────────────────────────── */}
      <Section
        titre="Code couleur des statuts"
        description="La lecture du kanban et du planning : toujours icône + libellé, jamais la couleur seule. Le turquoise n'est jamais un statut."
      >
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {DOSSIER_STATUTS.map((statut) => (
                <StatutDossierBadge key={statut} statut={statut} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
              <StatutVisiteBadge statut="PLANIFIEE" />
              <StatutVisiteBadge statut="REALISEE" />
              <BadgeAlerte />
              <BadgeAlerte>Conflit de créneau</BadgeAlerte>
            </div>
            <dl className="grid gap-1.5 border-t border-neutral-100 pt-4 text-sm sm:grid-cols-2">
              {DOSSIER_STATUTS.map((statut) => (
                <div key={statut} className="flex items-baseline gap-2">
                  <dt className="shrink-0 font-medium text-neutral-800">
                    {statut === "EN_ATTENTE_HUMIDITE"
                      ? "En attente"
                      : statut.charAt(0) + statut.slice(1).toLowerCase()}
                  </dt>
                  <dd className="text-neutral-500">{SENS_STATUTS[statut]}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </Section>

      {/* ── Composants ────────────────────────────────────────────────── */}
      <Section
        titre="Composants"
        description="Bibliothèque maison components/ui — pas de dépendance de thème."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader titre="Boutons" />
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button>Planifier la visite</Button>
                <Button variante="secondaire">Annuler</Button>
                <Button variante="danger">Supprimer</Button>
                <Button variante="fantome">Voir le détail</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button taille="sm" variante="secondaire">
                  Taille sm
                </Button>
                <Button taille="md" variante="secondaire">
                  Taille md
                </Button>
                <Button taille="pouce">Taille pouce (terrain, ≥ 44 px)</Button>
                <Button disabled>Désactivé</Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader titre="Champs de formulaire" />
            <CardBody className="space-y-4">
              <Field label="Nom du client" htmlFor="demo-nom">
                <Input id="demo-nom" placeholder="Ex. : M. Martin" />
              </Field>
              <Field label="Conducteur" htmlFor="demo-conducteur">
                <Select id="demo-conducteur" defaultValue="">
                  <option value="" disabled>
                    Choisir un conducteur
                  </option>
                  <option>Conducteur A.</option>
                  <option>Conducteur B.</option>
                </Select>
              </Field>
              <Field
                label="Téléphone"
                htmlFor="demo-tel"
                erreur="Numéro incomplet : 10 chiffres attendus."
              >
                <Input id="demo-tel" aria-invalid defaultValue="06 12 34" />
              </Field>
              <Field
                label="Résumé de l'intervention"
                htmlFor="demo-resume"
                aide="Visible sur le compte-rendu envoyé au client."
              >
                <Textarea id="demo-resume" placeholder="Constats, mesures…" />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader titre="Badges" />
            <CardBody className="flex flex-wrap items-center gap-2">
              <Badge>Neutre</Badge>
              <Badge ton="primaire">Primaire</Badge>
              <Badge ton="ardoise">Ardoise</Badge>
              <Badge ton="bleu">Bleu</Badge>
              <Badge ton="violet">Violet</Badge>
              <Badge ton="ambre">Ambre</Badge>
              <Badge ton="vert">Vert</Badge>
              <Badge ton="rouge">Rouge</Badge>
            </CardBody>
          </Card>

          <Card>
            <CardHeader titre="Bascule segmentée" />
            <CardBody className="space-y-3">
              <DemoSegmented />
              <p className="text-xs text-neutral-500">
                Bascules de vue : kanban/liste (Vague 4), semaine/jour au
                planning (Vague 3).
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader titre="Dialogues et confirmations" />
            <CardBody className="space-y-3">
              <DemoDialogs />
              <p className="text-xs text-neutral-500">
                Toute action irréversible « 1 clic » passera par une
                confirmation (classement, annulation, retrait d&apos;un
                membre).
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader titre="Toasts" />
            <CardBody className="space-y-3">
              <DemoToasts />
              <p className="text-xs text-neutral-500">
                Confirmation visible après chaque mutation — fin des redirects
                silencieux.
              </p>
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader titre="Sélecteur de pièces (puces + ajout libre)" />
            <CardBody>
              <DemoChips />
            </CardBody>
          </Card>

          <Card>
            <CardHeader titre="État vide" />
            <CardBody>
              <EmptyState
                titre="Aucun dossier en attente"
                description="Les dossiers dont la visite est réalisée apparaîtront ici pour classement."
                action={<Button variante="secondaire">Créer un dossier</Button>}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader titre="Chargement (skeleton)" />
            <CardBody className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <SkeletonTexte />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader titre="Table dense" />
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Adresse</Th>
                <Th>Statut</Th>
                <Th className="text-right">Taux</Th>
                <Th className="text-right">Visites</Th>
              </tr>
            </thead>
            <tbody>
              <Tr>
                <Td className="font-medium text-neutral-900">M. Martin</Td>
                <Td>12 rue des Lilas, Vitry-sur-Seine</Td>
                <Td>
                  <StatutDossierBadge statut="EN_ATTENTE_HUMIDITE" />
                </Td>
                <Td className="text-right text-red-700 tabular-nums">32,4 %</Td>
                <Td className="text-right tabular-nums">2</Td>
              </Tr>
              <Tr>
                <Td className="font-medium text-neutral-900">Mme Diallo</Td>
                <Td>3 allée Verte, Créteil</Td>
                <Td>
                  <StatutDossierBadge statut="PRET_POUR_TRAVAUX" />
                </Td>
                <Td className="text-right tabular-nums">18,0 %</Td>
                <Td className="text-right tabular-nums">1</Td>
              </Tr>
              <Tr>
                <Td className="font-medium text-neutral-900">M. Costa</Td>
                <Td>8 impasse du Moulin, Alfortville</Td>
                <Td>
                  <StatutDossierBadge statut="PLANIFIE" />
                </Td>
                <Td className="text-right text-neutral-400">—</Td>
                <Td className="text-right tabular-nums">1</Td>
              </Tr>
            </tbody>
          </Table>
        </Card>
      </Section>

      {/* ── Logo : options de modernisation ──────────────────────────── */}
      <Section
        titre="Logo — options de modernisation"
        description="Trois exécutions SVG, turquoise et gris conservés. L'application n'attend pas ce choix : la proposition A est utilisée par défaut."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader
              titre="A — Continuité"
              action={<Badge ton="primaire">Recommandée</Badge>}
            />
            <CardBody className="space-y-5">
              <div className="flex items-center justify-center gap-4 py-6">
                <Marque className="h-16 w-auto" />
                <div className="flex flex-col leading-tight">
                  <span className="font-display text-2xl font-bold tracking-wide text-primary-700">
                    ISOBAT
                  </span>
                  <span className="text-xs text-neutral-500">
                    Suivi de chantier
                  </span>
                </div>
              </div>
              <p className="text-xs text-neutral-500">
                La marque actuelle, vectorisée à l&apos;identique + wordmark
                Ubuntu Bold. Zéro rupture avec l&apos;existant (site vitrine,
                documents).
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader titre="B — Chevron épuré" />
            <CardBody className="space-y-5">
              <div className="flex items-center justify-center gap-4 py-6">
                <MarqueEpuree className="h-16 w-auto" />
                <span className="font-display text-2xl font-bold tracking-widest text-primary-700">
                  ISOBAT
                </span>
              </div>
              <div className="flex items-center justify-center gap-3">
                <MarqueEpuree className="h-8 w-auto" />
                <MarqueEpuree className="h-5 w-auto" />
                <MarqueEpuree className="h-3.5 w-auto" />
              </div>
              <p className="text-xs text-neutral-500">
                Les deux faces extérieures seules : lisible aux très petites
                tailles (favicon, en-têtes denses). La porte disparaît.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader titre="C — L'A-chevron" />
            <CardBody className="space-y-5">
              <div className="flex items-center justify-center py-6">
                <span className="flex items-baseline font-display text-3xl font-bold tracking-wide text-primary-700">
                  ISOB
                  <Marque className="mx-0.5 h-[1.6rem] w-auto self-center" />T
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Le wordmark devient la marque : la maison isométrique remplace
                le A. Expressif — plutôt pour les supports de communication que
                pour l&apos;UI.
              </p>
            </CardBody>
          </Card>
        </div>
      </Section>
    </div>
  );
}
