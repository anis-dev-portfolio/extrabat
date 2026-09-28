import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createClient, type User as SupabaseUser } from "@supabase/supabase-js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

// --- Seed configuration --------------------------------------------------------
const ORG_NOM = "ISO-BAT";

// Coordonnées factices de l'org (compte-rendu imprimable, page Organisation).
// Ne remplace JAMAIS une valeur déjà saisie (idempotent, non destructif).
const ORG_ADRESSE = "14 rue des Charpentiers, 93100 Montreuil";
const ORG_SIRET = "123 456 789 00012";

// Horaires récurrents par défaut des conducteurs démo : Lun–Ven 8h–17h
// (minutes depuis minuit : 480 → 1020). Idempotent via skipDuplicates.
const HORAIRES_DEMO = [1, 2, 3, 4, 5].map((jourSemaine) => ({
  jourSemaine,
  heureDebut: 8 * 60,
  heureFin: 17 * 60,
}));

// Admin : email overridable, mot de passe JAMAIS en dur. Si SEED_ADMIN_PASSWORD
// n'est pas fourni, un mot de passe fort est généré et affiché UNE SEULE FOIS.
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@exemple.fr";
const ADMIN_NOM = process.env.SEED_ADMIN_NOM ?? "Admin ISO-BAT";

// Comptes de démonstration (assistante + conducteur) pour dérouler le cycle
// complet. Cantonnés au NON-PROD : jamais créés quand NODE_ENV/VERCEL_ENV vaut
// "production". Leurs mots de passe sont générés, jamais écrits en dur.
const IS_PROD =
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL_ENV === "production";
const INCLUDE_DEMO = process.env.SEED_DEMO === "1" || !IS_PROD;

const DEMO_USERS = [
  {
    email: "assistante@exemple.fr",
    nom: "Assistante démo",
    role: "ASSISTANTE" as const,
  },
  {
    email: "conducteur@exemple.fr",
    nom: "Conducteur démo",
    role: "CONDUCTEUR" as const,
  },
];

// Mot de passe fort aléatoire (~144 bits, base64url sans caractères ambigus).
function genererMotDePasse(): string {
  return randomBytes(18).toString("base64url");
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante: ${name}`);
  }
  return value;
}

// Migrations/seed use the direct connection; fall back to the pooled one.
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL (ou DATABASE_URL) doit être défini pour le seed.");
}

// Supabase requires TLS for remote connections; local Postgres does not.
// Si SUPABASE_CA_CERT est fourni, on vérifie le certificat (MITM impossible).
const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);
const caCert = process.env.SUPABASE_CA_CERT;
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    ssl: isLocal
      ? undefined
      : caCert
        ? { ca: caCert, rejectUnauthorized: true }
        : { rejectUnauthorized: false },
  }),
});

const supabaseAdmin = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Look up an existing Auth user by email (paginating the admin list).
async function findAuthUserByEmail(email: string): Promise<SupabaseUser | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (data.users.length < 200) break; // last page reached
  }
  return null;
}

type ResultatAuth = { id: string; motDePasse: string | null };

// Crée l'utilisateur Auth avec un mot de passe fort (env ou généré). S'il existe
// déjà, on le RÉUTILISE sans jamais réinitialiser son mot de passe (sinon un
// re-seed casserait le mot de passe de prod) — on ne met à jour que ses méta.
async function ensureAuthUser(
  email: string,
  nom: string,
  motDePasseVoulu?: string,
): Promise<ResultatAuth> {
  const motDePasse = motDePasseVoulu ?? genererMotDePasse();
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
    user_metadata: { nom },
  });

  if (!error && data.user) {
    console.log(`✔ Auth user créé: ${email}`);
    return { id: data.user.id, motDePasse };
  }

  // Already exists — reuse it WITHOUT touching its password.
  const existing = await findAuthUserByEmail(email);
  if (!existing) {
    throw error ?? new Error(`Échec de création de l'utilisateur Auth: ${email}`);
  }

  await supabaseAdmin.auth.admin.updateUserById(existing.id, {
    email_confirm: true,
    user_metadata: { nom },
  });
  console.log(`✔ Auth user existant réutilisé (mot de passe inchangé): ${email}`);
  return { id: existing.id, motDePasse: null };
}

