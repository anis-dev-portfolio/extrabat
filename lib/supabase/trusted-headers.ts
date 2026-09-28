// Noms des headers de confiance posés par le middleware (lib/supabase/middleware.ts)
// après vérification de la session, et lus par getCurrentUser() (lib/auth.ts).
// Centralisés ici : un typo entre les deux fichiers ferait échouer l'auth
// (fail closed) plutôt que de la contourner, mais autant l'éviter.
export const HEADER_USER_ID = "x-supabase-user-id";
export const HEADER_USER_EMAIL = "x-supabase-user-email";
