import { createStore, del, delMany, get, keys, set, type UseStore } from "idb-keyval";

// Persistance locale (IndexedDB) du compte-rendu terrain : autosave du brouillon
// en cours + file des envois échoués rejoués au retour du réseau. Navigateur
// uniquement (idb-keyval). 1 seul auteur par visite -> aucune gestion de conflit.

// Safari / PWA iOS : après une suspension, la connexion IndexedDB peut mourir
// (« Connection to Indexed Database server lost ») sans qu'idb-keyval ne la
// rouvre — chaque lecture/écriture échoue alors jusqu'au rechargement, et
// l'autosave perdait la saisie en silence. Toute opération passe donc par
// `idb()` : en cas d'échec, connexion NEUVE puis UN nouvel essai (toutes nos
// opérations sont idempotentes). Même base/magasin que le store par défaut
// d'idb-keyval : les données déjà écrites sont conservées.
let magasin: UseStore | null = null;

// Délai maximal d'une opération : une connexion morte peut aussi PENDRE au
// lieu d'échouer — sans borne, la fiche restait verrouillée « en lecture ».
const DELAI_IDB_MS = 5_000;

function borne<T>(promesse: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("IndexedDB ne répond pas.")),
      DELAI_IDB_MS,
    );
  });
  return Promise.race([promesse, delai]).finally(() => clearTimeout(timer));
}

function idb<T>(op: (store: UseStore) => Promise<T>): Promise<T> {
  return suivreEcriture(
    (async () => {
      magasin ??= createStore("keyval-store", "keyval");
      try {
        return await borne(op(magasin));
      } catch (err) {
        console.warn("IndexedDB : nouvel essai sur une connexion neuve.", err);
        magasin = createStore("keyval-store", "keyval");
        return borne(op(magasin));
      }
    })(),
  );
}

// --- Écritures en vol ----------------------------------------------------------
// Un rechargement de la page (mise à jour de la PWA) pendant une écriture
// IndexedDB l'annule : la dernière frappe serait perdue. Toute opération
// locale est suivie ici, et pwa-update.tsx attend qu'elles aboutissent (avec
// un plafond) avant de recharger. Le formulaire y inscrit aussi sa chaîne
// d'écritures (dont celles pas encore commencées).
const enVol = new Set<Promise<unknown>>();

export function suivreEcriture<T>(promesse: Promise<T>): Promise<T> {
  enVol.add(promesse);
  const fin = () => enVol.delete(promesse);
  promesse.then(fin, fin);
  return promesse;
}

export async function attendreEcrituresLocales(maxMs = 3_000): Promise<void> {
  const limite = Date.now() + maxMs;
  while (enVol.size > 0) {
    const reste = limite - Date.now();
    if (reste <= 0) return;
    await Promise.race([
      Promise.allSettled([...enVol]),
      new Promise((r) => setTimeout(r, reste)),
    ]);
  }
}

export type PhotoBrouillon = {
  id: string;
  blob: Blob; // photo compressée
  path: string | null; // chemin d'objet si déjà uploadée, sinon à uploader au rejeu
};

export type ChampsBrouillon = {
  pieces: string[];
  taux: string;
  jours: string;
  resume: string;
  conclusion: string;
};

export type Brouillon = {
  visiteId: string;
  // Libellé humain (nom client) pour la file d'attente visible — absent des
  // anciens brouillons.
  titre?: string;
  champs: ChampsBrouillon;
  photos: PhotoBrouillon[];
  updatedAt: number;
};

// Forme STOCKÉE du brouillon : les photos n'y portent que leur id et leur
// chemin ; leurs octets vivent chacun sous leur propre clé (PHOTO_PREFIX),
// écrits UNE fois à l'ajout. Avant ce découpage, chaque autosave (à chaque
// pause de frappe) réécrivait tous les Blobs : lent, et un seul Blob devenu
// illisible (suspension iOS) faisait échouer TOUTE la sauvegarde — texte
// compris. Les anciens brouillons portent encore le Blob en ligne : relus
// tels quels puis migrés (chargerBrouillon).
type PhotoStockee = { id: string; path: string | null; blob?: Blob };
type BrouillonStocke = Omit<Brouillon, "photos"> & { photos: PhotoStockee[] };

