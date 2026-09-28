"use client";

import { useSyncExternalStore } from "react";
import {
  type EnvoiEnFile,
  type Brouillon,
  enfilerEnvoi,
  listerEnvois,
  mettreAJourEnvoi,
  retirerEnvoi,
  effacerBrouillon,
  sauverBrouillon,
} from "@/lib/brouillon";
import { toast } from "@/components/ui/toaster";

// La logique d'envoi (supabase-js, actions serveur) n'est chargée qu'au moment
// de synchroniser : les écrans qui ne font qu'AFFICHER l'état de la file
// (badges, indicateur) ne l'embarquent pas dans leur bundle.
function chargerEnvoi() {
  return import("@/app/app/visites/[id]/envoi");
}

// Moteur de synchronisation des comptes-rendus hors-ligne. Singleton client :
// une file persistante (IndexedDB, survit au kill de l'app / reboot), rejouée
// automatiquement à chaque signal de « vie » de l'app. iOS Safari n'ayant pas
// Background Sync, TOUT le rejeu se fait app ouverte — d'où la multiplicité
// des déclencheurs :
//   - démarrage de l'app (montage du layout /app) ;
//   - retour du réseau (`online`) ;
//   - retour au premier plan (`visibilitychange`, `pageshow` — le cas PWA
//     relancée depuis l'écran d'accueil) ;
//   - filet périodique (60 s) tant que la file n'est pas vide.
// Idempotence : la clé naturelle d'un envoi est visiteId (un compte-rendu par
// visite, gardé par updateMany conditionnel en transaction côté serveur). Un
// rejeu qui reçoit DEJA_ENVOYEE est un succès (réponse perdue au 1er envoi).
// Les refus métier passent en ERREUR et ne sont JAMAIS rejoués automatiquement.
// PWA standalone = une seule instance : pas de coordination multi-onglets.

export type SyncEtat = {
  enLigne: boolean;
  synchronisation: boolean;
  envois: EnvoiEnFile[];
};

const ETAT_INITIAL: SyncEtat = {
  enLigne: true,
  synchronisation: false,
  envois: [],
};

let etat: SyncEtat = ETAT_INITIAL;
const abonnes = new Set<() => void>();
let syncEnCours = false;
let demarre = false;
let apresSucces: (() => void) | null = null;

function emettre(patch: Partial<SyncEtat>) {
  etat = { ...etat, ...patch };
  for (const cb of abonnes) cb();
}

async function rafraichirFile() {
  emettre({ envois: await listerEnvois() });
}

// Boucle d'envoi : traite les EN_ATTENTE dans l'ordre, s'arrête au premier
// échec réseau (inutile d'insister, on sera re-déclenché). On tente MÊME si
// navigator.onLine dit « hors-ligne » : en PWA installée iOS il peut rester
// bloqué à false après un mode avion — s'y fier gèlerait la file pour de bon.
// Vraiment hors-ligne, l'envoi échoue vite (délai court) et on réessaiera.
export async function synchroniser(): Promise<void> {
  if (syncEnCours) return;
  syncEnCours = true;
  emettre({ synchronisation: true });

  try {
    const { envoyerBrouillon, ErreurReseau } = await chargerEnvoi();
    const envois = await listerEnvois();
    let auMoinsUnSucces = false;

    for (const envoi of envois) {
      if (envoi.statut === "ERREUR") continue; // rejeu manuel uniquement
      // "ENVOI" ne peut venir que d'un run tué en plein vol (kill/reboot) :
      // le verrou syncEnCours empêche deux boucles simultanées — on reprend.
      const { visiteId } = envoi.brouillon;
      await mettreAJourEnvoi(visiteId, { statut: "ENVOI" });
      await rafraichirFile();

      try {
        const res = await envoyerBrouillon(envoi.brouillon);
        if (res.error === null || res.code === "DEJA_ENVOYEE") {
          // Succès — ou visite déjà réalisée côté serveur (réponse perdue au
          // 1er envoi, ou saisie back-office entre-temps) : rien à rejouer.
          await retirerEnvoi(visiteId);
          await effacerBrouillon(visiteId);
          auMoinsUnSucces = true;
          toast.success("Compte-rendu envoyé.");
        } else {
          // Refus métier : gardé, visible, jamais rejoué sans geste utilisateur.
          await mettreAJourEnvoi(visiteId, {
            statut: "ERREUR",
            tentatives: envoi.tentatives + 1,
            derniereErreur: res.error,
          });
        }
      } catch (err) {
        // Toujours loggé : un envoi qui reste « en attente » sans trace en
        // console est indiagnosticable sur le terrain.
        console.error("Envoi du compte-rendu :", visiteId, err);
        if (err instanceof ErreurReseau) {
          // Toujours hors-ligne : on remet en attente (avec la cause, montrée
          // dans la feuille des envois) et on arrête la boucle.
          await mettreAJourEnvoi(visiteId, {
            statut: "EN_ATTENTE",
            tentatives: envoi.tentatives + 1,
            derniereErreur: err.message,
          });
          break;
        }
        await mettreAJourEnvoi(visiteId, {
          statut: "ERREUR",
          tentatives: envoi.tentatives + 1,
          derniereErreur: "Une erreur est survenue.",
        });
      }
    }

    await rafraichirFile();
    if (auMoinsUnSucces) apresSucces?.();
  } catch (err) {
    // Import du module d'envoi ou lecture de file impossible (ex. très vieux
    // onglet après un déploiement) : on abandonne ce passage sans casser le
    // moteur — le prochain déclencheur retentera sur du code frais.
    console.error("Synchronisation des envois :", err);
  } finally {
    syncEnCours = false;
    emettre({ synchronisation: false });
  }
}

