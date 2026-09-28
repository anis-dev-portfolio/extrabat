import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth";
import { dossiersBadgesTag, statsTag } from "@/lib/cache-tags";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { BUCKET_SINISTRES } from "@/lib/supabase/bucket";
import {
  parseCompteRendu,
  appliquerCompteRendu,
  chargerVisiteConducteur,
  CompteRenduDejaEnvoye,
} from "@/lib/visites";
import { ErreurMetier, messageFromError } from "@/lib/erreurs";
import { MAX_PHOTOS_PAR_VISITE } from "@/lib/metier";

// Ingestion du compte-rendu terrain, exposée par des ROUTE HANDLERS
// (app/api/visites/[id]/…) et non des Server Actions : l'ID d'une Server
// Action change à chaque déploiement, donc un envoi mis en file hors-ligne
// puis rejoué APRÈS un déploiement frapperait un ID mort (« Failed to find
// Server Action ») pour toujours. L'URL d'une route, elle, est stable.
// Les invariants des anciennes actions sont conservés à l'identique :
// guard rôle CONDUCTEUR + double scoping (assignation + organisation),
// dateRealisee posée serveur, idempotence par visiteId (updateMany
// conditionnel → code DEJA_ENVOYEE traité en succès au rejeu).

// Résultat d'envoi : `code: "DEJA_ENVOYEE"` signale au client que la visite
// n'est plus PLANIFIEE. Un REJEU hors-ligne qui le reçoit se considère en
// succès (cas nominal : notre envoi avait abouti, la réponse s'était perdue)
// au lieu d'afficher une fausse erreur — c'est l'idempotence de l'envoi, dont
// la clé naturelle est visiteId (un seul compte-rendu par visite).
export type EnvoiResultat = { error: string | null; code?: "DEJA_ENVOYEE" };

export type UploadSigne =
  | { path: string; token: string }
  | { error: string; code?: "DEJA_ENVOYEE" };

// Plafond de photos par visite (partagé avec le formulaire terrain, qui le
// fait respecter dès l'ajout) : dur sur le compte-rendu envoyé.
// Le plafond d'OBJETS sous org/visite/, lui, sert d'anti-abus au moment de
// signer un upload : il est plus large, car une photo retirée du brouillon
// après son upload (ratée, en double…) reste dans le bucket — le compter au
// même niveau bloquait à tort un conducteur qui avait repris des photos.
const MAX_OBJETS_PAR_VISITE = MAX_PHOTOS_PAR_VISITE * 2;

// Nom d'objet attendu sous org/visite/ : exactement <uuid v4>.jpg (élimine
// toute traversée « .. » et tout format exotique).
const NOM_PHOTO_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/;

// Mine une URL signée d'upload pour UNE photo de la visite. Vérifie que la
// visite appartient bien au conducteur (`user`, déjà authentifié + rôle vérifié
// par la route) + à son org AVANT de signer. Le navigateur upload ensuite en
// direct via uploadToSignedUrl (chemin + token).
// Convention de chemin d'objet : organisationId/visiteId/<uuid>.jpg.
export async function creerUrlUploadPhoto(
  user: CurrentUser,
  visiteId: string,
): Promise<UploadSigne> {
  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (e) {
    // Clé service_role absente côté serveur (ex. non configurée sur Vercel).
    // Détail loggé serveur uniquement — rien d'exploitable ne part au client.
    console.error("Upload photo : config Supabase admin manquante :", e);
    return { error: "Préparation de l'upload impossible." };
  }

  // La lecture DB (chargerVisiteConducteur) et le listing Storage ne
  // dépendent l'un de l'autre en rien (le 2ᵉ ne lit que organisationId/
  // visiteId, déjà connus) : lancés en parallèle plutôt qu'en séquence — sur
  // le chemin mobile terrain (connectivité fragile), économise un aller-
  // retour réseau complet. Coût : le listing est parfois gaspillé sur les
  // chemins d'erreur précoce (visite introuvable/déjà envoyée) ci-dessous,
  // largement compensé par le gain sur le chemin nominal (la grande majorité
  // des appels).
  const [visite, resultatListe] = await Promise.all([
    chargerVisiteConducteur(user.id, user.organisationId, visiteId),
    admin.storage
      .from(BUCKET_SINISTRES)
      .list(`${user.organisationId}/${visiteId}`, {
        limit: MAX_OBJETS_PAR_VISITE,
      }),
  ]);
  if (!visite) return { error: "Visite introuvable." };
  if (visite.statut !== "PLANIFIEE") {
    return { error: "Cette visite est déjà réalisée.", code: "DEJA_ENVOYEE" };
  }

  // Plafond compté sur les objets réellement présents sous le préfixe
  // org/visite/ du bucket — les lignes Photo ne naissent qu'à l'envoi du
  // compte-rendu (visite → REALISEE), un prisma.photo.count() ici vaudrait
  // toujours 0. BEST-EFFORT, pas un plafond dur : le listing puis la
  // signature de l'URL ne sont pas atomiques (pas de verrou), deux requêtes
  // quasi simultanées peuvent toutes deux lire un compte sous le plafond et
  // l'uploader — le débordement possible est borné par la concurrence
  // réelle du client (quelques unités), pas illimité comme l'ancien bug
  // (prisma.photo.count() valait toujours 0).
  const { data: objets, error: erreurListe } = resultatListe;
  if (erreurListe) {
    console.error(
      "Upload photo : échec du listing du préfixe (plafond invérifiable) :",
      erreurListe,
    );
    return { error: "Préparation de l'upload impossible." };
  }
  if ((objets?.length ?? 0) >= MAX_OBJETS_PAR_VISITE) {
    return {
      error: `Nombre maximal de photos atteint (${MAX_PHOTOS_PAR_VISITE}).`,
    };
  }

  const path = `${user.organisationId}/${visiteId}/${crypto.randomUUID()}.jpg`;

  const { data, error } = await admin.storage
    .from(BUCKET_SINISTRES)
    .createSignedUploadUrl(path);

  if (error || !data) {
    // Cause typique : le bucket privé "sinistres" n'existe pas encore.
    console.error(
      `Upload photo : échec createSignedUploadUrl (bucket « ${BUCKET_SINISTRES} ») :`,
      error ?? "réponse vide",
    );
    return { error: "Préparation de l'upload impossible." };
  }
  return { path: data.path, token: data.token };
}

