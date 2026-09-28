import { BUCKET_SINISTRES } from "@/lib/supabase/bucket";
import { enregistrerPathPhoto, type Brouillon } from "@/lib/brouillon";
import type {
  EnvoiResultat,
  UploadSigne,
} from "@/lib/envoi-compte-rendu";

export type { EnvoiResultat };

// L'envoi passe par des ROUTE HANDLERS (/api/visites/[id]/…) et non des Server
// Actions : leurs IDs changent à chaque déploiement, et un envoi mis en file
// hors-ligne puis rejoué après un déploiement frappait un ID mort (« Failed to
// find Server Action ») — classé réseau, donc « en attente » muet pour
// toujours. Les URLs de routes, elles, survivent aux déploiements.

// Erreur réseau : l'envoi doit être remis en file et rejoué plus tard.
export class ErreurReseau extends Error {}

// Sur iOS (mode avion / réseau fantôme de chantier), un fetch peut RESTER
// SUSPENDU au lieu d'échouer : sans délai dur, « Envoyer » charge indéfiniment.
// Toute attente réseau est donc bornée, puis traitée comme ErreurReseau
// (l'envoi part en file et sera rejoué).
//
// ⚠️ navigator.onLine n'est PAS fiable en PWA installée iOS : il peut rester
// bloqué à false après un mode avion alors que le réseau est revenu. On ne
// s'en sert donc JAMAIS, ni comme verrou ni pour raccourcir un délai : 2,5 s
// suffisait pour une requête légère mais condamnait tout upload photo un peu
// lent lorsque cette valeur restait fausse.
const DELAI_RESEAU_MS = 15_000;

// Délai adapté à la taille avec une hypothèse terrain basse (32 Kio/s),
// borné entre 60 s et 5 min. Les photos sont normalement compressées à ~1 Mo ;
// la borne haute permet toutefois de sauver un ancien brouillon plus lourd.
const DELAI_UPLOAD_MIN_MS = 60_000;
const DELAI_UPLOAD_MAX_MS = 5 * 60_000;
const DEBIT_UPLOAD_PLANCHER_OCTETS_S = 32 * 1024;

function delaiUploadPhotoMs(taille: number): number {
  const estime = 15_000 + (taille / DEBIT_UPLOAD_PLANCHER_OCTETS_S) * 1_000;
  return Math.min(DELAI_UPLOAD_MAX_MS, Math.max(DELAI_UPLOAD_MIN_MS, estime));
}

export async function avecDelai<T>(
  promesse: Promise<T>,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ErreurReseau(message)), DELAI_RESEAU_MS);
  });
  try {
    return await Promise.race([promesse, delai]);
  } finally {
    clearTimeout(timer);
  }
}

function urlUploadSigne(path: string, token: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  return `${base}/storage/v1/object/upload/sign/${BUCKET_SINISTRES}/${path}?token=${encodeURIComponent(token)}`;
}

function detailReponseStorage(xhr: XMLHttpRequest): string | null {
  const texte = xhr.responseText?.trim();
  if (!texte) return null;
  try {
    const json = JSON.parse(texte) as {
      message?: unknown;
      error?: unknown;
      code?: unknown;
    };
    const detail = [json.message, json.error, json.code].find(
      (v): v is string => typeof v === "string" && v.trim().length > 0,
    );
    return detail?.slice(0, 180) ?? null;
  } catch {
    return texte.slice(0, 180);
  }
}

function messageRefusPhoto(status: number, detail: string | null): string {
  if (status === 413) {
    return "Photo trop volumineuse pour être envoyée. Reprenez le brouillon et remplacez-la.";
  }
  if (status === 401 || status === 403) {
    return `Autorisation d'upload photo refusée (HTTP ${status}). Réessayez après avoir rouvert l'application.`;
  }
  if (status === 409) {
    return "Conflit pendant l'upload photo (HTTP 409). Réessayez l'envoi.";
  }
  const suffixe = detail ? ` — ${detail}` : "";
  return `Photo refusée par le stockage (HTTP ${status}).${suffixe}`;
}