// Met un brouillon en file d'attente (appelé par le formulaire quand l'envoi
// direct échoue faute de réseau) et tente aussitôt une sync opportuniste.
export async function enfiler(b: Brouillon): Promise<void> {
  await enfilerEnvoi(b);
  await rafraichirFile();
  void synchroniser();
}

// Relance manuelle d'un envoi en ERREUR.
export async function reessayer(visiteId: string): Promise<void> {
  await mettreAJourEnvoi(visiteId, { statut: "EN_ATTENTE", derniereErreur: null });
  await rafraichirFile();
  void synchroniser();
}

// Sort un envoi en ERREUR de la file en le remettant en brouillon éditable :
// aucune saisie n'est perdue, l'utilisateur corrige puis renvoie.
export async function remettreEnBrouillon(visiteId: string): Promise<void> {
  const envoi = etat.envois.find((e) => e.brouillon.visiteId === visiteId);
  try {
    if (envoi) await sauverBrouillon(envoi.brouillon);
  } catch (err) {
    // L'envoi RESTE dans la file (seule copie des photos non uploadées).
    console.error("Reprise en brouillon :", visiteId, err);
    toast.error(
      "Impossible de reprendre ce compte-rendu en brouillon pour l'instant. Réessayez.",
    );
    return;
  }
  await retirerEnvoi(visiteId);
  await rafraichirFile();
}

// Démarre le moteur (idempotent) — monté une fois dans le layout /app.
// `onSucces` : rafraîchit les Server Components après un envoi abouti.
export function demarrerSync(onSucces: () => void): void {
  apresSucces = onSucces;
  if (demarre || typeof window === "undefined") return;
  demarre = true;

  emettre({ enLigne: navigator.onLine });
  window.addEventListener("online", () => {
    emettre({ enLigne: true });
    void synchroniser();
  });
  window.addEventListener("offline", () => emettre({ enLigne: false }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void synchroniser();
  });
  window.addEventListener("pageshow", () => void synchroniser());
  setInterval(() => {
    if (etat.envois.length > 0) void synchroniser();
  }, 60_000);

  void rafraichirFile().then(() => synchroniser());
}

function sAbonner(cb: () => void): () => void {
  abonnes.add(cb);
  return () => abonnes.delete(cb);
}

// État de sync réactif (connectivité + file d'attente), pour l'indicateur du
// shell et les badges « En attente d'envoi » des listes.
export function useSyncEnvois(): SyncEtat {
  return useSyncExternalStore(
    sAbonner,
    () => etat,
    () => ETAT_INITIAL,
  );
}
