import "server-only";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { BUCKET_SINISTRES } from "./bucket";

export { BUCKET_SINISTRES };

// Client Supabase à privilèges service_role — SERVEUR UNIQUEMENT.
// `import "server-only"` fait échouer le build si ce module est jamais importé
// dans un composant/bundle client. Utilisé pour miner des URLs signées d'upload
// et de lecture sur le bucket privé "sinistres" (aucune policy RLS requise).
//
// NE JAMAIS exposer SUPABASE_SERVICE_ROLE_KEY au navigateur.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante: ${name}`);
  return value;
}

// Un seul client réutilisé par process (évite d'en recréer à chaque appel).
// Instanciation PARESSEUSE : si la clé service_role manque, l'erreur est levée
// au premier appel (donc rattrapable et lisible), pas au chargement du module.
function creerClientAdmin() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const globalForAdmin = globalThis as unknown as {
  supabaseAdmin?: ReturnType<typeof creerClientAdmin>;
};

export function getSupabaseAdmin(): ReturnType<typeof creerClientAdmin> {
  globalForAdmin.supabaseAdmin ??= creerClientAdmin();
  return globalForAdmin.supabaseAdmin;
}

// URL signée de LECTURE d'un objet du bucket privé (logo d'organisation…) —
// best-effort : null si chemin absent ou signature impossible, l'appelant
// affiche son fallback au lieu de casser la page. Pour un lot de photos,
// préférer signerPhotosLecture (batch).
export async function urlSigneeLecture(
  chemin: string | null,
  expiresIn: number,
): Promise<string | null> {
  if (!chemin) return null;
  try {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(BUCKET_SINISTRES)
      .createSignedUrl(chemin, expiresIn);
    if (error || !data) return null;
    return data.signedUrl;
  } catch (err) {
    console.error("urlSigneeLecture", err);
    return null;
  }
}

// TTL du cache de signature : la MOITIÉ de la validité de l'URL signée (jamais
// moins de 60 s) — une URL servie du cache garde donc au moins expiresIn/2
// d'avance sur son expiration.
function ttlSignature(expiresIn: number): number {
  return Math.max(60, Math.floor(expiresIn / 2));
}

// Mémoïse une signature Storage dans le Data Cache Next SANS jamais renvoyer
// d'URL périmée.
//
// Le TTL d'`unstable_cache` n'est PAS une date de péremption dure : Next sert
// l'entrée périmée TELLE QUELLE et ne la revalide qu'en arrière-plan
// (stale-while-revalidate, cf. next/dist/server/web/spec-extension/
// unstable-cache.js — « return stale immediately »). Une entrée non relue
// pendant plus que la validité de la signature ressort donc EXPIRÉE : sur une
// page rarement rouverte (un compte-rendu donné), le premier à l'ouvrir reçoit
// des URLs mortes — images cassées, téléchargements en « Jwt expired » — et le
// suivant, servi par la revalidation déclenchée entre-temps, voit tout
// normalement. On date donc chaque signature et on re-signe hors cache dès que
// l'entrée dépasse son TTL, au lieu de faire confiance à `revalidate`.
//
// Autres garanties (inchangées) : la clé inclut le chemin complet, préfixé par
// l'organisationId à l'upload (scoping tenant par construction) — un nouvel
// objet = nouveau chemin (UUID) = nouvelle clé, pas d'invalidation à câbler ;
// un échec de signature n'est jamais mis en cache (throw interne), un raté
// transitoire ne prive pas du lien pendant tout le TTL.
export async function signatureCachee(
  cle: string[],
  expiresIn: number,
  signer: () => Promise<string | null>,
): Promise<string | null> {
  const ttl = ttlSignature(expiresIn);
  const lire = unstable_cache(
    async (): Promise<{ url: string; mineeA: number }> => {
      const url = await signer();
      if (!url) throw new Error("signature indisponible");
      return { url, mineeA: Date.now() };
    },
    cle,
    { revalidate: ttl },
  );
  try {
    const entree = await lire();
    if (Date.now() - entree.mineeA < ttl * 1000) return entree.url;
  } catch {
    // Signature indisponible : jamais mise en cache, on retente directement.
  }
  return signer();
}

// Variante CACHÉE d'urlSigneeLecture pour les objets stables re-signés à
// chaque rendu (logo d'organisation sur 4 pages force-dynamic, photos d'une
// visite) : évite un aller-retour Storage par navigation.
export async function urlSigneeLectureCachee(
  chemin: string | null,
  expiresIn: number,
): Promise<string | null> {
  if (!chemin) return null;
  const cheminSigne = chemin;
  return signatureCachee(
    ["url-signee-lecture", cheminSigne, String(expiresIn)],
    expiresIn,
    () => urlSigneeLecture(cheminSigne, expiresIn),
  );
}

// Photo prête à afficher : id + URL de lecture signée, ou url null si la
// signature a échoué (l'appelant montre alors un placeholder).
export type PhotoSignee = { id: string; url: string | null };

// URLs signées de LECTURE d'un lot de photos du bucket privé. Chaque photo
// passe par le signeur unitaire CACHÉ ci-dessus (clé = chemin d'objet) : les
// chemins sont immuables (le service worker exploite déjà cette immuabilité,
// cf. app/sw.ts), donc des pages différentes affichant la même photo partagent
// l'entrée de cache, et re-rendre une fiche ne re-mine plus d'URL Storage tant
// que le TTL (expiresIn/2) court — aucune URL périmée ne peut être servie.
// Best-effort par photo : une signature qui échoue donne url null (placeholder
// côté appelant) sans casser le lot ni être mise en cache. `expiresIn` varie
// selon l'usage (1 h pour l'impression, 7 j pour la consultation hors-ligne).
export async function signerPhotosLecture(
  photos: readonly { id: string; chemin: string }[],
  expiresIn: number,
): Promise<PhotoSignee[]> {
  if (photos.length === 0) return [];
  return Promise.all(
    photos.map(async (p) => ({
      id: p.id,
      url: await urlSigneeLectureCachee(p.chemin, expiresIn),
    })),
  );
}