export type UploadPhotoProgression = (pourcentage: number) => void;

// Upload binaire commun au formulaire et au rejeu hors-ligne.
//
// Important sur WebKit/iOS : Supabase JS transforme un Blob en FormData. Un
// Blob restauré depuis IndexedDB peut alors produire un multipart vide après
// suspension de la PWA. On matérialise d'abord les octets (ce qui valide aussi
// que le Blob local est encore lisible), puis on envoie l'ArrayBuffer brut.
// L'URL signée est l'autorisation ; aucun secret ni cookie Supabase ne transite.
export async function uploaderPhotoSignee(
  signed: { path: string; token: string },
  blob: Blob,
  onProgression?: UploadPhotoProgression,
): Promise<{ error: string | null }> {
  let octets: ArrayBuffer;
  try {
    octets = await blob.arrayBuffer();
  } catch (cause) {
    console.error("Lecture du Blob photo IndexedDB impossible", {
      cause,
      taille: blob.size,
      type: blob.type,
    });
    return {
      error:
        "La photo enregistrée sur l'appareil est devenue illisible. Reprenez le brouillon et remplacez cette photo.",
    };
  }

  if (blob.size === 0 || octets.byteLength !== blob.size) {
    console.error("Blob photo IndexedDB incomplet", {
      tailleDeclaree: blob.size,
      tailleLue: octets.byteLength,
      type: blob.type,
    });
    return {
      error:
        "La photo enregistrée sur l'appareil est vide ou incomplète. Reprenez le brouillon et remplacez cette photo.",
    };
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", urlUploadSigne(signed.path, signed.token));
    xhr.timeout = delaiUploadPhotoMs(octets.byteLength);
    xhr.setRequestHeader("content-type", "image/jpeg");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgression?.(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ error: null });
        return;
      }

      if (xhr.status === 0) {
        reject(
          new ErreurReseau(
            `La réponse de l'upload photo n'a pas pu être lue (${octets.byteLength} octets).`,
          ),
        );
        return;
      }

      const detail = detailReponseStorage(xhr);
      console.error("Upload photo Storage refusé", {
        status: xhr.status,
        detail,
        taille: octets.byteLength,
      });

      if (
        xhr.status === 408 ||
        xhr.status === 425 ||
        xhr.status === 429 ||
        xhr.status >= 500
      ) {
        reject(
          new ErreurReseau(
            `Stockage photo temporairement indisponible (HTTP ${xhr.status}).`,
          ),
        );
        return;
      }
      resolve({ error: messageRefusPhoto(xhr.status, detail) });
    };
    xhr.onerror = () =>
      reject(new ErreurReseau("Coupure réseau pendant l'upload photo."));
    xhr.onabort = () =>
      reject(new ErreurReseau("Upload photo interrompu avant la fin."));
    xhr.ontimeout = () =>
      reject(
        new ErreurReseau(
          `Upload photo trop long (${Math.round(xhr.timeout / 1_000)} s).`,
        ),
      );
    xhr.send(octets);
  });
}

// POST vers une route d'ingestion, borné par le délai dur, avec classement
// explicite de chaque issue :
//   - fetch qui lève / délai dépassé  -> ErreurReseau (rejouable) ;
//   - 401 (session expirée)           -> refus métier affiché, relance manuelle ;
//   - autre statut HTTP non-2xx       -> ErreurReseau AVEC le statut visible
//     (un 500 transitoire se rejoue ; la cause est montrée, jamais muette) ;
//   - 2xx                             -> JSON métier de la route.
async function posterVersRoute<T>(
  url: string,
  body: FormData | null,
  messageDelai: string,
): Promise<T | { error: string }> {
  let res: Response;
  try {
    res = await avecDelai(
      fetch(url, { method: "POST", body }),
      messageDelai,
    );
  } catch (e) {
    if (e instanceof ErreurReseau) throw e;
    throw new ErreurReseau(messageDelai);
  }

  if (res.status === 401 || res.status === 403) {
    const corps = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    return {
      error:
        corps?.error ??
        "Session expirée : rouvrez l'application pour vous reconnecter, puis réessayez.",
    };
  }
  if (!res.ok) {
    throw new ErreurReseau(`Serveur indisponible (HTTP ${res.status}).`);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ErreurReseau("Réponse du serveur illisible.");
  }
}

