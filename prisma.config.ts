// Prisma CLI configuration (migrations, seed, studio).
// The Prisma CLI connects with DIRECT_URL (direct, non-pooled connection) —
// migrations must not go through the pgbouncer pooler.
// The app runtime uses DATABASE_URL (pooled) via the pg driver adapter in lib/prisma.ts.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL,
  },
});
