-- CreateIndex
CREATE INDEX "Chantier_organisationId_termineLe_idx" ON "Chantier"("organisationId", "termineLe");

-- CreateIndex
CREATE INDEX "Dossier_organisationId_statut_updatedAt_idx" ON "Dossier"("organisationId", "statut", "updatedAt");

-- CreateIndex
CREATE INDEX "Dossier_organisationId_departement_idx" ON "Dossier"("organisationId", "departement");
