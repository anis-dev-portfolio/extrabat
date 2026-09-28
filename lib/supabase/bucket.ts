// Nom du bucket privé Storage (à créer manuellement dans Supabase, public = off).
// Constante partageable client/serveur : ne contient AUCUN secret, contrairement
// à lib/supabase/admin.ts (service_role, server-only).
export const BUCKET_SINISTRES = "sinistres";