// Enregistre le compte-rendu terrain du conducteur. Double scoping (assignation
// + org), puis transaction partagée : visite -> REALISEE (horodatée) + dossier
// -> REALISE, et enregistrement des Photo (chemins d'objets déjà uploadés via
// URLs signées).
export async function enregistrerCompteRendu(
  user: CurrentUser,
  visiteId: string,
  formData: FormData,
): Promise<EnvoiResultat> {
  const parsed = parseCompteRendu(formData);
  if ("error" in parsed) return { error: parsed.error };

  // Chemins des photos déjà uploadées. Chaque chemin doit être EXACTEMENT
  // org/visite/<uuid v4>.jpg (défense contre un chemin forgé pointant ailleurs,
  // y compris via « .. »), et leur nombre est plafonné.
  const prefixe = `${user.organisationId}/${visiteId}/`;
  const photoPaths = formData
    .getAll("photoPath")
    .map((v) => String(v))
    .filter(Boolean);
  if (photoPaths.length > MAX_PHOTOS_PAR_VISITE) {
    return {
      error: `Trop de photos (maximum ${MAX_PHOTOS_PAR_VISITE} par visite).`,
    };
  }
  if (
    photoPaths.some(
      (p) => !p.startsWith(prefixe) || !NOM_PHOTO_RE.test(p.slice(prefixe.length)),
    )
  ) {
    return { error: "Chemin de photo invalide." };
  }

  try {
    const visite = await chargerVisiteConducteur(
      user.id,
      user.organisationId,
      visiteId,
    );
    if (!visite) throw new ErreurMetier("Visite introuvable.");
    if (visite.statut !== "PLANIFIEE") throw new CompteRenduDejaEnvoye();

    await prisma.$transaction(async (tx) => {
      await appliquerCompteRendu(
        tx,
        visite.id,
        visite.dossier.id,
        parsed.payload,
      );
      if (photoPaths.length > 0) {
        await tx.photo.createMany({
          data: photoPaths.map((chemin) => ({ visiteId: visite.id, chemin })),
        });
      }
    });
  } catch (e) {
    if (e instanceof CompteRenduDejaEnvoye) {
      return { error: e.message, code: "DEJA_ENVOYEE" };
    }
    return { error: messageFromError(e) };
  }

  // Le back-office voit le dossier remonter en réception — et les compteurs
  // de la page Statistiques (visites réalisées, flux de statuts) bouger.
  revalidatePath("/app/dossiers");
  revalidatePath("/app/mes-visites");
  revalidatePath("/app/statistiques");
  revalidateTag(dossiersBadgesTag(user.organisationId));
  revalidateTag(statsTag(user.organisationId));
  return { error: null };
}
