-- Le détail des travaux vit désormais sur le devis (version sans prix
-- imprimée par l'assistante) : la fiche chantier redevient purement
-- logistique. Perte assumée des textes déjà saisis.

-- AlterTable
ALTER TABLE "Chantier" DROP COLUMN "description",
DROP COLUMN "materiel";