// Inscrit l'email dans la liste d'autorisation (source de vérité du
// provisionnement à la 1re connexion). Idempotent.
async function ensureMembreAutorise(
  organisationId: string,
  email: string,
  role: "ADMIN" | "ASSISTANTE" | "CONDUCTEUR",
) {
  const cle = email.toLowerCase();
  await prisma.membreAutorise.upsert({
    where: { email: cle },
    update: { role, organisationId },
    create: { email: cle, role, organisationId },
  });
}

// Ensure a Supabase Auth user + its linked DB User row (id == Supabase auth id).
async function ensureUser(
  organisationId: string,
  email: string,
  nom: string,
  role: "ADMIN" | "ASSISTANTE" | "CONDUCTEUR",
  motDePasseVoulu?: string,
): Promise<{ id: string; email: string; role: string; motDePasse: string | null }> {
  await ensureMembreAutorise(organisationId, email, role);
  const { id, motDePasse } = await ensureAuthUser(email, nom, motDePasseVoulu);
  const user = await prisma.user.upsert({
    where: { id },
    update: { email, nom, role, organisationId },
    create: { id, email, nom, role, organisationId },
  });
  console.log(`✔ User: ${user.email} — rôle ${user.role}`);
  return { id: user.id, email: user.email, role: user.role, motDePasse };
}

// Pose les horaires récurrents par défaut d'un conducteur démo. Idempotent
// (skipDuplicates sur l'unique (conducteurId, jourSemaine, heureDebut)) et
// non destructif : ne touche jamais des plages ajoutées/modifiées à la main.
async function ensureHorairesDemo(conducteurId: string) {
  const { count } = await prisma.horaireRecurrent.createMany({
    data: HORAIRES_DEMO.map((h) => ({ conducteurId, ...h })),
    skipDuplicates: true,
  });
  if (count > 0) {
    console.log(`✔ Horaires démo Lun–Ven 8h–17h posés (${count} plages).`);
  }
}

async function main() {
  const org =
    (await prisma.organisation.findFirst({ where: { nom: ORG_NOM } })) ??
    (await prisma.organisation.create({ data: { nom: ORG_NOM } }));
  console.log(`✔ Organisation: ${org.nom} (${org.id})`);

  // Coordonnées factices : uniquement si absentes (ne jamais écraser une
  // valeur saisie via /app/parametres/organisation).
  const coordonnees: { adresse?: string; siret?: string } = {};
  if (!org.adresse) coordonnees.adresse = ORG_ADRESSE;
  if (!org.siret) coordonnees.siret = ORG_SIRET;
  if (Object.keys(coordonnees).length > 0) {
    await prisma.organisation.update({
      where: { id: org.id },
      data: coordonnees,
    });
    console.log("✔ Coordonnées ISO-BAT complétées (adresse/SIRET factices).");
  }

  const comptes: { email: string; role: string; motDePasse: string | null }[] =
    [];

  comptes.push(
    await ensureUser(
      org.id,
      ADMIN_EMAIL,
      ADMIN_NOM,
      "ADMIN",
      process.env.SEED_ADMIN_PASSWORD, // undefined => généré
    ),
  );

  if (INCLUDE_DEMO) {
    for (const u of DEMO_USERS) {
      const compte = await ensureUser(org.id, u.email, u.nom, u.role);
      comptes.push(compte);
      if (u.role === "CONDUCTEUR") await ensureHorairesDemo(compte.id);
    }
  } else {
    console.log("↷ Comptes démo ignorés (environnement de production).");
  }

  // Récap des identifiants — les mots de passe générés ne sont affichés QU'ICI,
  // une seule fois. Notez-les : ils ne sont stockés nulle part en clair.
  console.log("\nSeed terminé. Identifiants :");
  for (const c of comptes) {
    if (c.motDePasse) {
      console.log(`  ${c.role.padEnd(11)} ${c.email} / ${c.motDePasse}`);
    } else {
      console.log(
        `  ${c.role.padEnd(11)} ${c.email} / (compte existant — mot de passe inchangé)`,
      );
    }
  }
  console.log(
    "\n⚠ Notez les mots de passe ci-dessus : ils ne seront plus jamais affichés.",
  );
}

main()
  .catch((error) => {
    console.error("Seed échoué:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
