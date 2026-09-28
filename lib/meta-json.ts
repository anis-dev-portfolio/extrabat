// Lecture DÉFENSIVE du meta JSON des événements et notifications de dossier :
// une entrée ancienne (ou écrite par une autre version du code) peut ne pas
// porter toutes les clés — jamais de crash d'affichage, on dégrade vers un
// libellé plus court. Partagé par lib/evenements.ts et lib/notifications.ts
// (mêmes clés, mêmes écritures dans app/app/dossiers/actions.ts) : un seul
// endroit à durcir si le format évolue.

export function metaObjet(meta: unknown): Record<string, unknown> {
  return typeof meta === "object" && meta !== null && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : {};
}

export function texte(m: Record<string, unknown>, cle: string): string | null {
  const v = m[cle];
  return typeof v === "string" && v ? v : null;
}

export function nombre(m: Record<string, unknown>, cle: string): number | null {
  const v = m[cle];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function dateDe(m: Record<string, unknown>, cle: string): Date | null {
  const v = texte(m, cle);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
