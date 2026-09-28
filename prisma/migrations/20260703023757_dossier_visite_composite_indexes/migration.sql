-- DropIndex
DROP INDEX "Dossier_organisationId_idx";

-- DropIndex
DROP INDEX "Dossier_statut_idx";

-- DropIndex
DROP INDEX "Visite_conducteurId_idx";

-- DropIndex
DROP INDEX "Visite_dossierId_idx";

-- CreateIndex
CREATE INDEX "Dossier_organisationId_statut_classeHumiditeLe_idx" ON "Dossier"("organisationId", "statut", "classeHumiditeLe");

-- CreateIndex
CREATE INDEX "Visite_dossierId_statut_idx" ON "Visite"("dossierId", "statut");

-- CreateIndex
CREATE INDEX "Visite_conducteurId_statut_idx" ON "Visite"("conducteurId", "statut");
