# Comptes ouvriers : espace terrain + signature électronique (zéro papier)

Statut : **document de conception du 2026-07-17, rédigé avant l'implémentation.**
Le code livré : `app/app/mes-chantiers/`, `app/app/parametres/ouvriers/`,
`app/app/dossiers/[id]/documents-a-signer*.ts(x)`,
`app/api/documents-a-signer/[id]/signer/route.ts`. Écarts depuis ce document :
mot de passe propre à chaque ouvrier (§ 2) et document signé jamais
supprimable (§ 4).

> **⚠️ Dé-parcage requis.** « Signature électronique » figure dans la liste
> **Features parquées — NE PAS construire** de `CLAUDE.md`. Cette idée la
> dé-parque volontairement (décision d'Anis, 2026-07-17). Le jour de
> l'implémentation, la **première étape** est de mettre à jour `CLAUDE.md` :
> retirer « signature électronique » de la liste et documenter le périmètre
> exact retenu (voir § pdf-lib ci-dessous). Sans ça, une session Claude Code
> refusera à raison de construire la feature.

## L'idée en une phrase

Transformer l'ouvrier d'**entité de planification** (fiche papier imprimée)
en **utilisateur à part entière** : un compte applicatif avec un espace
mobile dédié — ses chantiers en cours et à venir, son planning Gantt
personnel, les informations dont il a besoin (et **seulement** celles-là :
zéro prix, zéro facture), les notes internes du bureau — et la **signature
électronique des documents de fin de chantier** directement sur son
téléphone, pour supprimer tout papier du flux.

## La démarche concrète (vécu cible)

1. L'assistante, depuis son compte, ajoute sur le dossier/chantier un **PDF à
   faire signer** (la feuille de fin de travaux qu'on fait signer en physique
   aujourd'hui).
2. L'ouvrier, sur son compte, voit ce document sur la fiche de SON chantier.
3. En fin de travaux, il ouvre le PDF sur son téléphone, **zoome/déplace
   librement**, tape à l'endroit voulu pour y placer la signature, tend le
   téléphone au client qui **signe au doigt** (pad de signature), le client
   confirme (nom + « lu et approuvé »).
4. Le PDF signé part **automatiquement** chez l'assistante — déjà signé,
   **non modifiable**, horodaté, tracé au journal du dossier.
5. L'ouvrier marque le chantier **terminé** : boum, tout est envoyé, tout est
   signé, rien de papier — que du numérique.

## Verdict de faisabilité : OUI, et à ~70 % avec des briques existantes

| Besoin | Brique existante | Ce qui manque |
| --- | --- | --- |
| Compte + rôle + provisioning fermé | Allowlist `MembreAutorise` + provisioning 1ʳᵉ connexion ([lib/auth.ts:30-81](../../lib/auth.ts#L30-L81)) | Valeur d'enum `OUVRIER` + liaison compte ↔ fiche `Ouvrier` |
| Contenu de l'écran ouvrier | La fiche papier existe déjà : [app/app/chantiers/fiches/page.tsx](../../app/app/chantiers/fiches/page.tsx) (client, adresse, tél, infos d'accès, période, co-équipiers) | La rendre vivante (pages mobiles au lieu d'imprimés) |
| Vue terrain mobile-first + PWA + ingestion | Tout le vécu conducteur : `/app/mes-visites`, Route Handlers d'upload, garde dédiée ([app/api/visites/[id]/garde.ts](../../app/api/visites/%5Bid%5D/garde.ts)) | Décliner le pattern pour l'ouvrier |
| Planning Gantt | Gantt chantiers assistante ([app/app/chantiers/](../../app/app/chantiers/), [lib/chantiers.ts](../../lib/chantiers.ts)) | Variante lecture seule filtrée sur ses affectations |
| Fournir un PDF | Pièces jointes : bucket privé `sinistres`, PDF ≤ 15 Mo, URLs signées serveur ([lib/pieces-jointes.ts](../../lib/pieces-jointes.ts)) | Un modèle `DocumentASigner` distinct de `PieceJointe` |
| Notes internes bureau → terrain | `NoteDossier` déjà affichée au conducteur sur sa fiche visite (commit ca807bc) | L'afficher aussi sur la fiche chantier ouvrier |
| Notifications | `Notification` in-app par mutation humaine ([prisma/schema.prisma:456-479](../../prisma/schema.prisma#L456-L479)) | Nouveaux types (chantier affecté, document signé…) |
| Signature dans le PDF | — | **La seule vraie brique neuve** : visionneuse PDF + pad + tamponnage serveur (voir § signature) |

## Constat sur l'existant

- `Ouvrier` est aujourd'hui une entité **sans compte** — le commentaire du
  modèle le dit noir sur blanc : *« il ne se connecte jamais, il reçoit une
  fiche imprimée »* ([prisma/schema.prisma:296-313](../../prisma/schema.prisma#L296-L313)).
  Ce choix avait été acté lors de la conception du planning des chantiers,
  avec la réserve explicite : *« à reconfirmer si un jour les ouvriers doivent
  interagir avec l'app »*. **Ce jour est arrivé** — cette idée est la suite
  logique de ce compromis.
- La brique planning est complète et se réutilise telle quelle :
  `AffectationChantier` (N-N ouvrier ↔ chantier), `AbsenceOuvrier`,
  détection de conflits, état dérivé des dates (`A_VENIR / EN_COURS /
  A_CLOTURER / TERMINE`, seul `termineLe` est un fait explicite).
- Le provisioning est **fermé par allowlist** : seul un email présent dans
  `MembreAutorise` est provisionné à la 1ʳᵉ connexion, avec le rôle prévu.
  L'extension au rôle `OUVRIER` est naturelle, MAIS il faut relier le
  nouveau `User` à la bonne fiche `Ouvrier` (voir § liaison).
- Les données financières vivent sur `Dossier` (`montantDevis`, `franchise`,
  `refDevis`, `payeLe` — [prisma/schema.prisma:219-231](../../prisma/schema.prisma#L219-L231)).
  La discipline « selects minimaux » déjà appliquée aux vues conducteur est
  ici une **frontière de confidentialité**, pas juste de la perf : aucun de
  ces champs ne doit JAMAIS transiter vers le client d'un ouvrier.
- Le marquage « terminé » d'un chantier est aujourd'hui une action
  back-office ; le règlement (`payeLe`) en est **découplé** par design — le
  marquage terrain par l'ouvrier ne touche donc à rien de financier.

## Architecture proposée

### 1. Modèle de données (migration additive, aucune rupture)

- `enum Role` : + `OUVRIER`.
- `Ouvrier` : + `userId String? @unique` (relation optionnelle vers `User`).
  Une fiche sans compte reste 100 % valide — les ouvriers « papier »
  continuent d'exister, l'accès app est un **opt-in par ouvrier**.
- `MembreAutorise` : + `ouvrierId String?` — c'est la **liaison** : au
  provisioning de la 1ʳᵉ connexion, si `autorise.ouvrierId` est posé, on
  écrit `Ouvrier.userId = user.id` **dans la même transaction** que le
  `prisma.user.create` de `getCurrentUser()`.
- Nouveau modèle `DocumentASigner` (rattaché au **Dossier**, comme
  `PieceJointe` — le chantier est dérivable, 1 chantier max par dossier) :
  - `nom`, `cheminOriginal` (objet du bucket privé,
    `organisationId/dossiers/dossierId/a-signer/<uuid>.pdf` — PDF
    uniquement, ≤ 15 Mo, mêmes contrôles serveur que les pièces jointes),
  - `cheminSigne String?` (posé à la signature — l'**original est
    conservé**, c'est une preuve),
  - `signeLe DateTime?` (horodaté **serveur**, jamais saisi — même
    philosophie que `dateRealisee`), `signeParUserId String?` (l'ouvrier qui
    a présenté), `nomSignataire String?` (le client, saisi au moment de
    signer),
  - `hashOriginal` / `hashSigne` (SHA-256, valeur probante),
  - `ajouteParId`, `createdAt`. Le statut « à signer / signé » est **dérivé**
    de `signeLe` — aucun statut à cocher qui pourrait mentir.
- Journal ([prisma/schema.prisma:411-433](../../prisma/schema.prisma#L411-L433)) :
  + `DOCUMENT_A_SIGNER_AJOUTE`, `DOCUMENT_SIGNE`,
  `DOCUMENT_A_SIGNER_SUPPRIME`, `CHANTIER_TERMINE_TERRAIN` — écrits dans la
  même transaction que la mutation, comme toujours.
- Notifications : + `CHANTIER_AFFECTE` / `CHANTIER_REPLANIFIE` /
  `CHANTIER_RETIRE` (destinataire : l'ouvrier — miroir exact des
  notifications de visite du conducteur), + `DOCUMENT_A_SIGNER_RECU`
  (ouvriers affectés), + `DOCUMENT_SIGNE_RECU` et `CHANTIER_TERMINE_TERRAIN`
  (destinataires : **chaque** utilisateur back-office de l'org — le modèle
  `Notification` est mono-destinataire, on en crée N dans la transaction).

### 2. Auth, guards, navigation

- Hub `/app` : `OUVRIER` → redirection vers `/app/mes-chantiers` (même
  mécanique que conducteur → `/app/mes-visites` — pas de boucle car
  `requireRole` renvoie vers `/app`).
- Les `requireRole` existants sont des **whitelists explicites** : l'ouvrier
  n'entre nulle part par défaut — sécurité par défaut, rien à durcir côté
  back-office. Passer quand même en revue les pages en `requireUser` nu
  (notifications, mot de passe, hub) : elles doivent rester accessibles à
  l'ouvrier et ne rien fuiter.
- Nouveau guard `requireOuvrier()` : `requireRole(["OUVRIER"])` + charge la
  fiche `Ouvrier` liée (`userId`) et **exige `actif = true`** — la
  désactivation douce existante coupe l'accès immédiatement, sans toucher au
  compte Supabase.
- Mutations ouvrier : `requireRoleActif(["OUVRIER"])` (abonnement lecture
  seule respecté) + vérification d'**affectation** au chantier via
  `AffectationChantier` (jamais « l'ouvrier de l'org », toujours « l'ouvrier
  affecté à CE chantier ») + scoping org — triple verrou systématique.
- Ingestion mobile (signature) : Route Handler avec garde dédiée
  `garderOuvrier` — miroir de `garderConducteur`
  ([app/api/visites/[id]/garde.ts](../../app/api/visites/%5Bid%5D/garde.ts)),
  coupure abonnement en 403 incluse.
- **Création de l'accès depuis `/app/parametres/ouvriers`** (pas depuis
  `/app/parametres/utilisateurs`) : bouton « Donner un accès » sur la fiche
  ouvrier → saisie email → crée le `MembreAutorise(email, OUVRIER,
  ouvrierId)`. Raison : passer par la page utilisateurs générique créerait
  des comptes `OUVRIER` **orphelins** (sans fiche liée) ; en ancrant l'action
  sur la fiche, la liaison est garantie par construction. Ne PAS ajouter
  `OUVRIER` à `ROLES_VALIDES` de
  [parametres/utilisateurs/actions.ts](../../app/app/parametres/utilisateurs/actions.ts).
- *Ajouté après ce document :* le mot de passe est **propre à chaque
  ouvrier**, tiré au hasard côté serveur et affiché une seule fois
  ([lib/ouvrier-acces.ts](../../lib/ouvrier-acces.ts)), avec un bouton
  « Nouveau mot de passe ». Un mot de passe commun à l'équipe laissait
  n'importe qui connaissant l'email d'un collègue entrer dans son compte.

### 3. Espace ouvrier (mobile-first, patterns conducteur)

- `/app/mes-chantiers` : le chantier **en cours** mis en avant (c'est
  l'écran du matin dans le camion), puis les chantiers à venir, puis un
  historique récent replié. Cartes mobiles, boutons `TACTILE_MOBILE`.
- `/app/mes-chantiers/[id]` — la fiche chantier filtrée, **exactement le
  contenu de la fiche papier actuelle** (`FicheOuvrier`) rendu vivant :
  - client, **adresse cliquable** (lien maps), **téléphone cliquable**
    (`tel:`), infos d'accès,
  - période + nombre de jours, co-équipiers (avec leur téléphone),
  - **notes du dossier** (canal bureau → terrain, réutilise l'affichage
    livré pour le conducteur),
  - documents à signer (état : à signer / signé ✓),
  - bouton « Marquer terminé » (voir § flux),
  - **rien d'autre** : select Prisma minimal explicite, zéro champ
    financier, pas de compte-rendu d'expertise ni de photos de visite (le
    détail des travaux vit sur le devis sans prix que l'assistante imprime —
    choix déjà acté sur `Chantier`, « la fiche est logistique »).
- `/app/mon-planning` : Gantt personnel en **lecture seule** — réutiliser
  les composants du Gantt chantiers filtrés sur ses affectations, plus ses
  absences. Vue semaine, navigation avant/arrière.
- Notifications : la page `/app/notifications` existante fonctionne par
  destinataire — elle marche pour l'ouvrier sans modification (seuls les
  nouveaux types sont à rendre dans `lib/notifications.ts`).
- PWA : même manifest/installation que le conducteur — l'app s'épingle sur
  l'écran d'accueil du téléphone de chantier.

### 4. Le flux signature (la brique neuve)

**Côté assistante** — sur la fiche dossier (ou chantier) : « Ajouter un
document à faire signer » : upload PDF avec les mêmes contrôles serveur que
les pièces jointes (MIME `application/pdf` strict, ≤ 15 Mo, nom d'objet
UUID validé par regex, préfixe org/dossier vérifié). Journal
`DOCUMENT_A_SIGNER_AJOUTE` + notification aux ouvriers affectés.

**Côté ouvrier** — sur sa fiche chantier :

1. Ouvre le document : rendu PDF **côté client** avec `pdfjs-dist` en
   `import()` dynamique — même discipline que Leaflet : jamais dans le
   bundle commun, la visionneuse ne pèse que sur cette page.
2. Zoom/pan tactile libre (pinch), navigation entre pages.
3. Tape à l'endroit voulu → un cadre de signature se pose là (déplaçable/
   redimensionnable).
4. Pad de signature plein écran (canvas, tracé au doigt), champ « nom du
   signataire », case « lu et approuvé ».
5. Envoi : **Route Handler** (pattern upload-photo — pas une Server Action :
   FormData + garde dédiée), payload léger : PNG de la signature +
   coordonnées normalisées (page, x, y, largeur) + nom signataire.

**Côté serveur** (Route Handler, runtime Node) :

1. `garderOuvrier` : session + rôle + fiche active + affectation au chantier
   + abonnement.
2. Télécharge le PDF **original** du Storage (client admin), vérifie
   `hashOriginal`.
3. **Tamponne** la signature avec `pdf-lib` : image PNG aux coordonnées
   choisies + cartouche discret (« Signé par <nom> le <date> — lu et
   approuvé — via ExtraBat »).
4. Upload du PDF signé (`…/a-signer/<uuid>-signe.pdf`), puis transaction
   Prisma : `signeLe` (horodatage serveur), `cheminSigne`, `hashSigne`,
   `signeParUserId`, `nomSignataire`, journal `DOCUMENT_SIGNE`,
   notifications back-office. L'original n'est **jamais** supprimé.

**Résultat** : le document apparaît « Signé ✓ » instantanément côté
assistante, en téléchargement par URL signée — déjà signé, rien à modifier,
rien de papier. En cas d'erreur (mauvais document signé), pas d'édition
possible : l'assistante ajoute le document corrigé et le fait signer à
nouveau. *Modifié après ce document :* un document **signé** n'est jamais
supprimable — ni seul, ni par la suppression de son dossier — car
l'original, la version signée et leurs hash forment la preuve (§ 6).

**Marquer terminé par l'ouvrier** : bouton sur sa fiche chantier, avec
**avertissement non bloquant** si des documents restent à signer (philosophie
du projet : avertir, jamais bloquer — le flux nominal est signer PUIS
terminer). Même transaction que le marquage back-office (chantier
`termineLe` + dossier `TERMINE`), acteur = l'ouvrier au journal,
notification back-office. Le règlement reste évidemment côté bureau
(`payeLe` découplé — rien ne change).

### 5. pdf-lib : la décision à assumer

La feature parquée « PDF téléchargeable (lib) » visait la **génération** de
comptes-rendus PDF (l'impression navigateur suffit, et ça reste vrai). Ici
c'est différent : on n'engendre rien, on **aplatit une image dans un PDF
existant** — impossible sans lib. Recommandation : **`pdf-lib`** (JS pur,
zéro dépendance binaire, tourne tel quel en serverless Vercel runtime Node,
~200 Ko côté serveur uniquement). Un PDF de 15 Mo se tamponne en mémoire
sans souci serverless. À l'implémentation, mettre à jour `CLAUDE.md` avec le
périmètre exact : *pdf-lib pour le tamponnage de signature uniquement — la
génération de documents PDF reste parquée*.

### 6. Valeur légale — être honnête

C'est une **signature électronique simple** (SES au sens eIDAS) : pas de
certificat qualifié, pas de tiers horodateur. C'est juridiquement **au moins
équivalent à la feuille papier signée sur le capot du camion** qu'elle
remplace, avec une valeur probante bien meilleure à coût nul :

- horodatage serveur + hash SHA-256 de l'original ET du signé stockés en
  base (prouve la non-altération),
- journal immuable `EvenementDossier` : qui a ajouté le document, qui l'a
  présenté, quand il a été signé,
- nom du signataire + mention « lu et approuvé » cochée,
- conservation de l'original non signé.

Si un jour un client conteste et qu'il faut une signature **avancée ou
qualifiée** (prestataire type Yousign/Universign, coût par signature) : hors
scope, à réévaluer seulement si le besoin devient réel.

## Suggestions pertinentes à greffer (brainstorm)

1. **Photos de chantier par l'ouvrier** (avant / pendant / après) —
   réutilise le pipeline photos existant (compression lazy, bucket privé,
   ingestion Route Handler, file hors-ligne). Complète naturellement le PV
   signé en cas de litige. Probablement la greffe au meilleur ratio
   valeur/effort.
2. **Absences self-service** : l'ouvrier déclare ses congés/indispos
   (`AbsenceOuvrier` existe déjà, saisi aujourd'hui par l'assistante) →
   visibles immédiatement dans le Gantt et la détection de conflits, avec
   notification back-office.
3. **Empêchement chantier** (client absent, accès impossible) — miroir
   exact du `signalerEmpechement` des visites : l'ouvrier signale depuis sa
   fiche, le back-office est notifié, le journal trace, l'écran « À
   traiter » remonte le chantier.
4. **Intégration « À traiter »** : demandes terrain (empêchements chantier,
   chantiers terminés par le terrain à contrôler) ajoutées comme sections —
   les `where*` de [lib/a-traiter.ts](../../lib/a-traiter.ts) sont déjà
   exportés comme source unique (backlog + badge).
5. **Modèle de PDF au niveau organisation** : l'assistante uploade UNE fois
   le PV de fin de travaux vierge (Paramètres → Organisation), puis
   l'attache en 1 clic à chaque chantier — évite de re-uploader le même
   document 50 fois. Le tamponnage peut aussi pré-remplir nom client/adresse/
   date via pdf-lib (champs texte posés sur le PDF).
6. **Cache hors-ligne lecture** de la fiche chantier du jour (PWA) : les
   sous-sols humides captent mal — vécu déjà rencontré côté conducteur. La
   signature exige le réseau, mais peut se mettre en file d'attente locale
   (pattern `photos-hors-ligne` existant) si besoin réel constaté.

**Écarté d'office** (parqué ou fardeau > valeur — ne pas relancer sans
décision explicite) : pointage des heures, chat interne, relances/alertes
automatiques (les notifications restent déclenchées par des mutations
humaines, jamais par le temps), génération de PDF from scratch, drag&drop.

## Compromis à trancher avant d'implémenter

- **L'ouvrier marque terminé lui-même** (voulu par Anis — recommandé, avec
  journal + notification) ou simple « demande de clôture » validée au
  bureau ? Si plusieurs ouvriers sont affectés, lequel a le droit ? (piste :
  tous — le premier qui clôt, comme la feuille papier aujourd'hui).
- **Signature multi-documents / multi-signataires** : plusieurs PDF par
  chantier oui (liste), mais deux signatures sur le même PDF (client +
  ouvrier) ? V1 : une seule signature (le client) — le cartouche identifie
  déjà l'ouvrier présentateur.
- **Fenêtre de signature** : signable à tout moment, ou seulement chantier
  `EN_COURS`/`A_CLOTURER` ? (piste : avertir hors fenêtre, ne pas bloquer.)
- **Que voit l'ouvrier du sinistre** : V1 = rien de l'expertise (ni
  compte-rendu ni photos de visite) — la fiche est logistique, le devis sans
  prix imprimé décrit les travaux. À reconfirmer avec l'usage.
- **Un ouvrier quitte l'entreprise** : `actif = false` coupe l'accès
  (guard). Faut-il aussi retirer le `MembreAutorise` automatiquement ?
  (piste : oui, dans la même action de désactivation.)

## Découpage suggéré (le jour du « ajoute cette feature »)

- **Vague 1 — Comptes & espace lecture** : enum `OUVRIER`, liaison
  `Ouvrier.userId` + `MembreAutorise.ouvrierId`, « Donner un accès » dans
  Paramètres → Ouvriers, hub + guards, `/app/mes-chantiers` + fiche filtrée
  + `/app/mon-planning`, notes du dossier, notifications d'affectation, seed
  (compte démo ouvrier). Aucune lib nouvelle, une migration.
- **Vague 2 — Signature** : MàJ `CLAUDE.md` (dé-parcage), modèle
  `DocumentASigner` + migration, upload assistante, visionneuse
  `pdfjs-dist` + pad + placement, Route Handler `garderOuvrier` + tamponnage
  `pdf-lib`, journal + notifications, écran « Signé ✓ » des deux côtés.
- **Vague 3 — Terrain autonome** : marquer terminé ouvrier, photos de
  chantier, absences self-service, empêchement chantier, intégration « À
  traiter ».

Chaque vague : migrations additives uniquement, petits commits,
`npm run build` vert avant de conclure, recette iPhone réelle (l'espace
ouvrier est mobile-first par définition).

## Invariants à respecter (rappel pour la session qui implémentera)

- Multi-tenant : scoping `organisationId` partout + vérification
  d'**affectation** (l'ouvrier ne voit que SES chantiers, pas ceux de l'org).
- Frontière financière : `montantDevis` / `franchise` / `refDevis` /
  `payeLe` ne transitent **jamais** vers un client ouvrier — selects
  minimaux explicites, à vérifier à la revue.
- Mutations : `requireRoleActif` (ou garde 403 des Route Handlers) —
  l'abonnement suspendu/résilié coupe la signature et le marquage terminé
  comme le reste.
- `signeLe` horodaté serveur, jamais saisi (philosophie `dateRealisee`).
- Statuts dérivés, pas cochés (signé = `signeLe != null`).
- Journal + notifications dans la **même transaction** que la mutation.
- Storage : chemins d'objets privés + URLs signées serveur, jamais d'URL
  publique (philosophie `Photo.chemin`).