// Mine une URL signée d'upload pour une photo de la visite.
export async function creerUrlUploadPhoto(
  visiteId: string,
): Promise<UploadSigne> {
  return posterVersRoute<UploadSigne>(
    `/api/visites/${visiteId}/upload-photo`,
    null,
    "Signature de l'upload trop longue.",
  );
}

// Envoie un brouillon complet : upload d'abord les photos sans chemin (via URL
// signée), puis poste le compte-rendu. Distingue trois issues :
//   - throw ErreurReseau            -> hors-ligne / injoignable : à rejouer.
//   - return { error }              -> refus métier/validation : NE PAS rejouer.
//   - return { code: "DEJA_ENVOYEE" } -> au rejeu, à traiter comme un succès.
// Réutilisé par le formulaire (envoi direct) et par la sync globale (lib/sync).
// `onPhotoUploadee` : notifie l'appelant du chemin attribué à chaque photo
// uploadée (le formulaire patche son état React, sinon un retry après refus
// métier repartirait de `path: null` et ré-uploaderait).
export async function envoyerBrouillon(
  b: Brouillon,
  onPhotoUploadee?: (photoId: string, path: string) => void,
): Promise<EnvoiResultat> {
  // On tente TOUJOURS le réseau (navigator.onLine ment parfois en PWA iOS) :
  // vraiment hors-ligne, le fetch échoue ou le délai borné tranche.
  const photoPaths: string[] = [];

  for (const [index, photo] of b.photos.entries()) {
    if (photo.path) {
      photoPaths.push(photo.path);
      continue;
    }
    // Signature (peut refuser pour raison métier : visite déjà réalisée…).
    const signed = await creerUrlUploadPhoto(b.visiteId);
    if ("error" in signed) return { error: signed.error, code: signed.code };

    let resultatUpload: { error: string | null };
    try {
      resultatUpload = await uploaderPhotoSignee(signed, photo.blob);
    } catch (err) {
      if (err instanceof ErreurReseau) {
        throw new ErreurReseau(
          `Photo ${index + 1}/${b.photos.length} : ${err.message}`,
        );
      }
      throw err;
    }
    if (resultatUpload.error) {
      return {
        error: `Photo ${index + 1}/${b.photos.length} : ${resultatUpload.error}`,
      };
    }

    // L'objet est dans le bucket : on grave son chemin PARTOUT où ce brouillon
    // vit (objet en mémoire, autosave, file d'envoi) AVANT de continuer. Si la
    // suite échoue (photo suivante, POST final), le rejeu réutilise l'objet
    // déjà uploadé au lieu d'en accumuler des orphelins.
    photo.path = signed.path;
    try {
      await enregistrerPathPhoto(b.visiteId, photo.id, signed.path);
    } catch (e) {
      // IndexedDB indisponible : l'envoi continue (au pire, on ré-uploade).
      console.error("Persistance du chemin photo :", e);
    }
    onPhotoUploadee?.(photo.id, signed.path);
    photoPaths.push(signed.path);
  }

  const fd = new FormData();
  for (const p of b.champs.pieces) if (p.trim()) fd.append("piece", p.trim());
  fd.set("tauxHumidite", b.champs.taux);
  fd.set("joursReparationEstimes", b.champs.jours);
  fd.set("resume", b.champs.resume);
  fd.set("conclusion", b.champs.conclusion);
  for (const p of photoPaths) fd.append("photoPath", p);

  return posterVersRoute<EnvoiResultat>(
    `/api/visites/${b.visiteId}/compte-rendu`,
    fd,
    "Envoi du compte-rendu trop long.",
  );
}
