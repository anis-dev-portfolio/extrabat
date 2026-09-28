-- AlterTable
ALTER TABLE "Dossier" ADD COLUMN     "classeHumiditeLe" TIMESTAMP(3);

-- Backfill : updatedAt est la meilleure approximation de la date d'entrée
-- dans le statut (c'était déjà le proxy utilisé par doitEtreReplanifie).
UPDATE "Dossier" SET "classeHumiditeLe" = "updatedAt" WHERE "statut" = 'EN_ATTENTE_HUMIDITE';
