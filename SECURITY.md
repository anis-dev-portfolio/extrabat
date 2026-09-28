# Sécurité — ce qui est implémenté, et où

Chaque point renvoie au fichier qui l'implémente. Les limites connues sont en fin de document.

## Authentification et identité

- **Supabase Auth** (email + mot de passe). Le middleware vérifie le JWT à chaque requête (`getClaims()`) et rafraîchit la session : `lib/supabase/middleware.ts:53`.
- **En-têtes d'identité non usurpables** : le middleware **supprime** d'abord les en-têtes d'identité envoyés par le client, puis ne les ré-injecte qu'après vérification du JWT — `lib/supabase/middleware.ts:15-17` et `:56-60`.
- **Inscription fermée** : un compte n'est provisionné à la 1ʳᵉ connexion que si son email figure dans la liste d'autorisation (`MembreAutorise`) ; sinon déconnexion et refus — `lib/auth.ts:41-49`.
- **Mots de passe** : le seed n'écrit aucun mot de passe en dur (tiré au hasard et affiché une fois) — `prisma/seed.ts` ; chaque compte ouvrier reçoit un mot de passe **propre**, tiré par `crypto.randomInt` (≈ 2^59), affiché une seule fois et renouvelable — `lib/ouvrier-acces.ts:20`, `app/app/parametres/ouvriers/actions.ts:278`.

## Autorisation et isolation des données (multi-tenant)

- **Guards côté serveur**, jamais seulement dans l'UI : `requireUser`, `requireRole`, `requireOuvrier`, `requireRoleActif` — `lib/auth.ts:111`, `:119`, `:135`, `:165`. Route Handlers mobiles : `garderConducteur` — `app/api/visites/[id]/garde.ts:9`.
- **Scoping par organisation** : toute requête Prisma sur des données client filtre par `organisationId` issu de la session ; les entités liées sont re-vérifiées (invariant documenté dans `CLAUDE.md`, ex. `app/app/parametres/ouvriers/actions.ts`, `app/app/dossiers/actions.ts`).
- **Frontière financière** : un compte `OUVRIER` ne reçoit jamais `montantDevis` / `franchise` / `refDevis` / `payeLe` (selects minimaux explicites — invariant `CLAUDE.md`) ; accès limité aux chantiers auxquels il est **affecté**.
- **RLS Supabase** : les tables vivent dans `public`, exposé par la Data API de Supabase à la clé publique `anon`. L'app n'utilisant jamais cette API (Prisma pour les données), le RLS est activé **sans policy** sur les 18 tables et `_prisma_migrations` : `anon` / `authenticated` ne voient aucune ligne — `prisma/migrations/20260928113000_activer_rls/migration.sql`. (En production, le RLS était déjà posé par le réglage d'activation automatique du projet Supabase ; la migration l'inscrit dans le code pour toute base neuve.)

## Secrets

- Modules serveur marqués `import "server-only"` : le build échoue si l'un d'eux est importé côté navigateur — `lib/supabase/admin.ts` (clé `service_role`), `lib/stripe.ts`, `lib/abonnement-stripe.ts`, `lib/ouvrier-acces.ts`, `lib/pieces-jointes-storage.ts`, `lib/documents-a-signer-storage.ts`.
- Aucun secret dans le dépôt : `.env*` ignoré, seul `.env.example` (noms de variables, valeurs vides) est versionné — `.gitignore:34-35`.
- Connexion Postgres chiffrée ; vérification du certificat serveur (anti-MITM) quand `SUPABASE_CA_CERT` est fourni — `lib/prisma.ts:15-43`.

## Paiements (Stripe)

- **Webhook authentifié par signature** sur le corps brut (`constructEventAsync`), 503 si non configuré, 400 si signature absente ou invalide — `app/api/stripe/webhook/route.ts:33`.
- **Idempotence** : l'id d'événement est inséré dans la même transaction que la mise à jour du miroir ; une re-livraison heurte la clé primaire et est ignorée — `prisma/schema.prisma:408`, `lib/abonnement-stripe.ts` (`transitionIdempotente`).
- **Ordre de livraison non garanti** : pour les échéances, l'événement n'est qu'un signal ; l'état appliqué est celui de l'abonnement **relu chez Stripe** — `lib/abonnement-stripe.ts:222`. Un abonnement déjà terminé n'est jamais re-lié par un `checkout.session.completed` tardif.
- **Filets** : réconciliation à l'ouverture de la page Abonnement (`lib/abonnement-stripe.ts:471`) ; une URL de succès Checkout rejouée ne force plus rien (`lib/abonnement-stripe.ts:278`).
- **Mode lecture seule** en cas d'impayé après 10 jours de grâce : les mutations métier sont coupées, jamais la consultation ni le paiement — `lib/abonnement.ts`, `requireRoleActif` (`lib/auth.ts:165`).
- Aucune donnée de carte ne transite par l'app (Stripe Checkout + Customer Portal hébergés).

## Fichiers (Supabase Storage)

- **Bucket privé**, jamais d'URL publique : la base stocke un chemin, les URLs sont signées côté serveur à durée limitée — `lib/supabase/admin.ts:52`, `lib/pieces-jointes-storage.ts:22`.
- **Validation des uploads** avant signature d'URL : liste blanche de types MIME et taille max 15 Mo (`lib/pieces-jointes.ts:12`, `:44`), PDF uniquement pour les documents à signer (`lib/documents-a-signer.ts:12-21`), contrôle des octets d'en-tête `%PDF-` (`app/app/dossiers/[id]/documents-a-signer-actions.ts:130`).

## Signature électronique (SES)

- Hash SHA-256 de l'original **re-vérifié** avant tamponnage ; hash du PDF signé et horodatage **serveur** enregistrés — `app/api/documents-a-signer/[id]/signer/route.ts:145-146`, `:231`, `:241`.
- Garde conditionnelle contre la double signature — même fichier, `:238`.
- **Un document signé n'est jamais supprimable**, ni seul (`app/app/dossiers/[id]/documents-a-signer-actions.ts:247`) ni par la suppression de son dossier (`app/app/dossiers/actions.ts:1255`).

## En-têtes HTTP

`X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` sur toutes les routes — `next.config.ts:55-85`.

## Limites connues (honnêtement)

- **Pas de rate limiting applicatif** : seules les limites intégrées de Supabase Auth s'appliquent à la connexion.
- **Pas de tests automatisés ni de CI** : le garde-fou est `npm run build` (typecheck + lint + frontière client/serveur).
- **CSP limitée à `frame-ancestors`** : une CSP complète demanderait des nonces pour les scripts inline de Next.
- Dans cette copie, la migration RLS et les correctifs du 28/09/2026 ont été vérifiés par typecheck, lint et build, **pas exécutés contre une base**.
- Retirer l'accès d'un ouvrier jamais connecté laisse son compte Supabase Auth en place (le ré-inviter avec le même email échoue).
