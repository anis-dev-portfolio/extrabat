// Fiche contact de l'ÉDITEUR d'ExtraBat (demandes de modification, questions
// d'abonnement, problèmes de paiement). Codée en dur : c'est le contact de
// l'éditeur, identique pour tous les tenants — pas une donnée tenant (donc pas
// en base), et pas un secret non plus. Affichée sur la page Paramètres →
// Abonnement et dans le bandeau de suspension.
// (Coordonnées de démonstration dans cette copie vitrine.)
export const SUPPORT = {
  nom: "Anis",
  role: "Éditeur d'ExtraBat",
  // Format E.164 pour le lien tel: (clic = appel, précieux sur la PWA mobile).
  telephoneLien: "+33123456789",
  telephoneAffiche: "01 23 45 67 89",
  email: "support@exemple.fr",
} as const;
