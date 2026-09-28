-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "adresse" TEXT,
ADD COLUMN     "dureeVisiteDefautMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "heureFermeture" INTEGER NOT NULL DEFAULT 1080,
ADD COLUMN     "heureOuverture" INTEGER NOT NULL DEFAULT 480,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "siret" TEXT;

-- AlterTable
ALTER TABLE "Visite" ADD COLUMN     "dureeMinutes" INTEGER NOT NULL DEFAULT 60;

-- CreateTable
CREATE TABLE "HoraireRecurrent" (
    "id" TEXT NOT NULL,
    "conducteurId" TEXT NOT NULL,
    "jourSemaine" INTEGER NOT NULL,
    "heureDebut" INTEGER NOT NULL,
    "heureFin" INTEGER NOT NULL,

    CONSTRAINT "HoraireRecurrent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Absence" (
    "id" TEXT NOT NULL,
    "conducteurId" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "motif" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HoraireRecurrent_conducteurId_idx" ON "HoraireRecurrent"("conducteurId");

-- CreateIndex
CREATE INDEX "HoraireRecurrent_conducteurId_jourSemaine_idx" ON "HoraireRecurrent"("conducteurId", "jourSemaine");

-- CreateIndex
CREATE UNIQUE INDEX "HoraireRecurrent_conducteurId_jourSemaine_heureDebut_key" ON "HoraireRecurrent"("conducteurId", "jourSemaine", "heureDebut");

-- CreateIndex
CREATE INDEX "Absence_conducteurId_dateDebut_idx" ON "Absence"("conducteurId", "dateDebut");

-- AddForeignKey
ALTER TABLE "HoraireRecurrent" ADD CONSTRAINT "HoraireRecurrent_conducteurId_fkey" FOREIGN KEY ("conducteurId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_conducteurId_fkey" FOREIGN KEY ("conducteurId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
