"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  CloudUpload,
  Droplets,
  FilePenLine,
  ImagePlus,
  RefreshCw,
  Send,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  type Brouillon,
  type ChampsBrouillon,
  type EnvoiEnFile,
  brouillonExiste,
  chargerBrouillon,
  effacerBrouillon,
  retirerPhotoBrouillon,
  sauverChampsBrouillon,
  sauverPhotoBrouillon,
  suivreEcriture,
} from "@/lib/brouillon";
import {
  enfiler,
  reessayer,
  remettreEnBrouillon,
  useSyncEnvois,
} from "@/lib/sync";
import {
  LIMITES_COMPTE_RENDU,
  MAX_PHOTOS_PAR_VISITE,
  PIECES_SUGGEREES,
  validerCompteRendu,
} from "@/lib/metier";
import { ChipsInput } from "@/components/ui/chips-input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/ui";
import { BarreVisite } from "./actions-buttons";
import {
  creerUrlUploadPhoto,
  envoyerBrouillon,
  ErreurReseau,
  uploaderPhotoSignee,
} from "./envoi";

// Gros contrôles terrain : hauteur 48 px, texte 16 px (évite aussi le zoom
// automatique d'iOS sur les champs < 16 px).
const inputClass =
  "h-12 w-full rounded-md border border-neutral-300 bg-white px-3 text-base text-neutral-900 shadow-xs transition-colors placeholder:text-neutral-400 hover:border-neutral-400";
const textareaClass =
  "min-h-28 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-base leading-relaxed text-neutral-900 shadow-xs transition-colors placeholder:text-neutral-400 hover:border-neutral-400";

// Options de compression client : ~1 Mo max, 1920px max, JPEG, web worker.
const COMPRESSION_OPTS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  fileType: "image/jpeg",
  useWebWorker: true,
};

// Garde-fou quand la compression échoue : au-delà de cette taille, l'original
// est REFUSÉ (brouillon IndexedDB et upload mobile déraisonnables) au lieu
// d'être gardé tel quel. 15 Mo couvre les JPEG 48 Mpx des téléphones récents
// (dont la compression peut échouer) tout en bloquant les fichiers absurdes.
const MAX_PHOTO_ORIGINALE_OCTETS = 15 * 1024 * 1024;

// Déclencheurs photo (caméra / galerie) : même style que l'ancien bouton
// d'ajout unique, en deux moitiés côte à côte.
const photoTriggerClass =
  "flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 bg-white px-3 py-3 text-center text-sm font-medium text-neutral-700 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-900";

// Empêche la touche Entrée de soumettre le formulaire depuis un champ mono-ligne
// (piège classique sur mobile où la touche « OK » du clavier valide le form).
function bloquerEntree(e: React.KeyboardEvent) {
  if (e.key === "Enter") e.preventDefault();
}

// Débounce de l'autosave : écrit 500 ms après la dernière modification — et
// IMMÉDIATEMENT quand l'app passe en arrière-plan ou que l'on quitte la page
// (voir `viderAutosave`), sinon la dernière frappe était perdue.
const DELAI_AUTOSAVE_MS = 500;
// Nouvel essai automatique d'une sauvegarde locale qui a échoué.
const DELAI_NOUVEL_ESSAI_MS = 3_000;

// Photos compressées + uploadées 2 par 2 : sélectionner 10 photos de la
// galerie lançait 10 compressions simultanées (une image 12 Mpx décodée pèse
// ~50 Mo) — de quoi faire tuer la page par iOS sur un téléphone modeste.
const TRAITEMENTS_PHOTO_SIMULTANES = 2;

// Empreinte de ce que l'autosave écrit (champs + photos, sans les octets) :
// on n'écrit que sur une VRAIE modification. Ouvrir une fiche n'écrit donc
// jamais de brouillon, et un re-rendu sans changement ne réécrit rien.
function empreinte(
  champs: ChampsBrouillon,
  photos: { id: string; path: string | null }[],
): string {
  return JSON.stringify([champs, photos.map((p) => [p.id, p.path])]);
}

type EtatSauvegarde = "inactif" | "enregistre" | "erreur";

type PhotoItem = {
  id: string;
  previewUrl: string;
  blob: Blob;
  path: string | null;
  // "attente" = pas d'upload possible pour l'instant (hors-ligne) : PAS une
  // erreur — la photo partira automatiquement avec l'envoi du compte-rendu.
  status: "uploading" | "done" | "attente" | "error";
  // Pourcentage d'upload en cours (affiché sur l'overlay pendant "uploading").
  progression?: number;
};

