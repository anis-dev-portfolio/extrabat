-- CreateEnum
CREATE TYPE "DossierStatut" AS ENUM ('NOUVEAU', 'PLANIFIE', 'REALISE', 'EN_ATTENTE_HUMIDITE', 'PRET_POUR_TRAVAUX');

-- CreateEnum
CREATE TYPE "VisiteStatut" AS ENUM ('PLANIFIEE', 'REALISEE');

-- CreateTable
CREATE TABLE "Dossier" (
    "id" TEXT NOT NULL,
    "nomClient" TEXT NOT NULL,
    "adresse" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "infosAcces" TEXT,
    "statut" "DossierStatut" NOT NULL DEFAULT 'NOUVEAU',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organisationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "Dossier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visite" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "datePlanifiee" TIMESTAMP(3) NOT NULL,
    "dateRealisee" TIMESTAMP(3),
    "statut" "VisiteStatut" NOT NULL DEFAULT 'PLANIFIEE',
    "piecesEndommagees" TEXT[],
    "tauxHumidite" INTEGER,
    "joursReparationEstimes" INTEGER,
    "resume" TEXT,
    "conclusion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dossierId" TEXT NOT NULL,
    "conducteurId" TEXT NOT NULL,

    CONSTRAINT "Visite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "chemin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "visiteId" TEXT NOT NULL,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dossier_organisationId_idx" ON "Dossier"("organisationId");

-- CreateIndex
CREATE INDEX "Dossier_statut_idx" ON "Dossier"("statut");

-- CreateIndex
CREATE INDEX "Visite_conducteurId_idx" ON "Visite"("conducteurId");

-- CreateIndex
CREATE INDEX "Visite_dossierId_idx" ON "Visite"("dossierId");

-- CreateIndex
CREATE UNIQUE INDEX "Visite_dossierId_numero_key" ON "Visite"("dossierId", "numero");

-- CreateIndex
CREATE INDEX "Photo_visiteId_idx" ON "Photo"("visiteId");

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visite" ADD CONSTRAINT "Visite_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visite" ADD CONSTRAINT "Visite_conducteurId_fkey" FOREIGN KEY ("conducteurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_visiteId_fkey" FOREIGN KEY ("visiteId") REFERENCES "Visite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
