"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleActif } from "@/lib/auth";
import { getSupabaseAdmin, BUCKET_SINISTRES } from "@/lib/supabase/admin";
import { messageFromError } from "@/lib/erreurs";
import {
  LIMITES,
  champOptionnel,
  champRequis,
  emailValide,
  telephoneValide,
  texte,
} from "@/lib/validation";

// `saisie` renvoie les champs texte postés tels quels quand l'action échoue
// (guard, validation, upload, base) : React réinitialise les inputs non
// contrôlés après l'action — ces valeurs re-remplissent le formulaire via
// defaultValue (même pattern que CreerDossierState). Uniquement des champs
// texte non sensibles : jamais le logo (un <input type="file"> ne peut pas
// être re-rempli) ni aucun secret. `null` en cas de succès.
export type OrganisationState = {
  error: string | null;
  ok: boolean;
  saisie: {
    nom: string;
    adresse: string;
    siret: string;
    telephone: string;
    emailContact: string;
    siteWeb: string;
    assuranceDecennale: string;
    mentionsLegales: string;
  } | null;
};

// Types de logo acceptés → extension du chemin d'objet (pas de SVG : un SVG
// servi tel quel peut embarquer du script).
const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const LOGO_MAX_OCTETS = 2 * 1024 * 1024; // 2 Mo