export function TerrainForm({
  visiteId,
  nomClient,
  telephone,
  adresse,
  piecesInitiales = [],
}: {
  visiteId: string;
  nomClient: string;
  telephone: string;
  adresse: string;
  // Pièces relevées à la visite précédente (contre-visite) : point de départ
  // de la saisie UNIQUEMENT si aucun brouillon local n'existe — le brouillon
  // prime toujours.
  piecesInitiales?: string[];
}) {
  const router = useRouter();
  const [pieces, setPieces] = useState<string[]>([]);
  const [taux, setTaux] = useState("");
  const [jours, setJours] = useState("");
  const [resume, setResume] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmerEnvoi, setConfirmerEnvoi] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [sauvegarde, setSauvegarde] = useState<EtatSauvegarde>("inactif");
  const [pending, startTransition] = useTransition();
  const messagesRef = useRef<HTMLDivElement>(null);
  // Figées au premier rendu : le pré-remplissage ne concerne que l'ouverture
  // d'une contre-visite vierge, jamais une saisie en cours.
  const piecesInitialesRef = useRef(piecesInitiales);
  // Vrai dès que l'envoi a abouti (ou est parti en file) : coupe l'autosave.
  // Relu AU MOMENT D'ÉCRIRE (pas seulement quand l'écriture est programmée) :
  // un débounce armé juste avant la fin de l'envoi — patchPhoto retouche
  // l'état pendant l'upload — ressuscitait sinon le brouillon APRÈS
  // effacerBrouillon.
  const envoyeRef = useRef(false);
  // Monté ? Les traitements photo en file s'arrêtent si on quitte la page.
  const monteRef = useRef(true);
  // Photos courantes, lues par les traitements asynchrones (une photo
  // retirée pendant qu'elle attend son tour n'est ni compressée ni uploadée).
  const photosRef = useRef<PhotoItem[]>([]);
  photosRef.current = photos;

  // --- Écritures locales (IndexedDB) ---------------------------------------
  // Toutes sérialisées dans une chaîne : l'ordre d'écriture = l'ordre des
  // modifications (une écriture ancienne ne peut jamais écraser une récente),
  // et l'effacement final passe APRÈS toute écriture en vol.
  const chaineRef = useRef<Promise<unknown>>(Promise.resolve());
  const ecrituresEnVolRef = useRef(0);
  // Écritures en échec, par clé (« champs », « photo:<id> ») : l'état affiché
  // reste « Non enregistré » tant qu'UNE d'elles n'est pas réglée — une photo
  // non écrite n'est plus masquée par la sauvegarde réussie du texte.
  const echecsRef = useRef(new Set<string>());
  const ecrireEnOrdre = useCallback(
    (cle: string, op: () => Promise<void>) => {
      ecrituresEnVolRef.current++;
      const suite = chaineRef.current.then(async () => {
        try {
          await op();
          echecsRef.current.delete(cle);
        } catch (err) {
          echecsRef.current.add(cle);
          console.error("Brouillon local non enregistré :", cle, err);
        }
        if (--ecrituresEnVolRef.current === 0 || echecsRef.current.size > 0) {
          setSauvegarde(echecsRef.current.size > 0 ? "erreur" : "enregistre");
        }
      });
      chaineRef.current = suite;
      // Suivie globalement : une mise à jour de la PWA attend sa fin avant de
      // recharger la page (pwa-update.tsx).
      return suivreEcriture(suite);
    },
    [],
  );

  // Brouillon en attente d'écriture (débounce) + son minuteur.
  const aEcrireRef = useRef<Brouillon | null>(null);
  const minuteurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Empreinte du dernier état écrit ou relu (cf. empreinte()).
  const empreinteRef = useRef<string | null>(null);
  // Photos retirées dont les octets restent à effacer : APRÈS la réécriture
  // du brouillon qui ne les liste plus (sinon, app tuée entre les deux, la
  // relecture les signalerait « perdues » à tort).
  const photosARetirerRef = useRef<string[]>([]);
  // La relecture du brouillon a échoué : un brouillon enregistré existe
  // peut-être. Tant que ce n'est pas tranché, l'autosave NE L'ÉCRASE PAS
  // (sinon des champs vides remplaçaient silencieusement le vrai brouillon
  // dès que IndexedDB répondait de nouveau).
  const lectureEchoueeRef = useRef(false);
  const [lectureEchouee, setLectureEchouee] = useState(false);
  // Incrémenté pour relancer la relecture du brouillon (bouton « Récupérer »).
  const [relecture, setRelecture] = useState(0);
  const viderAutosaveRef = useRef<() => void>(() => {});

  const viderAutosave = useCallback(() => {
    if (minuteurRef.current) {
      clearTimeout(minuteurRef.current);
      minuteurRef.current = null;
    }
    const b = aEcrireRef.current;
    aEcrireRef.current = null;
    if (!b) return;
    const aRetirer = photosARetirerRef.current;
    photosARetirerRef.current = [];
    void ecrireEnOrdre("champs", async () => {
      if (envoyeRef.current) return;
      // Tout échec RÉARME l'écriture (la frappe n'est jamais jetée) : nouvel
      // essai au passage en arrière-plan, et automatique sauf si l'on attend
      // que l'utilisateur récupère un brouillon non relu.
      const rearmer = (nouvelEssai: boolean) => {
        aEcrireRef.current ??= b;
        empreinteRef.current = null;
        photosARetirerRef.current.unshift(...aRetirer);
        if (nouvelEssai && monteRef.current && !minuteurRef.current) {
          minuteurRef.current = setTimeout(
            () => viderAutosaveRef.current(),
            DELAI_NOUVEL_ESSAI_MS,
          );
        }
      };
      let enAttenteDeRecuperation = false;
      try {
        if (lectureEchoueeRef.current) {
          if (await brouillonExiste(b.visiteId)) {
            // Un brouillon enregistré n'a pas été relu : on ne l'écrase pas.
            // L'utilisateur le récupère par le bouton du bandeau.
            enAttenteDeRecuperation = true;
            throw new Error("Brouillon enregistré non relu : écriture suspendue.");
          }
          // Aucun brouillon n'existait : rien à perdre, l'autosave reprend.
          lectureEchoueeRef.current = false;
          setLectureEchouee(false);
        }
        await sauverChampsBrouillon(b);
      } catch (err) {
        rearmer(!enAttenteDeRecuperation);
        throw err;
      }
      for (const id of aRetirer) {
        await retirerPhotoBrouillon(b.visiteId, id).catch((err) =>
          console.error("Octets d'une photo retirée non effacés :", id, err),
        );
      }
    });
  }, [ecrireEnOrdre]);
  useEffect(() => {
    viderAutosaveRef.current = viderAutosave;
  }, [viderAutosave]);

  // Efface le brouillon local une fois le compte-rendu parti (ou en file) :
  // coupe l'autosave, jette l'écriture en attente, puis efface APRÈS les
  // écritures déjà en vol.
  const effacerLocal = useCallback(async () => {
    envoyeRef.current = true;
    aEcrireRef.current = null;
    if (minuteurRef.current) clearTimeout(minuteurRef.current);
    await chaineRef.current;
    await effacerBrouillon(visiteId).catch((err) =>
      console.error("Effacement du brouillon local :", err),
    );
  }, [visiteId]);

  // Photos : octets écrits DÈS la sélection (fichier d'origine), puis
  // remplacés par la version compressée. Pas conditionné à la fiche montée :
  // quitter la page (ou iOS qui tue l'app) pendant qu'une photo attend son
  // tour de compression ne la perd plus.
  const persisterPhoto = (id: string, blob: Blob) =>
    void ecrireEnOrdre(`photo:${id}`, async () => {
      if (!envoyeRef.current) await sauverPhotoBrouillon(visiteId, id, blob);
    });

  // Compte-rendu déjà mis en file d'attente locale pour cette visite : on
  // remplace le formulaire par l'état d'envoi (voir EnvoiEnAttente plus bas).
  const { envois } = useSyncEnvois();
  const enFile = envois.find((e) => e.brouillon.visiteId === visiteId) ?? null;
  const horsFile = enFile === null;
  // Cette fiche a-t-elle affiché un envoi en file ? Permet de distinguer, quand
  // l'envoi quitte la file, « repris en brouillon » (un brouillon existe) de
  // « envoyé par la sync » (plus rien : la visite est réalisée).
  const etaitEnFileRef = useRef(false);
  const [photosPerdues, setPhotosPerdues] = useState(0);

  // Hydratation depuis le brouillon local (reprise après fermeture/crash) —
  // re-exécutée quand un envoi en file est « repris en brouillon ».
  useEffect(() => {
    if (!horsFile) {
      etaitEnFileRef.current = true;
      return;
    }
    let alive = true;
    chargerBrouillon(visiteId)
      .then((b) => {
        if (!alive) return;
        // Relecture aboutie : plus aucun risque d'écraser un brouillon non lu.
        lectureEchoueeRef.current = false;
        setLectureEchouee(false);
        if (b) {
          // L'état affiché EST désormais le brouillon relu : toute écriture
          // en attente (frappe pendant la relecture) décrit un état périmé.
          aEcrireRef.current = null;
          if (minuteurRef.current) {
            clearTimeout(minuteurRef.current);
            minuteurRef.current = null;
          }
          echecsRef.current.clear();
          // Brouillon présent (dont « repris en brouillon ») : la saisie
          // reprend, l'autosave aussi.
          envoyeRef.current = false;
          // Les anciens brouillons (champs texte) peuvent contenir des vides.
          const champs: ChampsBrouillon = {
            ...b.champs,
            pieces: b.champs.pieces.filter((p) => p.trim()),
          };
          setPieces(champs.pieces);
          setTaux(champs.taux);
          setJours(champs.jours);
          setResume(champs.resume);
          setConclusion(champs.conclusion);
          setPhotos((prev) => {
            for (const p of prev) URL.revokeObjectURL(p.previewUrl);
            return b.photos.map((p) => ({
              id: p.id,
              blob: p.blob,
              path: p.path,
              previewUrl: URL.createObjectURL(p.blob),
              // Pas encore uploadée -> en attente (elle partira avec l'envoi).
              status: p.path ? "done" : "attente",
            }));
          });
          setPhotosPerdues(b.photosPerdues);
          // Photos perdues : empreinte vidée pour réécrire tout de suite un
          // brouillon qui ne les liste plus (alerte montrée une seule fois).
          empreinteRef.current =
            b.photosPerdues > 0 ? null : empreinte(champs, b.photos);
          setSauvegarde("enregistre");
        } else if (etaitEnFileRef.current) {
          // L'envoi en file vient d'aboutir (la sync a retiré l'envoi ET
          // effacé le brouillon) : la visite est réalisée, rien à sauvegarder.
          envoyeRef.current = true;
        } else {
          // Contre-visite SANS brouillon : repartir des pièces de la visite
          // précédente. Éditables comme d'habitude, persistées par
          // l'autosave dès la première VRAIE modification.
          const pieces = piecesInitialesRef.current.filter((p) => p.trim());
          if (pieces.length > 0) setPieces(pieces);
          empreinteRef.current = empreinte(
            { pieces, taux: "", jours: "", resume: "", conclusion: "" },
            [],
          );
        }
      })
      .catch((err) => {
        // Lecture impossible même après reconnexion (et délai) : on laisse
        // saisir (la saisie est envoyable), on le dit — jamais d'échec muet —
        // et l'autosave n'écrasera pas un brouillon qui existerait.
        console.error("Lecture du brouillon local :", err);
        if (!alive) return;
        lectureEchoueeRef.current = true;
        setLectureEchouee(true);
      })
      .finally(() => {
        if (alive) setHydrated(true);
      });
    return () => {
      alive = false;
    };
  }, [visiteId, horsFile, relecture]);

  // Autosave (débounce) une fois l'hydratation faite, sur vraie modification.
  useEffect(() => {
    if (!hydrated || !horsFile || envoyeRef.current) return;
    const champs: ChampsBrouillon = { pieces, taux, jours, resume, conclusion };
    const cle = empreinte(champs, photos);
    if (cle === empreinteRef.current) return;
    empreinteRef.current = cle;
    aEcrireRef.current = {
      visiteId,
      titre: nomClient,
      champs,
      photos: photos.map((p) => ({ id: p.id, blob: p.blob, path: p.path })),
      updatedAt: Date.now(),
    };
    if (minuteurRef.current) clearTimeout(minuteurRef.current);
    minuteurRef.current = setTimeout(viderAutosave, DELAI_AUTOSAVE_MS);
  }, [hydrated, horsFile, visiteId, nomClient, pieces, taux, jours, resume, conclusion, photos, viderAutosave]);

  // Écriture immédiate quand l'app passe en arrière-plan (iOS peut la tuer
  // sans autre préavis) et quand on quitte la fiche (navigation) : le
  // débounce en cours n'est plus jeté.
  useEffect(() => {
    const surVisibilite = () => {
      if (document.visibilityState === "hidden") viderAutosave();
    };
    document.addEventListener("visibilitychange", surVisibilite);
    window.addEventListener("pagehide", viderAutosave);
    return () => {
      document.removeEventListener("visibilitychange", surVisibilite);
      window.removeEventListener("pagehide", viderAutosave);
      viderAutosave();
    };
  }, [viderAutosave]);

  // Démontage : stoppe les traitements photo en file, libère les aperçus.
  useEffect(() => {
    monteRef.current = true;
    return () => {
      monteRef.current = false;
      for (const p of photosRef.current) URL.revokeObjectURL(p.previewUrl);
    };
  }, []);

  // Le bouton Envoyer vit dans la barre sticky : si l'utilisateur est en haut
  // de page, un refus doit rester visible — on amène le message à l'écran.
  useEffect(() => {
    if (error) {
      messagesRef.current?.scrollIntoView({ block: "center" });
    }
  }, [error]);

  const patchPhoto = (id: string, patch: Partial<PhotoItem>) =>
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  // Progression d'upload : ne patche que si la photo est TOUJOURS en envoi —
  // un XHR qui continue après le délai dur ne doit pas réveiller une vignette
  // déjà passée « en attente ».
  const patchProgression = (id: string, progression: number) =>
    setPhotos((prev) =>
      prev.map((p) =>
        p.id === id && p.status === "uploading" ? { ...p, progression } : p,
      ),
    );

  // Compresse puis upload une photo via URL signée. Met à jour son statut.
  // Hors-ligne (ou réseau qui pend, classique iOS en mode avion) : la photo
  // passe simplement « en attente » — compressée, stockée dans le brouillon,
  // uploadée avec l'envoi du compte-rendu. Ce n'est PAS une erreur.
  async function uploadPhoto(item: PhotoItem, original: File) {
    // Retirée pendant qu'elle attendait son tour, ou fiche quittée : rien à faire.
    const toujoursLa = () =>
      monteRef.current && photosRef.current.some((p) => p.id === item.id);
    if (!toujoursLa()) return;

    let compressed: Blob = original;
    try {
      // Import paresseux : browser-image-compression (~50 kB) ne sert qu'à
      // l'ajout de photo — inutile de le charger avec la page. Le module est
      // mis en cache après le premier ajout ; un échec de chargement (réseau)
      // tombe dans le même catch que la compression elle-même.
      const { default: imageCompression } = await import(
        "browser-image-compression"
      );
      compressed = await imageCompression(original, COMPRESSION_OPTS);
      patchPhoto(item.id, { blob: compressed });
    } catch (err) {
      // Compression impossible (format exotique…).
      console.error("compression photo", err);
      if (original.size > MAX_PHOTO_ORIGINALE_OCTETS) {
        // Sans compression, un original > 15 Mo est refusé net (brouillon
        // IndexedDB et upload mobile déraisonnables) plutôt que gardé tel quel.
        removePhoto(item.id);
        setError(
          "Photo refusée : impossible de la compresser et elle dépasse 15 Mo. Réessayez avec une photo plus légère.",
        );
        return;
      }
      // ≤ 15 Mo : on garde l'original.
    }

    if (!toujoursLa()) return;
    // L'original est déjà à l'abri depuis la sélection ; la version
    // compressée (plus légère, celle qui partira) le remplace.
    if (compressed !== original) persisterPhoto(item.id, compressed);

    if (!navigator.onLine) {
      patchPhoto(item.id, { status: "attente" });
      return;
    }

    try {
      // Délai réseau dur géré à l'intérieur (throw ErreurReseau -> « attente »).
      const signed = await creerUrlUploadPhoto(visiteId);
      if ("error" in signed) {
        patchPhoto(item.id, { status: "error" });
        setError(signed.error);
        return;
      }

      // Même transport binaire que le rejeu hors-ligne : aucun multipart
      // WebKit, délai adapté à la taille et vraie interruption sur timeout.
      const { error: upErr } = await uploaderPhotoSignee(
        signed,
        compressed,
        (pct) => patchProgression(item.id, pct),
      );

      if (upErr) {
        // Refus déterministe ou Blob local illisible : l'utilisateur peut
        // remplacer la photo. Les coupures réseau passent au catch et restent
        // simplement en attente.
        patchPhoto(item.id, { status: "error" });
        setError(upErr);
        return;
      }
      patchPhoto(item.id, { status: "done", path: signed.path });
    } catch (err) {
      // Coupure réseau (fetch TypeError), délai dépassé, hors-ligne : en
      // attente sans bandeau d'erreur. Le reste : vraie erreur affichée.
      if (err instanceof ErreurReseau || err instanceof TypeError) {
        patchPhoto(item.id, { status: "attente" });
        return;
      }
      // Détail technique (souvent un message brut anglais) en console
      // uniquement — le conducteur voit un message générique en français.
      console.error("uploadPhoto", err);
      patchPhoto(item.id, { status: "error" });
      setError("Impossible de traiter cette photo. Réessayez.");
    }
  }

  // File des traitements photo (compression + upload), bornée à
  // TRAITEMENTS_PHOTO_SIMULTANES.
  const traitementsRef = useRef<(() => Promise<void>)[]>([]);
  const traitementsActifsRef = useRef(0);
  function lancerTraitements() {
    while (
      traitementsActifsRef.current < TRAITEMENTS_PHOTO_SIMULTANES &&
      traitementsRef.current.length > 0
    ) {
      const tache = traitementsRef.current.shift()!;
      traitementsActifsRef.current++;
      void tache().finally(() => {
        traitementsActifsRef.current--;
        lancerTraitements();
      });
    }
  }

  function onSelectPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // permet de re-sélectionner le même fichier
    // Plafond appliqué dès l'ajout (le serveur refuserait l'envoi) : mieux
    // vaut le savoir sur place que découvrir un refus au rejeu.
    const place = Math.max(0, MAX_PHOTOS_PAR_VISITE - photosRef.current.length);
    if (files.length > place) {
      setError(
        place === 0
          ? `${MAX_PHOTOS_PAR_VISITE} photos maximum par visite : retirez-en une pour en ajouter une autre.`
          : `${MAX_PHOTOS_PAR_VISITE} photos maximum par visite : seules les ${place} premières ont été ajoutées.`,
      );
    }
    const items = files.slice(0, place).map((file) => ({
      file,
      item: {
        id: crypto.randomUUID(),
        previewUrl: URL.createObjectURL(file),
        blob: file,
        path: null,
        status: "uploading",
      } satisfies PhotoItem,
    }));
    if (items.length === 0) return;
    // La ref suit tout de suite (sans attendre le rendu) : une 2ᵉ sélection
    // rapide compte ces photos dans le plafond, et leur traitement les trouve.
    photosRef.current = [...photosRef.current, ...items.map((i) => i.item)];
    setPhotos((prev) => [...prev, ...items.map((i) => i.item)]);
    for (const { item, file } of items) {
      // À l'abri tout de suite (fichier d'origine) : une photo qui attend son
      // tour de compression survit à la sortie de la fiche ou à l'app tuée.
      persisterPhoto(item.id, file);
      traitementsRef.current.push(() => uploadPhoto(item, file));
    }
    lancerTraitements();
  }

  function removePhoto(id: string) {
    photosRef.current = photosRef.current.filter((p) => p.id !== id);
    setPhotos((prev) => {
      const cible = prev.find((p) => p.id === id);
      if (cible) URL.revokeObjectURL(cible.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
    // Effacé par la prochaine écriture de l'autosave (voir viderAutosave) ;
    // un échec d'écriture de CETTE photo ne compte plus.
    photosARetirerRef.current.push(id);
    echecsRef.current.delete(`photo:${id}`);
  }

  // L'envoi est irréversible pour le conducteur (la visite passe « réalisée »,
  // pas de modification depuis le téléphone) : confirmation avant d'envoyer.
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (photos.some((p) => p.status === "uploading")) {
      setError("Attendez la fin de l'envoi des photos.");
      return;
    }

    // Mêmes règles que le serveur, vérifiées AVANT l'envoi : hors-ligne, un
    // refus ne tomberait sinon qu'au rejeu, loin du chantier.
    const verification = validerCompteRendu({
      pieces,
      taux,
      jours,
      resume,
      conclusion,
    });
    if ("error" in verification) {
      setError(verification.error);
      return;
    }

    setConfirmerEnvoi(true);
  }

  function envoyer() {
    const brouillon: Brouillon = {
      visiteId,
      titre: nomClient,
      champs: { pieces, taux, jours, resume, conclusion },
      photos: photos.map((p) => ({ id: p.id, blob: p.blob, path: p.path })),
      updatedAt: Date.now(),
    };

    startTransition(async () => {
      try {
        // Le callback grave les chemins attribués dans l'état React : après un
        // refus métier, un retry repart des objets déjà uploadés (zéro orphelin).
        const res = await envoyerBrouillon(brouillon, (photoId, path) =>
          patchPhoto(photoId, { path, status: "done" }),
        );
        if (res.code === "DEJA_ENVOYEE") {
          // Déjà enregistré côté serveur (rejeu passé avant nous, saisie
          // back-office…) : rien à renvoyer, on nettoie et on sort.
          await effacerLocal();
          toast.info("Ce compte-rendu avait déjà été enregistré.");
          router.push("/app/mes-visites");
          router.refresh();
          return;
        }
        if (res.error) {
          setError(res.error);
          return;
        }
        await effacerLocal();
        toast.success("Compte-rendu envoyé.");
        router.push("/app/mes-visites");
        router.refresh();
      } catch (err) {
        if (!(err instanceof ErreurReseau)) {
          console.error("Envoi du compte-rendu :", err);
          setError("Une erreur est survenue.");
          return;
        }
        // Hors-ligne : mis en file (rejoué automatiquement), et retour à
        // l'agenda où la visite porte le badge « En attente d'envoi ».
        // `brouillon.photos` porte déjà les chemins des uploads qui ont
        // abouti avant la coupure (mutés par envoyerBrouillon) : le rejeu
        // n'y touchera plus.
        try {
          await enfiler(brouillon);
        } catch (e) {
          // File locale inaccessible : surtout NE PAS effacer le brouillon.
          console.error("Mise en file du compte-rendu :", e);
          setError(
            "Pas de réseau, et le compte-rendu n'a pas pu être mis en attente sur l'appareil. Votre saisie reste ici : réessayez « Envoyer » dès que le réseau revient.",
          );
          return;
        }
        await effacerLocal();
        toast.info(
          "Hors ligne : le compte-rendu partira automatiquement au retour du réseau.",
        );
        router.push("/app/mes-visites");
      }
    });
  }

  // Un envoi est en file pour cette visite : état d'attente honnête à la place
  // du formulaire (la visite reste PLANIFIEE côté serveur jusqu'à réception).
  if (enFile) {
    return (
      <EnvoiEnAttente envoi={enFile} telephone={telephone} adresse={adresse} />
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-medium text-neutral-900">
          Compte-rendu de visite
        </h2>
        <EtatBrouillon etat={sauvegarde} />
      </div>

      {lectureEchouee && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"
        >
          <p className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Le brouillon enregistré sur l&apos;appareil n&apos;a pas pu être
            relu. Il n&apos;est pas effacé : récupérez-le avant de saisir.
          </p>
          <button
            type="button"
            onClick={() => setRelecture((n) => n + 1)}
            className="flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Récupérer le brouillon enregistré
          </button>
        </div>
      )}
      {sauvegarde === "erreur" && !lectureEchouee && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Le brouillon n&apos;a pas pu être enregistré sur l&apos;appareil.
          Gardez l&apos;application ouverte et envoyez le compte-rendu dès que
          possible.
        </p>
      )}
      {photosPerdues > 0 && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {photosPerdues > 1
            ? `${photosPerdues} photos n'ont pas pu être relues sur l'appareil : reprenez-les.`
            : "1 photo n'a pas pu être relue sur l'appareil : reprenez-la."}
        </p>
      )}

      {/* Verrouillé le temps de relire le brouillon local (quelques ms) : une
          frappe faite avant serait écrasée par la reprise du brouillon. */}
      <fieldset disabled={!hydrated} className="min-w-0 space-y-5">
      <fieldset className="min-w-0 space-y-1.5">
        <legend className="text-sm font-medium text-neutral-800">
          Pièces endommagées
        </legend>
        <ChipsInput
          suggestions={PIECES_SUGGEREES}
          valeurs={pieces}
          onValeursChange={setPieces}
          taille="pouce"
        />
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Taux d'humidité (%)" htmlFor="tauxHumidite">
          <input
            id="tauxHumidite"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            value={taux}
            onChange={(e) => setTaux(e.target.value)}
            onKeyDown={bloquerEntree}
            className={inputClass}
          />
        </Field>
        <Field label="Jours estimés" htmlFor="joursReparationEstimes">
          <input
            id="joursReparationEstimes"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={jours}
            onChange={(e) => setJours(e.target.value)}
            onKeyDown={bloquerEntree}
            className={inputClass}
          />
        </Field>
      </div>

      <fieldset className="min-w-0 space-y-2">
        <legend className="text-sm font-medium text-neutral-800">Photos</legend>
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div
                key={p.id}
                className="relative aspect-square overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100"
              >
                {p.blob.size > 0 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.previewUrl}
                    alt="Photo de la visite"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  // Déjà uploadée mais aperçu local illisible : elle partira
                  // quand même (seul son chemin compte).
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-center text-xs text-neutral-500">
                    <Camera className="size-5" aria-hidden="true" />
                    Photo envoyée
                  </div>
                )}
                {p.status !== "done" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45 px-1 text-center text-xs font-medium text-white">
                    {p.status === "uploading"
                      ? p.progression != null
                        ? `Envoi… ${p.progression} %`
                        : "Envoi…"
                      : p.status === "attente"
                        ? "Partira avec l'envoi"
                        : "À renvoyer"}
                  </div>
                )}
                {/* Cible tactile 44 px (size-11) ; le disque visible reste
                    petit pour ne pas manger la vignette. */}
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  aria-label="Retirer la photo"
                  className="absolute top-0 right-0 flex size-11 cursor-pointer items-start justify-end p-1"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80">
                    <X className="size-4" aria-hidden="true" />
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className={photoTriggerClass}>
            <Camera className="size-5 shrink-0" aria-hidden="true" />
            Prendre une photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onSelectPhotos}
              className="hidden"
            />
          </label>
          <label className={photoTriggerClass}>
            <ImagePlus className="size-5 shrink-0" aria-hidden="true" />
            Galerie
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={onSelectPhotos}
              className="hidden"
            />
          </label>
        </div>
      </fieldset>

      <Field label="Résumé" htmlFor="resume">
        <textarea
          id="resume"
          rows={3}
          value={resume}
          maxLength={LIMITES_COMPTE_RENDU.TEXTE}
          onChange={(e) => setResume(e.target.value)}
          className={textareaClass}
        />
      </Field>

      <Field label="Conclusion / recommandations" htmlFor="conclusion">
        <textarea
          id="conclusion"
          rows={3}
          value={conclusion}
          maxLength={LIMITES_COMPTE_RENDU.TEXTE}
          onChange={(e) => setConclusion(e.target.value)}
          className={textareaClass}
        />
      </Field>
      </fieldset>

      <div ref={messagesRef} className="space-y-2">
        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>

      {/* Barre sticky : Appeler / Itinéraire + Envoyer (submit DANS le form). */}
      <BarreVisite telephone={telephone} adresse={adresse}>
        <button
          type="submit"
          disabled={pending || !hydrated}
          className="flex h-12 min-w-0 flex-[1.2] cursor-pointer items-center justify-center gap-1.5 rounded-md bg-primary-600 px-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 active:bg-primary-800 disabled:pointer-events-none disabled:opacity-50"
        >
          <Send className="size-4 shrink-0" aria-hidden="true" />
          {pending ? "Envoi…" : "Envoyer"}
        </button>
      </BarreVisite>

      <ConfirmDialog
        ouvert={confirmerEnvoi}
        onFermer={() => setConfirmerEnvoi(false)}
        titre="Envoyer le compte-rendu ?"
        description="La visite passera en « Réalisée » et le compte-rendu ne pourra plus être modifié depuis le téléphone."
        labelConfirmer="Envoyer"
        onConfirmer={envoyer}
      />
    </form>
  );
}

