-- CreateExtension
-- pg_trgm : similarité/indexation trigram, requise par l'opclass gin_trgm_ops.
-- Installée dans "public" pour que l'opclass se résolve sans qualification.
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";

-- CreateIndex
-- Accélère les recherches « contient » (ILIKE '%q%') sur nom client / adresse /
-- téléphone : recherche d'historique du conducteur et filtres dossiers.
CREATE INDEX "Dossier_nomClient_adresse_telephone_idx" ON "Dossier" USING GIN ("nomClient" gin_trgm_ops, "adresse" gin_trgm_ops, "telephone" gin_trgm_ops);