// Met à jour les coordonnées de l'organisation et, si un fichier est fourni,
// remplace le logo dans le bucket privé (logoUrl = chemin d'objet, jamais une
// URL publique — même pattern que Photo.chemin).
export async function modifierOrganisation(
  _prev: OrganisationState,
  formData: FormData,
): Promise<OrganisationState> {
  const garde = await requireRoleActif(["ASSISTANTE", "ADMIN"]);

  // Champs texte lus AVANT le test du guard (lecture pure du FormData, aucune
  // requête) : un refus — abonnement suspendu compris — renvoie aussi `saisie`
  // pour ne pas perdre le branding tapé.
  const saisie = {
    nom: texte(formData, "nom"),
    adresse: texte(formData, "adresse"),
    siret: texte(formData, "siret"),
    telephone: texte(formData, "telephone"),
    emailContact: texte(formData, "emailContact"),
    siteWeb: texte(formData, "siteWeb"),
    assuranceDecennale: texte(formData, "assuranceDecennale"),
    mentionsLegales: texte(formData, "mentionsLegales"),
  };
  if (!garde.ok) return { error: garde.error, ok: false, saisie };
  const { user } = garde;

  const {
    nom,
    adresse,
    siret,
    telephone,
    emailContact,
    siteWeb,
    assuranceDecennale,
    mentionsLegales,
  } = saisie;

  const invalide =
    champRequis(nom, LIMITES.NOM, "Le nom de l'organisation") ??
    champOptionnel(adresse, LIMITES.ADRESSE, "L'adresse", { feminin: true }) ??
    champOptionnel(siret, LIMITES.SIRET, "Le SIRET") ??
    champOptionnel(telephone, LIMITES.TELEPHONE, "Le téléphone") ??
    champOptionnel(emailContact, LIMITES.EMAIL, "L'email", { feminin: true }) ??
    champOptionnel(siteWeb, LIMITES.SITE_WEB, "Le site web") ??
    champOptionnel(assuranceDecennale, LIMITES.ASSURANCE, "L'assurance", {
      feminin: true,
    }) ??
    champOptionnel(
      mentionsLegales,
      LIMITES.MENTIONS_LEGALES,
      "Les mentions légales",
      { feminin: true, pluriel: true },
    );
  if (invalide) return { error: invalide, ok: false, saisie };

  // Contrôles légers de format (mêmes gardes souples que partout ailleurs :
  // borne + présence d'un signe distinctif, pas de regex stricte).
  if (telephone && !telephoneValide(telephone)) {
    return { error: "Le téléphone semble invalide.", ok: false, saisie };
  }
  if (emailContact && !emailValide(emailContact)) {
    return { error: "L'email de contact semble invalide.", ok: false, saisie };
  }

  let logoChemin: string | null = null;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    // Object.hasOwn : jamais de correspondance via le prototype (« constructor »…).
    const extension = Object.hasOwn(LOGO_TYPES, logo.type)
      ? LOGO_TYPES[logo.type]
      : undefined;
    if (!extension) {
      return {
        error: "Le logo doit être un PNG, JPEG ou WebP.",
        ok: false,
        saisie,
      };
    }
    if (logo.size > LOGO_MAX_OCTETS) {
      return { error: "Le logo est limité à 2 Mo.", ok: false, saisie };
    }

    logoChemin = `${user.organisationId}/organisation/logo-${crypto.randomUUID()}.${extension}`;
    try {
      const admin = getSupabaseAdmin();
      const { error } = await admin.storage
        .from(BUCKET_SINISTRES)
        .upload(logoChemin, logo, { contentType: logo.type });
      if (error) throw error;
    } catch (e) {
      console.error("Upload du logo d'organisation échoué :", e);
      return {
        error: "L'envoi du logo a échoué. Réessayez.",
        ok: false,
        saisie,
      };
    }
  }

  // Ancien chemin d'objet du logo (logoUrl = chemin dans le bucket privé),
  // relevé AVANT l'update pour purger l'objet remplacé. Best-effort : si la
  // lecture échoue, on continue sans purge plutôt que de bloquer la mise à
  // jour (le nouveau logo est déjà uploadé).
  let ancienLogoChemin: string | null = null;
  if (logoChemin) {
    try {
      const actuelle = await prisma.organisation.findUnique({
        where: { id: user.organisationId },
        select: { logoUrl: true },
      });
      ancienLogoChemin = actuelle?.logoUrl ?? null;
    } catch (e) {
      console.error("Lecture de l'ancien logo d'organisation échouée :", e);
    }
  }

  try {
    await prisma.organisation.update({
      where: { id: user.organisationId },
      data: {
        nom,
        adresse: adresse || null,
        siret: siret || null,
        telephone: telephone || null,
        emailContact: emailContact || null,
        siteWeb: siteWeb || null,
        assuranceDecennale: assuranceDecennale || null,
        mentionsLegales: mentionsLegales || null,
        ...(logoChemin ? { logoUrl: logoChemin } : {}),
      },
    });
  } catch (e) {
    // Le nouveau logo a été uploadé AVANT l'update : si l'écriture en base
    // échoue, l'objet ne sera jamais référencé (logoUrl inchangé) — on le
    // purge tout de suite. Best-effort : un échec de purge laisse un orphelin
    // mais ne doit jamais masquer l'erreur d'origine renvoyée au formulaire.
    if (logoChemin) {
      try {
        const { error } = await getSupabaseAdmin()
          .storage.from(BUCKET_SINISTRES)
          .remove([logoChemin]);
        if (error) throw error;
      } catch (purgeError) {
        console.error(
          "Purge du logo uploadé après échec de l'update échouée :",
          purgeError,
        );
      }
    }
    return { error: messageFromError(e), ok: false, saisie };
  }

  // Le logo a été remplacé (upload + base OK) : l'ancien objet du bucket ne
  // sert plus à rien, on le purge. Best-effort — un échec laisse un orphelin
  // dans le Storage, jamais une action en erreur.
  if (logoChemin && ancienLogoChemin && ancienLogoChemin !== logoChemin) {
    try {
      const { error } = await getSupabaseAdmin()
        .storage.from(BUCKET_SINISTRES)
        .remove([ancienLogoChemin]);
      if (error) throw error;
    } catch (e) {
      console.error("Suppression de l'ancien logo d'organisation échouée :", e);
    }
  }

  revalidatePath("/app/parametres/organisation");
  revalidatePath("/app", "layout");
  // Succès : saisie null — le formulaire repart des valeurs fraîches en base.
  return { error: null, ok: true, saisie: null };
}
