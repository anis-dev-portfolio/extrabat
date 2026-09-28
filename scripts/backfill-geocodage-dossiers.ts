// Backfill du géocodage des dossiers existants (latitude/longitude créées
// après leur création — cf. lib/geocodage.ts). Idempotent : retraite les
// dossiers jamais géocodés (latitude null) ET les dossiers géocodés hors
// Île-de-France (mauvais match de commune homonyme, désormais rejeté par
// geocoderAdresse) — pour ceux-là, un re-géocodage qui échoue remet les
// coordonnées à null plutôt que de garder des coordonnées fausses.
// Relançable sans risque après correction manuelle d'une adresse
// (modifierDossier re-géocode déjà).
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { geocoderAdresse, DEPARTEMENTS_AUTORISES } from "../lib/geocodage";

// Même bootstrap de connexion que prisma/seed.ts.
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL (ou DATABASE_URL) doit être défini.");
}
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

// Délai entre deux appels BAN — API gratuite sans clé, on reste correct.
const DELAI_MS = 150;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dossiers = await prisma.dossier.findMany({
    where: {
      OR: [
        { latitude: null },
        { departement: null },
        { departement: { notIn: [...DEPARTEMENTS_AUTORISES] } },
      ],
    },
    select: {
      id: true,
      nomClient: true,
      adresse: true,
      latitude: true,
      departement: true,
    },
  });

  console.log(`${dossiers.length} dossier(s) à (re)géocoder.`);

  let ok = 0;
  let echecs = 0;
  for (const dossier of dossiers) {
    const resultat = await geocoderAdresse(dossier.adresse);
    if (resultat) {
      await prisma.dossier.update({
        where: { id: dossier.id },
        data: {
          latitude: resultat.latitude,
          longitude: resultat.longitude,
          geocodageScore: resultat.score,
          departement: resultat.departement,
        },
      });
      ok++;
      console.log(
        `  ✔ ${dossier.nomClient} — score ${resultat.score.toFixed(2)} (${resultat.departement ?? "?"})`,
      );
    } else {
      echecs++;
      if (dossier.latitude !== null) {
        // Ancien géocodage hors IDF irrécupérable : mieux vaut "non géocodé"
        // que 600 km d'erreur dans les signaux de proximité.
        await prisma.dossier.update({
          where: { id: dossier.id },
          data: {
            latitude: null,
            longitude: null,
            geocodageScore: null,
            departement: null,
          },
        });
        console.log(
          `  ✗ ${dossier.nomClient} — coordonnées hors IDF (${dossier.departement ?? "?"}) remises à null : "${dossier.adresse}"`,
        );
      } else {
        console.log(
          `  ✗ ${dossier.nomClient} — non géocodé : "${dossier.adresse}"`,
        );
      }
    }
    await sleep(DELAI_MS);
  }

  console.log(`\nTerminé : ${ok} géocodé(s), ${echecs} non géocodé(s) à corriger à la main.`);
}

main()
  .catch((error) => {
    console.error("Backfill géocodage échoué:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
