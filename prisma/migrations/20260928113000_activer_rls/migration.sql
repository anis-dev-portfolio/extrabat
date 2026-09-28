-- Ferme la Data API de Supabase (PostgREST) sur toutes les tables de l'app.
--
-- Les tables vivent dans le schéma `public`, exposé par défaut par Supabase au
-- rôle `anon` — dont la clé est publique par nature (embarquée côté navigateur,
-- lib/supabase/client.ts). Les migrations n'activaient pas le RLS : en
-- production, c'est le réglage « activation automatique du RLS » du projet
-- Supabase qui le posait sur chaque nouvelle table. Cette migration l'inscrit
-- dans le code, pour qu'une base neuve soit protégée sans dépendre de ce
-- réglage (sinon la clé `anon` suffirait à lire et modifier toutes les données
-- via https://<projet>.supabase.co/rest/v1/<Table>).
--
-- L'app n'utilise jamais la Data API : les données passent par Prisma, Supabase
-- ne sert qu'à l'Auth et au Storage. On active donc le RLS SANS AUCUNE POLICY :
-- `anon` et `authenticated` ne voient plus aucune ligne, tandis que Prisma, qui
-- se connecte avec le rôle propriétaire des tables, n'est pas concerné.
--
-- Invariant (CLAUDE.md) : toute nouvelle table reçoit la même ligne dans sa
-- migration de création.

ALTER TABLE "Organisation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MembreAutorise" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Dossier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Visite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Photo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PieceJointe" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NoteDossier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvenementDossier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HoraireRecurrent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Absence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ouvrier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AbsenceOuvrier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Chantier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AffectationChantier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentASigner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StripeEventTraite" ENABLE ROW LEVEL SECURITY;

-- Table technique de Prisma, elle aussi dans `public` (noms des migrations).
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
