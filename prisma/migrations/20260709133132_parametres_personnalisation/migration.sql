-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "assuranceDecennale" TEXT,
ADD COLUMN     "delaiSechageJours" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "emailContact" TEXT,
ADD COLUMN     "mentionsLegales" TEXT,
ADD COLUMN     "seuilHumidite" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "siteWeb" TEXT,
ADD COLUMN     "telephone" TEXT,
ADD COLUMN     "triDossiersDefaut" TEXT NOT NULL DEFAULT 'priorite',
ADD COLUMN     "vueDossiersDefaut" TEXT NOT NULL DEFAULT 'kanban';
