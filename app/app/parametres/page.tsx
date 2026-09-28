import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  CalendarRange,
  ChevronRight,
  Eye,
  HardHat,
  KeyRound,
  ReceiptText,
  SlidersHorizontal,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import {
  STATUT_ABONNEMENT_LABELS,
  statutAbonnementEffectif,
} from "@/lib/abonnement";
import { VersionBuild } from "@/components/version-build";
import { Badge, type BadgeTon } from "@/components/ui/badge";
import type { Role, StatutAbonnement } from "@/lib/generated/prisma/enums";

// Hub Paramètres : les sous-pages, RANGÉES par thème et filtrées par rôle. Les
// guards de chaque sous-page (et de leurs actions) restent la source de vérité
// — ce hub ne fait que refléter le rôle.
type Section = {
  href: string;
  titre: string;
  description: string;
  Icone: LucideIcon;
  roles: readonly Role[];
};

type Groupe = {
  titre: string;
  description: string;
  sections: readonly Section[];
};

const GROUPES: readonly Groupe[] = [
  {
    titre: "Organisation",
    description: "Votre entreprise et l'équipe qui accède à ExtraBat.",
    sections: [
      {
        href: "/app/parametres/organisation",
        titre: "Identité & coordonnées",
        description:
          "Nom, adresse, SIRET, logo et contacts imprimés sur le compte-rendu.",
        Icone: Building2,
        roles: ["ASSISTANTE", "ADMIN"],
      },
      {
        href: "/app/parametres/utilisateurs",
        titre: "Utilisateurs",
        description: "Comptes de l'équipe et emails autorisés à se connecter.",
        Icone: Users,
        roles: ["ADMIN"],
      },
      {
        href: "/app/parametres/mot-de-passe",
        titre: "Mot de passe",
        description: "Changer le mot de passe de votre compte.",
        Icone: KeyRound,
        roles: ["ADMIN", "ASSISTANTE", "CONDUCTEUR", "OUVRIER"],
      },
    ],
  },
  {
    titre: "Planification & terrain",
    description: "Les réglages qui pilotent le planning et les visites.",
    sections: [
      {
        href: "/app/parametres/visites",
        titre: "Visites",
        description: "Durée par défaut et plage horaire d'ouverture du planning.",
        Icone: Timer,
        roles: ["ASSISTANTE", "ADMIN"],
      },
      {
        href: "/app/parametres/disponibilites",
        titre: "Disponibilités & absences",
        description: "Horaires récurrents et absences des conducteurs.",
        Icone: CalendarRange,
        roles: ["ASSISTANTE", "ADMIN"],
      },
      {
        href: "/app/parametres/ouvriers",
        titre: "Ouvriers",
        description:
          "Équipe terrain des chantiers, leurs absences et leur accès à l'application.",
        Icone: HardHat,
        roles: ["ASSISTANTE", "ADMIN"],
      },
    ],
  },
  {
    titre: "Personnalisation",
    description: "Adaptez ExtraBat à votre façon de travailler.",
    sections: [
      {
        href: "/app/parametres/regles",
        titre: "Règles de classement",
        description:
          "Seuil d'humidité et délai de séchage qui déclenchent les contre-visites.",
        Icone: SlidersHorizontal,
        roles: ["ASSISTANTE", "ADMIN"],
      },
      {
        href: "/app/parametres/affichage",
        titre: "Préférences d'affichage",
        description: "Vue et tri par défaut de la page Dossiers.",
        Icone: Eye,
        roles: ["ASSISTANTE", "ADMIN"],
      },
    ],
  },
];

const TON_STATUT: Record<StatutAbonnement, BadgeTon> = {
  EXONERE: "neutre",
  ACTIF: "vert",
  IMPAYE: "ambre",
  SUSPENDU: "rouge",
  RESILIE: "rouge",
};

// Une ligne de résumé lisible selon le statut effectif — l'ADMIN sait d'un
// coup d'œil si tout va bien sans ouvrir la page dédiée.
const RESUME_STATUT: Record<StatutAbonnement, string> = {
  EXONERE: "Compte non facturé pour le moment.",
  ACTIF: "Abonnement actif — tout est en ordre.",
  IMPAYE: "Paiement en échec — régularisez avant la coupure.",
  SUSPENDU: "Accès en lecture seule suite à un impayé.",
  RESILIE: "Abonnement résilié — accès en lecture seule.",
};

// Carte d'état d'abonnement affichée en tête du hub (ADMIN + ASSISTANTE, qui
// gèrent l'abonnement). Statut EFFECTIF lu EN MÉMOIRE sur user.organisation
// (déjà chargée) : aucune requête, aucun appel Stripe — la page Abonnement fait
// la réconciliation détaillée.
function CarteAbonnement({
  effectif,
  nomOrganisation,
}: {
  effectif: StatutAbonnement;
  nomOrganisation: string;
}) {
  return (
    <Link
      href="/app/parametres/abonnement"
      className="group flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-xs transition-colors hover:border-primary-300 hover:bg-primary-50/40"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
        <ReceiptText className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-neutral-900">
            Abonnement ExtraBat
          </span>
          <Badge ton={TON_STATUT[effectif]}>
            {effectif === "EXONERE" ? "Non facturé" : STATUT_ABONNEMENT_LABELS[effectif]}
          </Badge>
        </span>
        <span className="mt-0.5 block text-sm text-neutral-500">
          {nomOrganisation} · {RESUME_STATUT[effectif]}
        </span>
      </span>
      <span className="hidden shrink-0 items-center gap-1 text-sm font-medium text-primary-700 sm:flex">
        Gérer
        <ChevronRight
          className="size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}

function CarteSection({ href, titre, description, Icone }: Section) {
  return (
    <Link
      href={href}
      className="group flex h-full items-start gap-3.5 rounded-lg border border-neutral-200 bg-white p-4 shadow-xs transition-colors hover:border-primary-300 hover:bg-primary-50/40"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
        <Icone className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 font-medium text-neutral-900">
          {titre}
          <ChevronRight
            className="size-4 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-600"
            aria-hidden="true"
          />
        </span>
        <span className="mt-0.5 block text-sm text-neutral-500">
          {description}
        </span>
      </span>
    </Link>
  );
}

export const metadata: Metadata = { title: "Paramètres" };

export default async function ParametresPage() {
  const user = await requireUser();

  // Ne garder que les groupes qui ont au moins une section accessible au rôle.
  const groupes = GROUPES.map((g) => ({
    ...g,
    sections: g.sections.filter((s) => s.roles.includes(user.role)),
  })).filter((g) => g.sections.length > 0);

  const gereAbonnement = user.role === "ADMIN" || user.role === "ASSISTANTE";
  const effectif = statutAbonnementEffectif(user.organisation);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Paramètres</h1>
        <p className="text-sm text-neutral-500">
          {user.organisation.nom} · {user.email}
        </p>
      </div>

      {gereAbonnement && (
        <CarteAbonnement
          effectif={effectif}
          nomOrganisation={user.organisation.nom}
        />
      )}

      {groupes.map((groupe) => (
        <section key={groupe.titre} className="space-y-3">
          <div>
            <h2 className="font-display text-sm font-semibold tracking-wide text-neutral-800 uppercase">
              {groupe.titre}
            </h2>
            <p className="text-sm text-neutral-500">{groupe.description}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {groupe.sections.map((section) => (
              <li key={section.href}>
                <CarteSection {...section} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* Version du bundle client : sert à vérifier ce qui tourne vraiment
          sur un téléphone (PWA), notamment après un déploiement. */}
      <VersionBuild className="text-center" />
    </div>
  );
}
