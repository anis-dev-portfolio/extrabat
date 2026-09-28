-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TypeEvenementDossier" ADD VALUE 'PIECE_JOINTE_AJOUTEE';
ALTER TYPE "TypeEvenementDossier" ADD VALUE 'PIECE_JOINTE_SUPPRIMEE';

-- CreateTable
CREATE TABLE "PieceJointe" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "chemin" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dossierId" TEXT NOT NULL,
    "ajouteParId" TEXT NOT NULL,

    CONSTRAINT "PieceJointe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PieceJointe_dossierId_createdAt_idx" ON "PieceJointe"("dossierId", "createdAt");

-- AddForeignKey
ALTER TABLE "PieceJointe" ADD CONSTRAINT "PieceJointe_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceJointe" ADD CONSTRAINT "PieceJointe_ajouteParId_fkey" FOREIGN KEY ("ajouteParId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
