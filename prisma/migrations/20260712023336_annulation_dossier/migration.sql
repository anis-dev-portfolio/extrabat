-- AlterEnum
ALTER TYPE "DossierStatut" ADD VALUE 'ANNULE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TypeEvenementDossier" ADD VALUE 'DOSSIER_ANNULE';
ALTER TYPE "TypeEvenementDossier" ADD VALUE 'DOSSIER_REPRIS';

-- AlterTable
ALTER TABLE "Dossier" ADD COLUMN     "annulationMotif" TEXT,
ADD COLUMN     "annuleLe" TIMESTAMP(3);
