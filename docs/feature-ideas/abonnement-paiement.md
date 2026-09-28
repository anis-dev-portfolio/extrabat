# Abonnement & paiement mensuel (facturation du SaaS)

Statut : **document de conception rédigé le 2026-07-05, avant l'implémentation.**
Le code livré : `lib/abonnement.ts`, `lib/abonnement-stripe.ts`,
`app/api/stripe/webhook/route.ts`, `app/app/parametres/abonnement/`. Écart
depuis ce document : les événements d'échéance ne sont plus appliqués d'après
leur type mais d'après l'abonnement relu chez Stripe (voir « Webhooks »).

## Problème

ExtraBat est un SaaS multi-tenant facturé au client (premier tenant : ISO-BAT),
mais aujourd'hui rien ne matérialise cette relation commerciale dans le
produit :

- **Pas de paiement automatique** : l'abonnement mensuel doit se régler tout
  seul chaque mois, sans relance manuelle d'Anis ni virement à penser côté
  client.
- **Pas de canal de contact** : le client n'a nulle part dans l'app un moyen
  évident de joindre Anis (demandes de modification d'ExtraBat, questions sur
  l'abonnement, problème de paiement).
- **Pas de conséquence à l'impayé** : si un mois n'est pas payé, l'accès doit
  se couper proprement — **les données restent intégralement présentes**, mais
  plus aucune création possible (nouveaux dossiers, planification, etc.).
  Le paiement réactive tout, à l'identique.

## Constat sur l'existant (ce qui rend la feature peu coûteuse)

- **Le tenant est déjà la bonne maille.** L'abonnement est une propriété de
  l'`Organisation` ([schema.prisma:35](../../prisma/schema.prisma#L35)), pas de
  l'utilisateur. Un seul abonnement couvre tous les comptes de l'org.
- **Le statut d'abonnement sera "gratuit" à lire partout.**
  `getCurrentUser()` ([lib/auth.ts:28](../../lib/auth.ts#L28)) charge déjà
  `organisation` avec `include` et est enveloppé dans `cache()` — ajouter des
  champs d'abonnement sur `Organisation` les rend disponibles sur **chaque
  requête sans aucune query supplémentaire**. Les guards
  `requireUser`/`requireRole` sont le point d'insertion naturel.
- **Toute mutation est une Server Action avec guard** (invariant du projet) :
  la coupure "lecture seule" a donc un point d'application systématique — le
  guard de chaque action — plutôt qu'un filet côté UI facile à contourner.
- **Le hub Paramètres** ([page.tsx](../../app/app/parametres/page.tsx)) est
  déjà une liste de sections filtrées par rôle : ajouter une section
  « Abonnement » (ADMIN uniquement) est mécanique.

## Choix du prestataire de paiement

**Recommandation : Stripe Billing** (abonnements récurrents). Raisons :

- **Stripe Checkout** (page de paiement hébergée) + **Customer Portal**
  (portail client hébergé : changer de carte, voir/télécharger les factures,
  historique) = quasiment **zéro UI de facturation à construire**. On ne
  stocke jamais un numéro de carte (PCI-DSS entièrement chez Stripe).
- **Smart Retries + relances (dunning)** intégrés : Stripe retente les
  paiements échoués et envoie lui-même les emails de relance. Pas de système
  de relance à coder (cohérent avec la feature parquée « relances/alertes
  automatiques » — ici c'est Stripe qui relance, pas nous).
- Factures PDF conformes générées par Stripe (mentions TVA configurables).
- **Moyens de paiement France** : carte bancaire d'abord (v1) ; le
  **prélèvement SEPA** (très courant en B2B français, frais moindres) est
  activable plus tard dans le même Stripe — mais attention, un échec SEPA
  peut mettre **jusqu'à 14 jours** à être notifié, ce qui interagit avec le
  délai de grâce (voir plus bas).

Alternatives écartées :

- **GoCardless** (spécialiste SEPA) : très bien pour du prélèvement pur, mais
  pas de portail client équivalent, et moins bon si on veut aussi la carte.
- **Paddle / Lemon Squeezy** (merchant of record) : ils portent la TVA et la
  facturation à notre place, mais commission plus élevée et facturation B2B
  française moins naturelle. Pertinent seulement si l'éditeur n'a pas de
  structure permettant d'ouvrir un compte Stripe.

**Prérequis non technique** : un compte Stripe exige une structure juridique
avec SIRET et un compte bancaire associé.

## Modèle de données

Champs ajoutés sur `Organisation` (pas de nouvelle table pour la v1 — un seul
abonnement par org, relation 1-1 stricte) :

```prisma
enum StatutAbonnement {
  EXONERE    // pas de facturation Stripe (démo, arrangement manuel, dev)
  ACTIF      // abonnement en cours, payé
  IMPAYE     // échec de paiement, délai de grâce en cours — accès complet + bandeau
  SUSPENDU   // grâce expirée — lecture seule
  RESILIE    // abonnement annulé volontairement — lecture seule
}

model Organisation {
  // ... existant ...
  statutAbonnement     StatutAbonnement @default(EXONERE)
  stripeCustomerId     String?          @unique
  stripeSubscriptionId String?          @unique
  impayeDepuis         DateTime?  // 1er échec de paiement (départ du délai de grâce)
  suspenduLe           DateTime?  // passage effectif en lecture seule
}
```

Points de design :

- **La source de vérité est Stripe**, la base locale n'est qu'un **miroir**
  mis à jour par webhooks. On ne fait **jamais** d'appel API Stripe sur le
  chemin d'une navigation (latence) — on lit le miroir local, déjà chargé par
  `getCurrentUser()`.
- **`EXONERE` est le défaut** : indispensable pour le dev local, le seed, et
  pour un client tant que sa facturation n'est pas activée. Une org
  `EXONERE` a un accès complet et ne voit aucune UI de facturation « à payer »
  (juste la fiche contact).
- Même philosophie que `Visite.numero` : **le statut n'est jamais saisi par un
  utilisateur**, il est dérivé des événements Stripe (+ un basculement
  `EXONERE` ↔ facturé réservé à un script/admin plateforme, pas à l'UI tenant).

## Machine à états

```
EXONERE ──(souscription via Checkout)──► ACTIF
ACTIF ──(invoice.payment_failed)──► IMPAYE          → bandeau, accès complet
IMPAYE ──(invoice.paid)──► ACTIF                    → tout redevient normal
IMPAYE ──(grâce écoulée, ~10 j)──► SUSPENDU         → lecture seule
SUSPENDU ──(invoice.paid)──► ACTIF                  → réactivation immédiate
ACTIF|IMPAYE|SUSPENDU ──(subscription.deleted)──► RESILIE → lecture seule
RESILIE ──(nouveau Checkout)──► ACTIF
```

- **Délai de grâce** : ne pas couper au premier échec (carte expirée = cas
  ultra-courant, pas de la mauvaise volonté). Proposition : `IMPAYE` pendant
  ~10 jours (le temps des Smart Retries de Stripe), avec bandeau explicite,
  puis `SUSPENDU`. Le passage IMPAYE→SUSPENDU peut être **paresseux** (calculé
  à la lecture : `impayeDepuis + GRACE_JOURS < now`) plutôt que par cron —
  zéro infra, même pattern que `doitEtreReplanifie()` dans
  [lib/metier.ts](../../lib/metier.ts).
- La suspension ne **résilie pas** l'abonnement Stripe : configurer Stripe
  pour laisser la subscription en `past_due`/`unpaid` (pas d'annulation auto),
  pour que le paiement de la facture en retard réactive tout sans re-souscrire.

## Coupure d'accès : « lecture seule », précisément

Principe : **on ne prend jamais les données en otage**. Tout reste lisible,
rien n'est supprimé. On coupe la **valeur d'usage** (créer, planifier, saisir).

### Ce qui reste possible en SUSPENDU / RESILIE

- Se connecter, naviguer, **tout consulter** : kanban, dossiers, visites,
  planning, chantiers, photos.
- **La page Abonnement et le paiement** — la seule mutation jamais bloquée,
  sinon le client ne peut pas se réactiver lui-même.
- Changer son mot de passe (sécurité du compte ≠ abonnement).

### Ce qui est bloqué

Toute mutation métier : créer un dossier, planifier/annuler une visite,
envoyer un compte-rendu, classer un dossier, uploader une photo, gérer
utilisateurs/ouvriers/absences, modifier l'organisation.

### Mécanisme d'application (le point architectural clé)

- Un guard central `requireAbonnementActif(user)` dans `lib/auth.ts` (ou
  `lib/abonnement.ts`), appelé **au début de chaque Server Action de
  mutation**, à côté du `requireRole` existant. C'est indispensable : un guard
  de layout/page ne protège **pas** les Server Actions (ce sont des POST
  indépendants du rendu) — même logique que l'invariant « gating dans les
  guards, pas seulement dans l'UI ».
- Pour éviter d'oublier une action : introduire un unique helper composé, ex.
  `requireRoleActif([...roles])` = `requireRole` + check abonnement, et
  migrer les actions de mutation dessus. Les pages en lecture gardent
  `requireRole` nu. La convention est alors binaire : *action qui écrit →
  variante « Actif »*.
- Comme `organisation` est déjà incluse dans `CurrentUser`, ce check est un
  simple `if` en mémoire — **aucun coût**.
- Côté UI (confort, pas sécurité) : bandeau persistant dans le shell `/app` +
  boutons de création désactivés + les actions bloquées renvoient une
  `ActionState.error` claire (« Abonnement suspendu — régularisez le paiement
  pour continuer ») au lieu d'échouer silencieusement.

### Messages par rôle (détail UX important)

- **ADMIN** : bandeau orange (IMPAYE) « Échec du paiement le {date} — mettez à
  jour votre moyen de paiement avant le {date+grâce} » → lien direct
  Paramètres → Abonnement. Bandeau rouge (SUSPENDU) avec le même lien + le
  téléphone d'Anis.
- **ASSISTANTE / CONDUCTEUR** : ils ne peuvent rien payer — message neutre
  « Compte suspendu — contactez votre administrateur ». Ne pas afficher les
  détails de facturation à des rôles qui n'y ont pas accès.

### Cas limite assumé

Un conducteur sur le terrain avec une visite déjà planifiée pendant une
suspension ne peut pas envoyer son compte-rendu (c'est une mutation). C'est
voulu — une exception « les visites déjà planifiées restent saisissables »
créerait une zone grise exploitable et complexifie le guard. Le délai de
grâce de ~10 jours avec bandeau très visible rend ce scénario marginal.

## Page Paramètres → Abonnement (ADMIN uniquement)

Nouvelle section du hub ([page.tsx](../../app/app/parametres/page.tsx)),
icône `CreditCard`, deux cartes côte à côte (grille existante) :

**Carte 1 — Abonnement**
- Badge de statut (Actif / Impayé / Suspendu / — pour Exonéré).
- Formule + prix mensuel, date du prochain prélèvement, moyen de paiement
  (marque + 4 derniers chiffres — miroir local ou lecture Stripe côté serveur
  sur cette page uniquement).
- Pas encore abonné → bouton **« Mettre en place le paiement »** → session
  Stripe **Checkout** (mode subscription).
- Abonné → bouton **« Gérer le paiement et les factures »** → session Stripe
  **Customer Portal** (changer de carte, télécharger les factures, historique).
  Les deux sessions se créent dans une Server Action (secret côté serveur,
  URLs à usage unique) puis `redirect()` — hors `try/catch`, comme le veut la
  convention du projet.

**Carte 2 — Fiche contact (la demande explicite d'Anis)**
- « Une question, une demande de modification d'ExtraBat, un souci de
  paiement ? » — nom, **téléphone en lien `tel:` (clic = appel, précieux sur
  la PWA mobile)**, éventuellement email en `mailto:`.
- Coordonnées **codées en dur dans une constante** (`lib/support.ts`) : c'est
  le contact de l'éditeur, identique pour tous les tenants — pas une donnée
  tenant, donc pas en base, et pas un secret non plus.
- La même fiche est réutilisée sur l'écran/bandeau de suspension (« un
  problème ? appelez-moi ») — au moment où le client est le plus susceptible
  d'avoir besoin de parler à un humain.

## Webhooks Stripe (la plomberie critique)

- Route Handler `app/api/stripe/webhook/route.ts` — **hors** de `/app`, pas de
  session utilisateur, authentifié par **vérification de signature**
  (`STRIPE_WEBHOOK_SECRET`). Cohérent avec la leçon PWA du projet : pour tout
  ce qui doit survivre aux contextes sans session/deploy, Route Handler.
- Événements écoutés (le strict minimum) :
  - `checkout.session.completed` → lier `stripeCustomerId`/`subscriptionId` à
    l'org (passée en `client_reference_id`/metadata), statut `ACTIF`.
  - `invoice.paid` / `invoice.payment_failed` → **relire l'abonnement chez
    Stripe** et appliquer son statut réel (`active` → `ACTIF`, `past_due` →
    `IMPAYE` + `impayeDepuis` si pas déjà posé). *Ajouté après ce document :*
    appliquer le type d'événement tel quel laissait un vieux `payment_failed`
    livré en retard repasser en `IMPAYE` une org à jour.
  - `customer.subscription.deleted` → `RESILIE` (état terminal).
- **Idempotence** : Stripe peut livrer un événement plusieurs fois et dans le
  désordre. Table `StripeEventTraite(id)` (insert + skip si existant) et
  transitions écrites pour être rejouables sans effet de bord.
- **Filet de réconciliation** : à l'ouverture de la page Abonnement par un
  ADMIN, re-synchroniser le statut depuis l'API Stripe (un endroit, basse
  fréquence). Couvre le webhook perdu sans cron.
- Env : `STRIPE_SECRET_KEY` (serveur uniquement — même règle que
  `SUPABASE_SERVICE_ROLE_KEY`), `STRIPE_WEBHOOK_SECRET`, IDs de prix. Mode
  test Stripe en dev (`stripe listen` pour les webhooks locaux), mode live en
  prod — deux jeux de clés.

## Tarification (v1 volontairement minimale)

- **Un seul plan, prix fixe mensuel par organisation**, défini dans Stripe
  (jamais dans le code — changer le prix ne doit pas demander un deploy).
- Pas de plans multiples, pas de tarif par utilisateur, pas d'essai gratuit
  géré dans l'app pour la v1 (un futur tenant peut être laissé `EXONERE`
  quelques semaines — c'est déjà un essai gratuit gratuit à implémenter).

## Découpage en briques (pour le futur développement)

1. **Fondations données** : enum + champs sur `Organisation`, migration,
   `EXONERE` par défaut (aucun impact sur l'existant), constantes
   `lib/abonnement.ts` (grâce, dérivation paresseuse du statut effectif) +
   `lib/support.ts` (fiche contact).
2. **Fiche contact** : section Paramètres → « Abonnement & contact » avec la
   carte contact seule. *Livrable indépendant : de la valeur avant même que
   Stripe existe.*
3. **Souscription** : compte Stripe, produit/prix, Checkout + webhook handler
   + miroir de statut.
4. **Portail & page complète** : Customer Portal, carte abonnement (statut,
   prochain prélèvement, factures), réconciliation à l'ouverture.
5. **Coupure** : `requireRoleActif`, migration des actions de mutation,
   bandeau shell, messages par rôle, écran de suspension.
6. *(Plus tard)* : prélèvement SEPA, onboarding self-service de nouveaux
   tenants (aujourd'hui la création d'une org reste manuelle — hors scope).

Chaque brique est shippable seule ; l'ordre 2 → 3 → 5 met la coupure en
dernier, quand la boucle de paiement est fiable (couper l'accès sur un miroir
de statut buggé serait la pire panne possible du produit).
