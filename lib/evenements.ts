import type { Prisma } from "@/lib/generated/prisma/client";
import type { TypeEvenementDossier } from "@/lib/generated/prisma/enums";
import { DOSSIER_STATUT_LABELS, visiteLabel } from "@/lib/metier";
import { formatEuros } from "@/lib/finances";
import { formatDateFr, formatPlageDateTimeFr } from "@/lib/format";
import { metaObjet, texte, nombre, dateDe } from "@/lib/meta-json";

// Journal d'événements du dossier — « qui a fait quoi, quand ».
// À appeler DANS la transaction de la mutation tracée (passer `tx`), pour que
// l'événement et la mutation soient atomiques ; `prisma` directement pour une
// mutation mono-requête. Le scoping org est garanti par l'appelant (le
// dossierId a déjà été vérifié par le guard de l'action).
export async function enregistrerEvenement(
  tx: Prisma.TransactionClient,
  evenement: {
    dossierId: string;
    type: TypeEvenementDossier;
    acteurId: string;
    meta?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.evenementDossier.create({ data: evenement });
}

/* ── Présentation (libellés français du journal) ─────────────────────── */

// Noms français des champs tracés dans meta.champsModifies (les actions
// stockent les noms canoniques du modèle, jamais des libellés d'affichage).
const CHAMP_LABELS: Record<string, string> = {
  nomClient: "nom",
  adresse: "adresse",
  telephone: "téléphone",
  email: "email",
  infosAcces: "infos d'accès",
  dateDebut: "date de début",
  dateFin: "date de fin",
  // Champs retirés du modèle Chantier — conservés pour afficher les
  // événements CHANTIER_MODIFIE historiques qui les tracent encore.
  description: "description",
  materiel: "matériel",
  ouvriers: "ouvriers",
  // Champs du compte-rendu de visite (événements COMPTE_RENDU_CORRIGE).
  piecesEndommagees: "pièces endommagées",
  tauxHumidite: "taux d'humidité",
  joursReparationEstimes: "jours de réparation estimés",
  resume: "résumé",
  conclusion: "conclusion",
};

function champsFr(m: Record<string, unknown>): string {
  const v = m["champsModifies"];
  if (!Array.isArray(v)) return "";
  return v
    .filter((c): c is string => typeof c === "string")
    .map((c) => CHAMP_LABELS[c] ?? c)
    .join(", ");
}

// Libellé français d'un événement du journal (pur, pas de JSX) — consommé
// par la carte « Historique » de la fiche dossier. Les détails viennent de
// meta quand ils sont présents, sinon le libellé reste valable sans eux.
export function libelleEvenement(
  type: TypeEvenementDossier,
  meta: unknown,
): string {
  const m = metaObjet(meta);

  switch (type) {
    case "CREATION":
      return "Dossier créé";

    case "MODIFICATION_CLIENT": {
      const champs = champsFr(m);
      return champs
        ? `Infos client modifiées (${champs})`
        : "Infos client modifiées";
    }

    case "VISITE_PLANIFIEE": {
      const numero = nombre(m, "numero");
      const quand = dateDe(m, "datePlanifiee");
      const duree = nombre(m, "dureeMinutes") ?? 0;
      const conducteur = texte(m, "conducteurNom");
      return [
        numero != null ? `${visiteLabel(numero)} planifiée` : "Visite planifiée",
        quand ? ` le ${formatPlageDateTimeFr(quand, duree)}` : "",
        conducteur ? ` avec ${conducteur}` : "",
      ].join("");
    }

    case "VISITE_REPLANIFIEE": {
      const numero = nombre(m, "numero");
      const avant = dateDe(m, "ancienneDate");
      const apres = dateDe(m, "nouvelleDate");
      const dureeAvant = nombre(m, "ancienneDuree") ?? 0;
      const dureeApres = nombre(m, "nouvelleDuree") ?? 0;
      const base =
        numero != null
          ? `${visiteLabel(numero)} replanifiée`
          : "Visite replanifiée";
      if (avant && apres) {
        return `${base} : ${formatPlageDateTimeFr(avant, dureeAvant)} → ${formatPlageDateTimeFr(apres, dureeApres)}`;
      }
      return apres ? `${base} au ${formatPlageDateTimeFr(apres, dureeApres)}` : base;
    }

    case "VISITE_ANNULEE": {
      const numero = nombre(m, "numero");
      const prevue = dateDe(m, "datePrevue");
      const dureePrevue = nombre(m, "dureePrevue") ?? 0;
      return [
        numero != null ? `${visiteLabel(numero)} annulée` : "Visite annulée",
        prevue ? ` (était prévue le ${formatPlageDateTimeFr(prevue, dureePrevue)})` : "",
      ].join("");
    }

    case "COMPTE_RENDU_RECU": {
      const numero = nombre(m, "numero");
      const taux = nombre(m, "tauxHumidite");
      return [
        "Compte-rendu reçu",
        numero != null ? ` — ${visiteLabel(numero)}` : "",
        taux != null ? ` (taux relevé : ${taux} %)` : "",
      ].join("");
    }

    case "COMPTE_RENDU_CORRIGE": {
      const numero = nombre(m, "numero");
      const champs = champsFr(m);
      // ancien/nouveau taux : présents uniquement quand le taux a changé
      // (peuvent être null côté meta — l'arrow n'est montrée que si les
      // deux valeurs sont des nombres, sinon champs suffit).
      const ancien = nombre(m, "ancienTaux");
      const nouveau = nombre(m, "nouveauTaux");
      return [
        "Compte-rendu corrigé",
        numero != null ? ` — ${visiteLabel(numero)}` : "",
        champs ? ` (${champs})` : "",
        ancien != null && nouveau != null
          ? ` : taux ${ancien} % → ${nouveau} %`
          : "",
      ].join("");
    }

    case "CLASSEMENT": {
      const statut = texte(m, "statut");
      const label =
        statut != null
          ? ((DOSSIER_STATUT_LABELS as Record<string, string>)[statut] ?? statut)
          : null;
      return label ? `Dossier classé « ${label} »` : "Dossier classé";
    }

    case "EMPECHEMENT": {
      const prevue = dateDe(m, "datePrevue");
      const dureePrevue = nombre(m, "dureePrevue") ?? 0;
      const motif = texte(m, "motif");
      return [
        "Visite empêchée",
        prevue ? ` (prévue le ${formatPlageDateTimeFr(prevue, dureePrevue)})` : "",
        motif ? ` — ${motif}` : "",
      ].join("");
    }

    case "CHANTIER_CREE": {
      const debut = dateDe(m, "dateDebut");
      const fin = dateDe(m, "dateFin");
      if (debut && fin) {
        return debut.getTime() === fin.getTime()
          ? `Chantier créé — travaux le ${formatDateFr(debut)}`
          : `Chantier créé — travaux du ${formatDateFr(debut)} au ${formatDateFr(fin)}`;
      }
      return "Chantier créé";
    }

    case "CHANTIER_MODIFIE": {
      const champs = champsFr(m);
      return champs ? `Chantier modifié (${champs})` : "Chantier modifié";
    }

    case "CHANTIER_TERMINE":
      return "Chantier marqué terminé";

    case "CHANTIER_ROUVERT":
      return "Chantier rouvert";

    case "CHANTIER_SUPPRIME":
      return "Chantier supprimé — le dossier repasse « Prêt pour travaux »";

    case "PIECE_JOINTE_AJOUTEE": {
      const nom = texte(m, "nom");
      return nom ? `Pièce jointe ajoutée — ${nom}` : "Pièce jointe ajoutée";
    }

    case "PIECE_JOINTE_SUPPRIMEE": {
      const nom = texte(m, "nom");
      return nom ? `Pièce jointe supprimée — ${nom}` : "Pièce jointe supprimée";
    }

    case "DEVIS_ENREGISTRE": {
      // montantDevis en meta = centimes (peut manquer sur une entrée ancienne).
      const montant = nombre(m, "montantDevis");
      return montant != null
        ? `Devis enregistré — ${formatEuros(montant)} HT`
        : "Devis enregistré";
    }

    case "PAIEMENT_RECU": {
      const montant = nombre(m, "montantDevis");
      return montant != null
        ? `Paiement reçu — ${formatEuros(montant)} HT`
        : "Paiement reçu";
    }

    case "PAIEMENT_ANNULE":
      return "Paiement annulé — le dossier repasse « à encaisser »";

    case "DOSSIER_ANNULE": {
      const motif = texte(m, "motif");
      const statutAvant = texte(m, "statutAvant");
      const label =
        statutAvant != null
          ? ((DOSSIER_STATUT_LABELS as Record<string, string>)[statutAvant] ??
            statutAvant)
          : null;
      return [
        "Dossier annulé",
        motif ? ` — ${motif}` : "",
        label ? ` (était « ${label} »)` : "",
      ].join("");
    }

    case "DOSSIER_REPRIS": {
      const statut = texte(m, "statut");
      const label =
        statut != null
          ? ((DOSSIER_STATUT_LABELS as Record<string, string>)[statut] ?? statut)
          : null;
      return label ? `Dossier repris — « ${label} »` : "Dossier repris";
    }

    case "DOCUMENT_A_SIGNER_AJOUTE": {
      const nom = texte(m, "nom");
      return nom
        ? `Document à faire signer ajouté — ${nom}`
        : "Document à faire signer ajouté";
    }

    case "DOCUMENT_SIGNE": {
      const nom = texte(m, "nom");
      const signataire = texte(m, "nomSignataire");
      return [
        "Document signé",
        nom ? ` — ${nom}` : "",
        signataire ? ` (signataire : ${signataire})` : "",
      ].join("");
    }

    case "DOCUMENT_A_SIGNER_SUPPRIME": {
      const nom = texte(m, "nom");
      return nom
        ? `Document à faire signer supprimé — ${nom}`
        : "Document à faire signer supprimé";
    }

    case "CHANTIER_TERMINE_TERRAIN":
      return "Chantier marqué terminé depuis le terrain";
  }
}
