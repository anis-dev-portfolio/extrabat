-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DossierStatut" ADD VALUE 'EN_CHANTIER';
ALTER TYPE "DossierStatut" ADD VALUE 'TERMINE';

-- CreateTable
CREATE TABLE "Ouvrier" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organisationId" TEXT NOT NULL,

    CONSTRAINT "Ouvrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbsenceOuvrier" (
    "id" TEXT NOT NULL,
    "ouvrierId" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "motif" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbsenceOuvrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chantier" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "materiel" TEXT,
    "termineLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organisationId" TEXT NOT NULL,

    CONSTRAINT "Chantier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffectationChantier" (
    "chantierId" TEXT NOT NULL,
    "ouvrierId" TEXT NOT NULL,

    CONSTRAINT "AffectationChantier_pkey" PRIMARY KEY ("chantierId","ouvrierId")
);

-- CreateIndex
CREATE INDEX "Ouvrier_organisationId_actif_idx" ON "Ouvrier"("organisationId", "actif");

-- CreateIndex
CREATE INDEX "AbsenceOuvrier_ouvrierId_dateDebut_idx" ON "AbsenceOuvrier"("ouvrierId", "dateDebut");

-- CreateIndex
CREATE UNIQUE INDEX "Chantier_dossierId_key" ON "Chantier"("dossierId");

-- CreateIndex
CREATE INDEX "Chantier_organisationId_dateDebut_idx" ON "Chantier"("organisationId", "dateDebut");

-- CreateIndex
CREATE INDEX "AffectationChantier_ouvrierId_idx" ON "AffectationChantier"("ouvrierId");

-- AddForeignKey
ALTER TABLE "Ouvrier" ADD CONSTRAINT "Ouvrier_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceOuvrier" ADD CONSTRAINT "AbsenceOuvrier_ouvrierId_fkey" FOREIGN KEY ("ouvrierId") REFERENCES "Ouvrier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chantier" ADD CONSTRAINT "Chantier_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chantier" ADD CONSTRAINT "Chantier_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationChantier" ADD CONSTRAINT "AffectationChantier_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationChantier" ADD CONSTRAINT "AffectationChantier_ouvrierId_fkey" FOREIGN KEY ("ouvrierId") REFERENCES "Ouvrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
