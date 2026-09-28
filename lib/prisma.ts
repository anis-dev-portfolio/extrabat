import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Runtime connection goes through the pooled DATABASE_URL (pgbouncer) via the
// pg driver adapter. Migrations use DIRECT_URL through the Prisma CLI instead
// (see prisma.config.ts). Prepared-statement caching is off by default in the
// adapter, which keeps it compatible with the transaction-mode pooler.
const connectionString = process.env.DATABASE_URL ?? "";

// Supabase requires TLS for remote connections; local Postgres does not.
// Si SUPABASE_CA_CERT est fourni, on vérifie le certificat serveur (anti-MITM) ;
// sinon la connexion reste chiffrée mais sans vérification (compromis documenté
// dans .env.example).
const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);
const caCert = process.env.SUPABASE_CA_CERT;

// Sans CA, la connexion distante reste chiffrée mais N'AUTHENTIFIE PAS le
// serveur (rejectUnauthorized: false → un MITM actif peut se faire passer
// pour le pooler). Rappel bruyant au démarrage en prod : poser
// SUPABASE_CA_CERT sur Vercel fait basculer sur rejectUnauthorized: true.
if (!isLocal && !caCert && process.env.NODE_ENV === "production") {
  console.error(
    "[SÉCURITÉ] SUPABASE_CA_CERT absent : le certificat du serveur Postgres " +
      "n'est PAS vérifié (MITM possible). Fournissez le certificat CA Supabase " +
      "via la variable d'environnement SUPABASE_CA_CERT.",
  );
}

const adapter = new PrismaPg({
  connectionString,
  // Dimensionnement du pool : sans `max`, pg ouvre jusqu'à 10 connexions PAR
  // instance (donc par lambda en serverless) derrière pgbouncer, dont le pool
  // amont est partagé entre toutes les lambdas. 3 suffit en prod : les rafales
  // (ex. les ~24 requêtes du Promise.all de Statistiques) se lissent dans la
  // file du pool au lieu de saturer le pooler. 5 en dev (instance unique,
  // hot-reload). Si une page multi-requêtes ralentit sensiblement, remonter
  // prod à 5 et mesurer sur le dashboard Supabase (pooler).
  max: process.env.NODE_ENV === "production" ? 3 : 5,
  ssl: isLocal
    ? undefined
    : caCert
      ? { ca: caCert, rejectUnauthorized: true }
      : { rejectUnauthorized: false },
});

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

// Avoid exhausting connections with hot-reload in development.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
