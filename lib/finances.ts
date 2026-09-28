import type { DossierStatut } from "@/lib/generated/prisma/enums";

// Volet financier — helpers PURS (zéro Prisma, zéro I/O), partagés serveur
// (le juge : parsing/validation des Server Actions) et client (formatage
// d'affichage, valeur par défaut des formulaires). L'argent est stocké en
// CENTIMES (Int) sur Dossier — jamais de Float (arrondis). Ce module fait le
// pont centimes ⇄ euros à l'affichage et à la saisie, et porte les prédicats
// métier « devisé / à encaisser » (source unique, mirrorés par les guards des
// actions et par l'UI).

// Borne haute d'un montant saisi : 1 000 000,00 € en centimes. Filet contre la
// faute de frappe (un zéro de trop) ; un chantier humidité reste bien en deçà.
export const MONTANT_MAX_CENTIMES = 100_000_000;

// Formatage euros à la française : 150050 → « 1 500,50 € ». ICU complet sous
// Node ; côté client, le navigateur fournit fr-FR. L'appelant gère le null
// (montant non saisi) → « — » : ce helper ne reçoit qu'un nombre.
const eurosFmt = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

export function formatEuros(centimes: number): string {
  return eurosFmt.format(centimes / 100);
}

// Saisie euros → centimes (Int), ou null si invalide/hors bornes. Tolérant aux
// formes qu'une assistante recopie d'un devis Tolteck : symbole €, espaces
// (dont insécables) comme séparateurs de milliers, virgule OU point décimal, et
// la combinaison des deux (« 1 500,50 », « 1500.50 », « 1.500,50 »). Règle
// d'ambiguïté : quand point ET virgule sont présents, le DERNIER des deux est
// le séparateur décimal, l'autre est un séparateur de milliers (supprimé). Une
// forme réellement ambiguë (plusieurs points sans virgule) est rejetée plutôt
// que mal interprétée — mieux vaut redemander qu'enregistrer un faux montant.
export function parseEurosEnCentimes(saisie: string): number | null {
  // `\s` (ECMAScript) couvre l'espace ordinaire ET les insécables — inutile de
  // lister les variantes Unicode à la main.
  const nettoye = saisie.trim().replace(/[€\s]/g, "");
  if (!nettoye) return null;

  const dernierPoint = nettoye.lastIndexOf(".");
  const derniereVirgule = nettoye.lastIndexOf(",");
  let normalise: string;
  if (dernierPoint >= 0 && derniereVirgule >= 0) {
    const decimal = dernierPoint > derniereVirgule ? "." : ",";
    const millier = decimal === "." ? "," : ".";
    normalise = nettoye.split(millier).join("").replace(decimal, ".");
  } else {
    normalise = nettoye.replace(",", ".");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalise)) return null;
  const euros = Number(normalise);
  if (!Number.isFinite(euros)) return null;
  const centimes = Math.round(euros * 100);
  if (centimes < 0 || centimes > MONTANT_MAX_CENTIMES) return null;
  return centimes;
}

// Centimes → chaîne ré-analysable par parseEurosEnCentimes, pour le
// defaultValue d'un input texte : virgule décimale française, aucun séparateur
// de milliers, décimales seulement si non entières (150000 → « 1500 »,
// 150050 → « 1500,50 »).
export function centimesVersSaisie(centimes: number): string {
  const euros = centimes / 100;
  return Number.isInteger(euros)
    ? String(euros)
    : euros.toFixed(2).replace(".", ",");
}

// Un devis est « saisi » dès que le montant HT est renseigné (la franchise et
// la réf. restent facultatives). Prérequis pour marquer payé : on ne marque
// jamais payé un montant inconnu — garantit que le CA en base est réel.
export function devisSaisi(dossier: { montantDevis: number | null }): boolean {
  return dossier.montantDevis != null;
}

// « À encaisser » = dossier terminé, devisé, pas encore payé. Prédicat unique,
// mirroré par le guard de marquerPaye (app/app/dossiers/actions.ts) et par
// l'UI (bouton « Marquer payé », badges kanban/chantiers, vue CA).
export function estAEncaisser(dossier: {
  statut: DossierStatut;
  montantDevis: number | null;
  payeLe: Date | null;
}): boolean {
  return (
    dossier.statut === "TERMINE" &&
    dossier.montantDevis != null &&
    dossier.payeLe == null
  );
}
