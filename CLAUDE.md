# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ExtraBat — SaaS **multi-tenant** de suivi de chantier BTP (sinistres humidité).
Domaine et UI en **français**. Next.js 15 (App Router) + TS + Tailwind v4,
Supabase (Postgres/Auth/Storage), Prisma 7. Premier tenant : ISO-BAT.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de dev (localhost:3000) |
| `npm run build` | `prisma generate` + `next build` — **le vrai garde-fou** (type-check + lint + frontière client/serveur). À lancer avant de considérer une tâche finie. |
| `npm run lint` | ESLint seul |
| `npm run db:migrate:dev -- --name <nom>` | Crée + applique une migration en dev, régénère le client |
| `npm run db:migrate` | Applique les migrations (prod/CI) |
| `npm run db:seed` | Seed **idempotent** : org ISO-BAT + admin + comptes démo (assistante/conducteur) |

Pas de suite de tests pour l'instant. Setup projet, variables d'env et
déploiement Vercel : voir `README.md`.

## Invariants non négociables

- **Multi-tenant** : TOUTE requête Prisma sur des données tenant est scopée par
  `organisationId` obtenu via `getCurrentUser()`. Jamais de requête non scopée.
  Vérifie aussi l'appartenance à l'org des entités liées (ex. le conducteur
  assigné à une visite).
- **Accès par rôle** : gating dans les guards, pas seulement dans l'UI.
  Back-office (kanban dossiers) = `ASSISTANTE` + `ADMIN` ; `CONDUCTEUR` = ses
  visites uniquement ; `OUVRIER` = ses chantiers affectés uniquement (et
  jamais aucune donnée financière du dossier).
- **Abonnement (lecture seule)** : toute Server Action de MUTATION ouvre par
  `requireRoleActif([...])` (rôle + abonnement non suspendu/résilié) et renvoie
  `garde.error` dans son ActionState si `!garde.ok` ; les pages/lectures gardent
  `requireRole` nu. Routes d'ingestion conducteur : coupure dans
  `garderConducteur` (403). Jamais bloqués : paiement de l'abonnement
  (`parametres/abonnement/actions.ts`), mot de passe, logout, marquage lu des
  notifications (`notifications/actions.ts` — accuser réception n'est pas une
  mutation métier). Détail :
  `lib/abonnement.ts` (statut effectif dérivé paresseusement, grâce 10 j) et
  `lib/abonnement-stripe.ts` (miroir Stripe par webhooks + réconciliation).
- **RLS Supabase** : toutes les tables vivent dans `public`, exposé par la
  Data API à la clé `anon` (publique). L'app ne passe jamais par la Data API
  (Prisma pour les données) : chaque table a `ENABLE ROW LEVEL SECURITY` sans
  policy (migration `20260928113000_activer_rls`). Toute NOUVELLE table reçoit
  la même ligne dans sa migration de création.
- **Secrets** : jamais en dur — demander les valeurs à l'utilisateur.
  `SUPABASE_SERVICE_ROLE_KEY` est **serveur uniquement**, jamais exposé au navigateur.