// État RÉEL de l'enregistrement local (l'ancien libellé fixe « Brouillon
// enregistré » s'affichait même quand l'écriture échouait).
function EtatBrouillon({ etat }: { etat: EtatSauvegarde }) {
  if (etat === "erreur") {
    return (
      <p className="flex shrink-0 items-center gap-1 text-xs font-medium text-red-700">
        <TriangleAlert className="size-3.5" aria-hidden="true" />
        Non enregistré
      </p>
    );
  }
  return (
    <p className="flex shrink-0 items-center gap-1 text-xs text-neutral-500">
      {etat === "enregistre" && (
        <Check className="size-3.5 text-green-600" aria-hidden="true" />
      )}
      {etat === "enregistre"
        ? "Brouillon enregistré"
        : "Enregistrement auto sur l'appareil"}
    </p>
  );
}

// État affiché quand le compte-rendu de la visite est en file d'attente locale.
// La saisie est terminée et sécurisée sur l'appareil ; la date de réalisation
// sera posée PAR LE SERVEUR à la réception effective — on ne montre donc jamais
// de date « envoyée » locale, seulement un statut d'attente honnête.
function EnvoiEnAttente({
  envoi,
  telephone,
  adresse,
}: {
  envoi: EnvoiEnFile;
  telephone: string;
  adresse: string;
}) {
  const enErreur = envoi.statut === "ERREUR";
  const { champs, photos, visiteId } = envoi.brouillon;

  return (
    <div className="space-y-5">
      <div
        className={cn(
          "space-y-3 rounded-lg border p-4",
          enErreur
            ? "border-red-200 bg-red-50"
            : "border-amber-300 bg-amber-50",
        )}
      >
        <p
          className={cn(
            "flex items-center gap-2 font-medium",
            enErreur ? "text-red-800" : "text-amber-900",
          )}
        >
          {envoi.statut === "ENVOI" ? (
            <RefreshCw className="size-5 animate-spin" aria-hidden="true" />
          ) : enErreur ? (
            <TriangleAlert className="size-5" aria-hidden="true" />
          ) : (
            <CloudUpload className="size-5" aria-hidden="true" />
          )}
          {envoi.statut === "ENVOI"
            ? "Envoi en cours…"
            : enErreur
              ? "Envoi refusé"
              : "En attente d'envoi"}
        </p>
        <p className={cn("text-sm", enErreur ? "text-red-700" : "text-amber-900")}>
          {enErreur
            ? (envoi.derniereErreur ?? "Une erreur est survenue.")
            : "Le compte-rendu est enregistré sur l'appareil et partira automatiquement au retour du réseau. La date de réalisation sera posée à la réception."}
        </p>
        {/* Cause du dernier essai raté : jamais d'attente muette. */}
        {!enErreur && envoi.tentatives > 0 && envoi.derniereErreur && (
          <p className="text-sm text-amber-900">
            Dernier essai : {envoi.derniereErreur}
          </p>
        )}
        {envoi.statut !== "ENVOI" && (enErreur || envoi.tentatives > 0) && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void reessayer(visiteId)}
              className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-primary-600 px-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Réessayer maintenant
            </button>
            <button
              type="button"
              onClick={() => void remettreEnBrouillon(visiteId)}
              className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-100"
            >
              <FilePenLine className="size-4" aria-hidden="true" />
              Reprendre en brouillon
            </button>
          </div>
        )}
      </div>

      {/* Récapitulatif de ce qui partira, en lecture seule. */}
      <dl className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500">Taux d&apos;humidité</dt>
          <dd className="font-medium text-neutral-900 tabular-nums">
            {champs.taux !== "" ? (
              <span className="inline-flex items-center gap-1">
                <Droplets className="size-3.5" aria-hidden="true" />
                {champs.taux} %
              </span>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500">Pièces</dt>
          <dd className="font-medium text-neutral-900">
            {champs.pieces.length > 0 ? champs.pieces.join(", ") : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500">Photos</dt>
          <dd className="font-medium text-neutral-900 tabular-nums">
            <span className="inline-flex items-center gap-1">
              <Camera className="size-3.5" aria-hidden="true" />
              {photos.length}
            </span>
          </dd>
        </div>
      </dl>

      <BarreVisite telephone={telephone} adresse={adresse} />
    </div>
  );
}
