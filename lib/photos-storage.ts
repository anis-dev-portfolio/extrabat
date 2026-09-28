import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { BUCKET_SINISTRES } from "@/lib/supabase/bucket";

// Purge best-effort des objets photo d'une visite qui va être/vient d'être
// supprimée (annulation back-office, empêchement terrain). Les uploads par
// URL signée écrivent dans le bucket AVANT l'envoi du compte-rendu
// (convention organisationId/visiteId/<uuid>.jpg, lib/envoi-compte-rendu.ts) :
// sans cette purge, supprimer la visite laisserait des objets orphelins.
// Ne lève JAMAIS — la suppression de la visite prime ; un échec de purge est
// loggé et laisse au pire quelques objets orphelins (état d'avant ce helper).
export async function purgerPhotosStorageVisite(
  organisationId: string,
  visiteId: string,
): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    const prefixe = `${organisationId}/${visiteId}`;
    const { data, error } = await admin.storage
      .from(BUCKET_SINISTRES)
      .list(prefixe);
    if (error) throw error;
    if (!data?.length) return;
    const chemins = data.map((objet) => `${prefixe}/${objet.name}`);
    const { error: errSuppression } = await admin.storage
      .from(BUCKET_SINISTRES)
      .remove(chemins);
    if (errSuppression) throw errSuppression;
  } catch (e) {
    console.error(
      `Purge Storage de la visite ${visiteId} : échec (objets peut-être orphelins) :`,
      e,
    );
  }
}