// Brouillon relu : `photosPerdues` = photos listées dont les octets n'ont pas
// pu être relus (app tuée pendant l'ajout…) — signalées au conducteur.
export type BrouillonCharge = Brouillon & { photosPerdues: number };

const DRAFT_PREFIX = "cr-brouillon:";
const PHOTO_PREFIX = "cr-photo:";
const QUEUE_PREFIX = "cr-envoi:";

function clePhoto(visiteId: string, photoId: string): string {
  return `${PHOTO_PREFIX}${visiteId}:${photoId}`;
}

// --- Brouillon en cours d'édition (autosave) ---------------------------------

// Champs texte + liste des photos, SANS leurs octets : c'est l'écriture
// fréquente de l'autosave, elle reste légère.
export function sauverChampsBrouillon(b: Brouillon): Promise<void> {
  const stocke: BrouillonStocke = {
    ...b,
    photos: b.photos.map(({ id, path }) => ({ id, path })),
  };
  return idb((s) => set(DRAFT_PREFIX + b.visiteId, stocke, s));
}

// Octets d'une photo du brouillon — écrits une fois, à l'ajout.
export function sauverPhotoBrouillon(
  visiteId: string,
  photoId: string,
  blob: Blob,
): Promise<void> {
  return idb((s) => set(clePhoto(visiteId, photoId), blob, s));
}

export function retirerPhotoBrouillon(
  visiteId: string,
  photoId: string,
): Promise<void> {
  return idb((s) => del(clePhoto(visiteId, photoId), s));
}

// Brouillon COMPLET (octets de chaque photo + champs) — utilisé pour remettre
// un envoi de la file en brouillon. Une photo DÉJÀ uploadée dont les octets
// ne peuvent plus être écrits est tolérée (son chemin suffit à l'envoi) ; une
// photo pas encore uploadée, non : on lève, et l'appelant garde l'envoi dans
// la file — c'est la seule copie de ses octets.
export async function sauverBrouillon(b: Brouillon): Promise<void> {
  for (const p of b.photos) {
    try {
      await sauverPhotoBrouillon(b.visiteId, p.id, p.blob);
    } catch (err) {
      console.error("Photo du brouillon non enregistrée :", p.id, err);
      if (!p.path) throw err;
    }
  }
  await sauverChampsBrouillon(b);
}

// Un brouillon est-il enregistré pour cette visite ? (lecture légère, sans
// les photos — garde anti-écrasement du formulaire).
export async function brouillonExiste(visiteId: string): Promise<boolean> {
  return (await idb((s) => get(DRAFT_PREFIX + visiteId, s))) !== undefined;
}

export async function chargerBrouillon(
  visiteId: string,
): Promise<BrouillonCharge | undefined> {
  const stocke = await idb((s) =>
    get<BrouillonStocke>(DRAFT_PREFIX + visiteId, s),
  );
  if (!stocke) return undefined;

  const photos: PhotoBrouillon[] = [];
  let photosPerdues = 0;
  for (const p of stocke.photos) {
    let blob = await idb((s) => get<Blob>(clePhoto(visiteId, p.id), s)).catch(
      (err) => {
        console.error("Lecture d'une photo du brouillon :", p.id, err);
        return undefined;
      },
    );
    if (!blob && p.blob) {
      // Ancien format (Blob en ligne) : migré sous sa propre clé, sinon la
      // prochaine sauvegarde des champs (sans octets) le perdrait.
      blob = p.blob;
      await sauverPhotoBrouillon(visiteId, p.id, blob).catch((err) =>
        console.error("Migration d'une photo du brouillon :", p.id, err),
      );
    }
    if (blob) {
      photos.push({ id: p.id, path: p.path, blob });
    } else if (p.path) {
      // Déjà uploadée : le chemin suffit à l'envoi, seul l'aperçu manque.
      photos.push({ id: p.id, path: p.path, blob: new Blob([], { type: "image/jpeg" }) });
    } else {
      photosPerdues++;
    }
  }
  return { ...stocke, photos, photosPerdues };
}

export async function effacerBrouillon(visiteId: string): Promise<void> {
  await idb((s) => del(DRAFT_PREFIX + visiteId, s));
  const prefixe = `${PHOTO_PREFIX}${visiteId}:`;
  const cles = (await idb((s) => keys(s))).filter(
    (k): k is string => typeof k === "string" && k.startsWith(prefixe),
  );
  if (cles.length > 0) await idb((s) => delMany(cles, s));
}

