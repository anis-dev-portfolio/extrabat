// Codes de succès toastés côté client par app/app/toast-succes.tsx après un
// redirect() serveur (garder la liste des codes alignée avec ce composant).
// Le helper évite la concat fragile si l'URL de retour porte déjà des
// paramètres. Chaque fichier d'actions peut restreindre `code` à son union de
// codes via un type local — la signature reste volontairement large ici.
export function avecSucces(url: string, code: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}succes=${code}`;
}