- **Petits commits clairs.**
- **Features parquées — NE PAS construire** : PDF téléchargeable (lib de
  GÉNÉRATION — l'impression navigateur suffit), humidité par pièce,
  relances/alertes automatiques, drag&drop du kanban, suivi des
  dépenses/factures d'achats avec analyse IA et marge nette par chantier
  (évaluée 2026-07, écartée : fardeau > valeur — le CA de `/app/finances`
  suffit, la marge reste hors ExtraBat).
- **Signature électronique (dé-parquée 2026-07-17, décision d'Anis)** :
  périmètre = tamponnage d'une signature (image PNG) dans un PDF **existant**
  via `pdf-lib`, côté serveur uniquement (Route Handler
  `/api/documents-a-signer/[id]/signer`). SES au sens eIDAS : horodatage
  serveur + hash SHA-256 original/signé + journal — l'original n'est jamais
  supprimé. La **génération** de documents PDF reste parquée (voir ci-dessus).
  Modèle `DocumentASigner`, flux : docs/feature-ideas/comptes-ouvriers.md.
- **Comptes ouvriers (livré 2026-07-17)** : rôle `OUVRIER` = utilisateur
  terrain lié à sa fiche `Ouvrier` (`Ouvrier.userId`, liaison posée au
  provisioning via `MembreAutorise.ouvrierId` — accès créé DEPUIS
  Paramètres → Ouvriers, jamais depuis la page Utilisateurs). Espace mobile
  `/app/mes-chantiers` + `/app/mon-planning` (guard `requireOuvrier` : rôle +
  fiche liée `actif`). **Frontière financière** : `montantDevis` / `franchise`
  / `refDevis` / `payeLe` ne transitent JAMAIS vers un client ouvrier —
  selects minimaux explicites. Vérification d'**affectation** au chantier
  (jamais « l'ouvrier de l'org ») sur chaque lecture/mutation ouvrier.
- **Statistiques (livré)** : page de pilotage back-office `/app/statistiques`
  (`lib/statistiques.ts` purs + `lib/statistiques-data.ts` scopé org + graphes
  SVG/CSS maison). Indicateurs « À ce jour » (snapshot) vs « Sur la période »
  (flux, sélecteur `?periode=`). Zéro métrique dérivée du journal
  `EvenementDossier` (incomplet pour les vieux dossiers) : uniquement des
  colonnes fiables. Le CA reste dans `/app/finances` (listes de faits), les
  tendances/graphes vivent ici.

## Architecture (vue d'ensemble)

### Auth ↔ tenant (`lib/auth.ts`)
- `getCurrentUser()` fait le pont session Supabase ↔ ligne `User` en base.
  **`User.id` = `auth.users.id`** (même uuid). Enveloppé dans `cache()` React
  (dédup par requête). À la 1ʳᵉ connexion, provisionne l'utilisateur en
  `CONDUCTEUR` rattaché à ISO-BAT (phase mono-tenant).
- `requireUser()` / `requireRole([...])` = guards de page/action.
  `app/app/layout.tsx` garde tout le sous-arbre `/app` ; `app/app/page.tsx` est
  un hub qui redirige selon le rôle (back-office → `/app/dossiers`, conducteur →
  `/app/mes-visites`, ouvrier → `/app/mes-chantiers`). `requireRole` renvoie
  vers `/app` (donc pas de boucle). `requireOuvrier()` exige en plus la fiche
  `Ouvrier` liée active (sinon déconnexion via `/auth/refus`).

### Prisma 7
- Client généré dans `lib/generated/prisma/` — **git-ignored**, régénéré par
  `postinstall`/`build`. Après toute édition du schéma : régénérer. Importer les
  types depuis `.../client`, les enums (valeur **et** type) depuis `.../enums`.
- Runtime : `DATABASE_URL` (pooled pgbouncer) via l'adapter `pg` (`lib/prisma.ts`).
  CLI/migrations/seed : `DIRECT_URL` (port 5432), déclaré dans
  `prisma.config.ts` (pas dans `schema.prisma` en Prisma 7).
- `prisma migrate dev` fonctionne directement contre `DIRECT_URL` (migrations
  additives, sans reset).

### Supabase (`lib/supabase/`)
- `server.ts` (Server Components / actions / route handlers), `client.ts`
  (navigateur), `middleware.ts` (refresh de session sur chaque requête).
  Règle : dans le middleware, ne rien exécuter entre `createServerClient` et
  `getUser()`.

### Mutations & formulaires
- Toute mutation = **Server Action** (`"use server"`), avec guard + scoping org
  **dans l'action**. Les transitions multi-étapes (numérotation, changement de
  statut) passent par `prisma.$transaction`.
- Formulaires multi-champs : page serveur (guard + fetch) qui rend un composant
  client `"use client"` utilisant `useActionState` ; convention d'état
  `ActionState = { error: string | null }`. Les mutations « 1 clic » sont des
  `<form action={serverAction}>` inline dans des composants serveur.
- `redirect()` est appelé **hors** de tout `try/catch` (il lève en interne).

## Domaine métier

- **Cycle de vie du Dossier** (transitions = actions explicites, pas de drag&drop) :
  `NOUVEAU → PLANIFIE → REALISE → (EN_ATTENTE_HUMIDITE | PRET_POUR_TRAVAUX)`,
  et `EN_ATTENTE_HUMIDITE → PLANIFIE` (contre-visite).
- **`Visite.numero`** = (nb de visites du dossier) + 1, calculé en transaction,
  unique par dossier (`@@unique([dossierId, numero])`), **100 % automatique**
  (aucune saisie utilisateur ; collision P2002 → retry de la transaction). Le
  libellé (« Première visite d'expert », « Nᵉ contre-visite… ») est **dérivé**
  par `visiteLabel()` — jamais stocké.
- **`dateRealisee`** : jamais saisie par un utilisateur ; horodatée côté serveur
  à l'envoi du compte-rendu.
- **Classement auto-suggéré** : taux d'humidité `> SEUIL_HUMIDITE` (25) →
  `EN_ATTENTE_HUMIDITE`, sinon `PRET_POUR_TRAVAUX` ; l'assistante confirme.
  Helpers dans `lib/metier.ts` (`visiteLabel`, `suggestStatutApresVisite`,
  labels/ordre des statuts).
- **Délai de séchage** : le classement `EN_ATTENTE_HUMIDITE` horodate
  `Dossier.classeHumiditeLe` (nullé si `PRET_POUR_TRAVAUX` ; survit au cycle
  planifier→annuler). Contre-visite conseillée à `classeHumiditeLe +
  DELAI_SECHAGE_JOURS` (30 j, `dateContreVisiteConseillee()`) — **conseil non
  bloquant**. Échéance dépassée sans visite planifiée → badge « À re-planifier »
  (`doitEtreReplanifie()`) + compteur « À traiter » du shell.
- **`Photo`** stocke un `chemin` d'objet du bucket privé Storage (PAS une URL
  publique) ; les URLs signées sont générées côté serveur.

## État des phases

- **Sous-phase A (back-office assistante) : faite.** Schéma métier, kanban,
  création de dossier, planification de visite, saisie de compte-rendu
  back-office, réception + classement + contre-visite.
- **Sous-phase B (vue conducteur mobile-first) : faite** — `/app/mes-visites`,
  saisie terrain `/app/visites/[id]` (PWA, file hors ligne).
- **Sous-phase C (compte-rendu imprimable) : faite** —
  `/app/visites/[id]/compte-rendu`.
- Livrés ensuite : planning, chantiers (Gantt), comptes ouvriers + signature,
  statistiques, finances, abonnement Stripe (voir les invariants ci-dessus).