// --- File d'envois en attente (rejoués par lib/sync.ts) ----------------------
// Chaque entrée porte un statut honnête, montré tel quel à l'utilisateur :
//   EN_ATTENTE — sera envoyée au prochain passage de sync (réseau revenu…)
//   ENVOI      — envoi en cours
//   ERREUR     — refus métier ou erreur inattendue : jamais rejouée
//                automatiquement, l'utilisateur choisit (réessayer/brouillon).
export type EnvoiStatut = "EN_ATTENTE" | "ENVOI" | "ERREUR";

export type EnvoiEnFile = {
  brouillon: Brouillon;
  statut: EnvoiStatut;
  tentatives: number;
  derniereErreur: string | null;
  misEnFileLe: number;
};

export function enfilerEnvoi(b: Brouillon): Promise<void> {
  return idb((s) =>
    set(
      QUEUE_PREFIX + b.visiteId,
      {
        brouillon: b,
        statut: "EN_ATTENTE",
        tentatives: 0,
        derniereErreur: null,
        misEnFileLe: Date.now(),
      } satisfies EnvoiEnFile,
      s,
    ),
  );
}

export async function mettreAJourEnvoi(
  visiteId: string,
  patch: Partial<Pick<EnvoiEnFile, "statut" | "tentatives" | "derniereErreur">>,
): Promise<void> {
  const brut = await idb((s) => get(QUEUE_PREFIX + visiteId, s));
  const envoi = normaliserEnvoi(brut);
  if (!envoi) return;
  await idb((s) => set(QUEUE_PREFIX + visiteId, { ...envoi, ...patch }, s));
}

export function retirerEnvoi(visiteId: string): Promise<void> {
  return idb((s) => del(QUEUE_PREFIX + visiteId, s));
}

// Réécrit le chemin d'objet d'une photo UPLOADÉE partout où le brouillon est
// persisté (autosave + file d'envoi). Sans ça, un envoi qui échoue APRÈS
// l'upload (refus métier, réseau tombé sur le POST final) rejouait avec
// `path: null` et ré-uploadait la photo à chaque tentative — l'objet précédent
// restait orphelin dans le bucket.
export async function enregistrerPathPhoto(
  visiteId: string,
  photoId: string,
  path: string,
): Promise<void> {
  const poserPath = <B extends { photos: PhotoStockee[] }>(b: B): B => ({
    ...b,
    photos: b.photos.map((p) => (p.id === photoId ? { ...p, path } : p)),
  });
  const brouillon = await idb((s) =>
    get<BrouillonStocke>(DRAFT_PREFIX + visiteId, s),
  );
  if (brouillon) {
    await idb((s) => set(DRAFT_PREFIX + visiteId, poserPath(brouillon), s));
  }
  const envoi = normaliserEnvoi(await idb((s) => get(QUEUE_PREFIX + visiteId, s)));
  if (envoi) {
    await idb((s) =>
      set(
        QUEUE_PREFIX + visiteId,
        { ...envoi, brouillon: poserPath(envoi.brouillon) },
        s,
      ),
    );
  }
}

export async function listerEnvois(): Promise<EnvoiEnFile[]> {
  const toutes = await idb((s) => keys(s));
  const cibles = toutes.filter(
    (k): k is string => typeof k === "string" && k.startsWith(QUEUE_PREFIX),
  );
  const entrees = await Promise.all(cibles.map((k) => idb((s) => get(k, s))));
  return entrees
    .map(normaliserEnvoi)
    .filter((e): e is EnvoiEnFile => e != null)
    .sort((a, b) => a.misEnFileLe - b.misEnFileLe);
}

// Les entrées écrites avant l'ajout des statuts étaient des Brouillon nus :
// on les enveloppe à la lecture (migration paresseuse, rien à perdre).
function normaliserEnvoi(brut: unknown): EnvoiEnFile | null {
  if (brut == null || typeof brut !== "object") return null;
  if ("brouillon" in brut) return brut as EnvoiEnFile;
  const b = brut as Brouillon;
  if (!b.visiteId) return null;
  return {
    brouillon: b,
    statut: "EN_ATTENTE",
    tentatives: 0,
    derniereErreur: null,
    misEnFileLe: b.updatedAt ?? Date.now(),
  };
}
