-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TypeEvenementDossier" ADD VALUE 'DEVIS_ENREGISTRE';
ALTER TYPE "TypeEvenementDossier" ADD VALUE 'PAIEMENT_RECU';
ALTER TYPE "TypeEvenementDossier" ADD VALUE 'PAIEMENT_ANNULE';

-- AlterTable
ALTER TABLE "Dossier" ADD COLUMN     "franchise" INTEGER,
ADD COLUMN     "montantDevis" INTEGER,
ADD COLUMN     "payeLe" TIMESTAMP(3),
ADD COLUMN     "refDevis" TEXT;

-- CreateIndex
CREATE INDEX "Dossier_organisationId_payeLe_idx" ON "Dossier"("organisationId", "payeLe");
