// Clamp une page demandée à la dernière page réelle et re-sert cette page à
// la place — évite le tableau vide + pied de page incohérent d'un `?page=`
// forgé ou périmé (l'onglet a changé de contenu entre deux visites) au-delà
// du total. Chemin d'EXCEPTION uniquement : `fetchPage` n'est appelé QUE si
// `pageDemandee` dépasse `totalPages` — la navigation nominale ne paie pas
// de round-trip supplémentaire. Partagé par les vues paginées (Dossiers
// liste, Historique Terminés/Annulés) pour que leur comportement de clamp ne
// diverge jamais entre elles.
export async function clamperPage<T>(
  pageDemandee: number,
  premierePage: T[],
  total: number,
  pageSize: number,
  fetchPage: (skip: number) => Promise<T[]>,
): Promise<{ page: number; totalPages: number; rows: T[] }> {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (pageDemandee <= totalPages) {
    return { page: pageDemandee, totalPages, rows: premierePage };
  }
  const page = totalPages;
  const rows = await fetchPage((page - 1) * pageSize);
  return { page, totalPages, rows };
}
