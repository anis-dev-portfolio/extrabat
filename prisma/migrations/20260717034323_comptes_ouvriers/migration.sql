-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'OUVRIER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TypeEvenementDossier" ADD VALUE 'DOCUMENT_A_SIGNER_AJOUTE';
ALTER TYPE "TypeEvenementDossier" ADD VALUE 'DOCUMENT_SIGNE';
ALTER TYPE "TypeEvenementDossier" ADD VALUE 'DOCUMENT_A_SIGNER_SUPPRIME';
ALTER TYPE "TypeEvenementDossier" ADD VALUE 'CHANTIER_TERMINE_TERRAIN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TypeNotification" ADD VALUE 'CHANTIER_AFFECTE';
ALTER TYPE "TypeNotification" ADD VALUE 'CHANTIER_REPLANIFIE';
ALTER TYPE "TypeNotification" ADD VALUE 'CHANTIER_RETIRE';
ALTER TYPE "TypeNotification" ADD VALUE 'DOCUMENT_A_SIGNER_RECU';
ALTER TYPE "TypeNotification" ADD VALUE 'DOCUMENT_SIGNE_RECU';
ALTER TYPE "TypeNotification" ADD VALUE 'CHANTIER_TERMINE_TERRAIN';

-- AlterTable
ALTER TABLE "MembreAutorise" ADD COLUMN     "ouvrierId" TEXT;

-- AlterTable
ALTER TABLE "Ouvrier" ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "DocumentASigner" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cheminOriginal" TEXT NOT NULL,
    "hashOriginal" TEXT NOT NULL,
    "cheminSigne" TEXT,
    "hashSigne" TEXT,
    "signeLe" TIMESTAMP(3),
    "nomSignataire" TEXT,
    "dossierId" TEXT NOT NULL,
    "ajouteParId" TEXT NOT NULL,
    "signeParUserId" TEXT,

    CONSTRAINT "DocumentASigner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentASigner_dossierId_createdAt_idx" ON "DocumentASigner"("dossierId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MembreAutorise_ouvrierId_key" ON "MembreAutorise"("ouvrierId");

-- CreateIndex
CREATE UNIQUE INDEX "Ouvrier_userId_key" ON "Ouvrier"("userId");

-- AddForeignKey
ALTER TABLE "MembreAutorise" ADD CONSTRAINT "MembreAutorise_ouvrierId_fkey" FOREIGN KEY ("ouvrierId") REFERENCES "Ouvrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ouvrier" ADD CONSTRAINT "Ouvrier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentASigner" ADD CONSTRAINT "DocumentASigner_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentASigner" ADD CONSTRAINT "DocumentASigner_ajouteParId_fkey" FOREIGN KEY ("ajouteParId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentASigner" ADD CONSTRAINT "DocumentASigner_signeParUserId_fkey" FOREIGN KEY ("signeParUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
