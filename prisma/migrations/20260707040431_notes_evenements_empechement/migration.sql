-- CreateEnum
CREATE TYPE "TypeEvenementDossier" AS ENUM ('CREATION', 'MODIFICATION_CLIENT', 'VISITE_PLANIFIEE', 'VISITE_REPLANIFIEE', 'VISITE_ANNULEE', 'COMPTE_RENDU_RECU', 'CLASSEMENT', 'EMPECHEMENT', 'CHANTIER_CREE', 'CHANTIER_MODIFIE', 'CHANTIER_TERMINE', 'CHANTIER_ROUVERT', 'CHANTIER_SUPPRIME');

-- DropIndex
DROP INDEX "Visite_conducteurId_statut_idx";

-- AlterTable
ALTER TABLE "Dossier" ADD COLUMN     "email" TEXT,
ADD COLUMN     "empechementLe" TIMESTAMP(3),
ADD COLUMN     "empechementMotif" TEXT;

-- CreateTable
CREATE TABLE "NoteDossier" (
    "id" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dossierId" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,

    CONSTRAINT "NoteDossier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvenementDossier" (
    "id" TEXT NOT NULL,
    "type" "TypeEvenementDossier" NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dossierId" TEXT NOT NULL,
    "acteurId" TEXT NOT NULL,

    CONSTRAINT "EvenementDossier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NoteDossier_dossierId_createdAt_idx" ON "NoteDossier"("dossierId", "createdAt");

-- CreateIndex
CREATE INDEX "EvenementDossier_dossierId_createdAt_idx" ON "EvenementDossier"("dossierId", "createdAt");

-- CreateIndex
CREATE INDEX "Dossier_organisationId_updatedAt_idx" ON "Dossier"("organisationId", "updatedAt");

-- CreateIndex
CREATE INDEX "Visite_conducteurId_statut_datePlanifiee_idx" ON "Visite"("conducteurId", "statut", "datePlanifiee");

-- AddForeignKey
ALTER TABLE "NoteDossier" ADD CONSTRAINT "NoteDossier_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteDossier" ADD CONSTRAINT "NoteDossier_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvenementDossier" ADD CONSTRAINT "EvenementDossier_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvenementDossier" ADD CONSTRAINT "EvenementDossier_acteurId_fkey" FOREIGN KEY ("acteurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
