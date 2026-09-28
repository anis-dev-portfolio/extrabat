import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { PDFDocument, type PDFFont, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { BUCKET_SINISTRES } from "@/lib/supabase/bucket";
import { enregistrerEvenement } from "@/lib/evenements";
import { notifierBackOffice } from "@/lib/notifications";
import { formatDateTimeFr } from "@/lib/format";
import { LIMITES, champRequis } from "@/lib/validation";
import {
  MAX_TAILLE_SIGNATURE_OCTETS,
  RATIO_CADRE_SIGNATURE,
  prefixeDocumentsASigner,
} from "@/lib/documents-a-signer";
import { garderOuvrier } from "../../garde";

// Tamponnage serveur de la signature dans le PDF original — LA brique neuve
// des comptes ouvriers (périmètre pdf-lib : aplatir une image dans un PDF
// existant, jamais de génération — voir CLAUDE.md). Route Handler (pattern
// upload-photo, pas une Server Action) : FormData binaire + garde dédiée.
//
// Payload : signature (PNG du pad), page (1-based), x / y / largeur
// (coordonnées NORMALISÉES 0..1, origine en HAUT-gauche de la page),
// nomSignataire, luEtApprouve. Le serveur re-télécharge l'ORIGINAL, vérifie
// son SHA-256 (non-altération), tamponne, uploade la version signée à côté
// (l'original n'est JAMAIS supprimé), puis pose signeLe/hashSigne en
// transaction avec le journal et les notifications back-office.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const garde = await garderOuvrier(req);
  if ("reponse" in garde) return garde.reponse;
  const { user, ouvrier } = garde;

  const { id } = await params;

  // Triple verrou : document du dossier de l'org, dont le chantier est
  // affecté à CET ouvrier.
  const doc = await prisma.documentASigner.findFirst({
    where: {
      id,
      dossier: {
        organisationId: user.organisationId,
        chantier: { affectations: { some: { ouvrierId: ouvrier.id } } },
      },
    },
    select: {
      id: true,
      nom: true,
      cheminOriginal: true,
      hashOriginal: true,
      signeLe: true,
      dossierId: true,
      dossier: {
        select: {
          nomClient: true,
          adresse: true,
          chantier: { select: { id: true } },
        },
      },
    },
  });
  if (!doc) {
    return NextResponse.json(
      { error: "Document introuvable." },
      { status: 404 },
    );
  }
  if (doc.signeLe) {
    return NextResponse.json(
      { error: "Ce document est déjà signé." },
      { status: 409 },
    );
  }

  // ── Payload ────────────────────────────────────────────────────────────
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const signature = form.get("signature");
  if (!(signature instanceof File) || signature.size === 0) {
    return NextResponse.json(
      { error: "Signature manquante." },
      { status: 400 },
    );
  }
  if (signature.size > MAX_TAILLE_SIGNATURE_OCTETS) {
    return NextResponse.json(
      { error: "Signature trop volumineuse." },
      { status: 400 },
    );
  }

  const nomSignataire = String(form.get("nomSignataire") ?? "").trim();
  const erreurNom = champRequis(nomSignataire, LIMITES.NOM, "Le nom du signataire");
  if (erreurNom) {
    return NextResponse.json({ error: erreurNom }, { status: 400 });
  }
  if (form.get("luEtApprouve") !== "1") {
    return NextResponse.json(
      { error: "La mention « lu et approuvé » doit être cochée." },
      { status: 400 },
    );
  }

  const numeroPage = Number(form.get("page") ?? 0);
  const x = Number(form.get("x") ?? NaN);
  const y = Number(form.get("y") ?? NaN);
  const largeur = Number(form.get("largeur") ?? NaN);
  const coordonneesValides =
    Number.isInteger(numeroPage) &&
    numeroPage >= 1 &&
    [x, y, largeur].every((v) => Number.isFinite(v) && v >= 0 && v <= 1) &&
    largeur > 0.05;
  if (!coordonneesValides) {
    return NextResponse.json(
      { error: "Position de signature invalide." },
      { status: 400 },
    );
  }

  // ── Original : téléchargement + preuve de non-altération ──────────────
  const admin = getSupabaseAdmin();
  const telechargement = await admin.storage
    .from(BUCKET_SINISTRES)
    .download(doc.cheminOriginal);
  if (telechargement.error || !telechargement.data) {
    console.error(
      `Signature : original introuvable (${doc.cheminOriginal}) :`,
      telechargement.error,
    );
    return NextResponse.json(
      { error: "Document original indisponible. Réessayez." },
      { status: 502 },
    );
  }
  const original = Buffer.from(await telechargement.data.arrayBuffer());
  const hash = createHash("sha256").update(original).digest("hex");
  if (hash !== doc.hashOriginal) {
    console.error(
      `Signature : hash de l'original différent pour ${doc.id} (attendu ${doc.hashOriginal}, obtenu ${hash}).`,
    );
    return NextResponse.json(
      { error: "L'original a été altéré — signature refusée. Prévenez le bureau." },
      { status: 409 },
    );
  }

  // ── Tamponnage pdf-lib ─────────────────────────────────────────────────
  let signe: Uint8Array;
  const maintenant = new Date();
  try {
    const pdf = await PDFDocument.load(original);
    const pages = pdf.getPages();
    if (numeroPage > pages.length) {
      return NextResponse.json(
        { error: "Position de signature invalide." },
        { status: 400 },
      );
    }
    const page = pages[numeroPage - 1];
    const { width: pageW, height: pageH } = page.getSize();

    const png = await pdf.embedPng(new Uint8Array(await signature.arrayBuffer()));
    // Cadre vu par l'ouvrier (même ratio que l'aperçu) ; le tracé y est
    // ajusté en conservant son aspect (« contain »), centré — il ne déborde
    // plus sur le texte du document quand il est plus haut que le cadre.
    const wCadre = largeur * pageW;
    const hCadre = wCadre * RATIO_CADRE_SIGNATURE;
    const echelle = Math.min(wCadre / png.width, hCadre / png.height);
    const w = png.width * echelle;
    const h = png.height * echelle;
    // (x, y) normalisés = coin HAUT-gauche du cadre ; pdf-lib compte depuis
    // le BAS-gauche. Clamp dans la page — un cadre posé au ras du bord ne
    // doit jamais sortir du document.
    const xCadre = Math.min(Math.max(x * pageW, 0), Math.max(pageW - wCadre, 0));
    const yCadreHaut = Math.min(Math.max(y * pageH, 0), Math.max(pageH - hCadre, 0));
    const xPt = xCadre + (wCadre - w) / 2;
    const yPt = pageH - (yCadreHaut + (hCadre - h) / 2) - h;
    page.drawImage(png, { x: xPt, y: yPt, width: w, height: h });

    // Cartouche discret sous la signature (au-dessus si on est au ras du bas).
    const police = await pdf.embedFont(StandardFonts.Helvetica);
    const cartouche = versWinAnsi(
      police,
      `Signé par ${nomSignataire} le ${formatDateTimeFr(maintenant)} — lu et approuvé — via ExtraBat`,
    );
    const taillePolice = 7;
    const largeurTexte = police.widthOfTextAtSize(cartouche, taillePolice);
    const xTexte = Math.min(Math.max(xPt, 2), Math.max(pageW - largeurTexte - 2, 2));
    const yTexte = yPt - taillePolice - 2 > 2 ? yPt - taillePolice - 2 : yPt + h + 4;
    page.drawText(cartouche, {
      x: xTexte,
      y: yTexte,
      size: taillePolice,
      font: police,
      color: rgb(0.35, 0.35, 0.35),
    });

    signe = await pdf.save();
  } catch (e) {
    console.error(`Signature : échec du tamponnage pdf-lib pour ${doc.id} :`, e);
    return NextResponse.json(
      { error: "Ce PDF n'a pas pu être signé. Prévenez le bureau." },
      { status: 422 },
    );
  }

  // ── Upload de la version signée (l'original reste intact) ─────────────
  const prefixe = prefixeDocumentsASigner(user.organisationId, doc.dossierId);
  const cheminSigne = `${prefixe}${crypto.randomUUID()}-signe.pdf`;
  const upload = await admin.storage
    .from(BUCKET_SINISTRES)
    .upload(cheminSigne, Buffer.from(signe), {
      contentType: "application/pdf",
    });
  if (upload.error) {
    console.error(`Signature : échec de l'upload du PDF signé :`, upload.error);
    return NextResponse.json(
      { error: "Envoi du document signé impossible. Réessayez." },
      { status: 502 },
    );
  }
  const hashSigne = createHash("sha256").update(signe).digest("hex");

  // ── Transaction : le fait « signé », le journal, les notifications ────
  try {
    await prisma.$transaction(async (tx) => {
      // Garde CONDITIONNELLE (concurrence) : deux signatures simultanées ne
      // gagnent qu'une fois — le perdant voit « déjà signé ».
      const { count } = await tx.documentASigner.updateMany({
        where: { id: doc.id, signeLe: null },
        data: {
          signeLe: maintenant,
          cheminSigne,
          hashSigne,
          signeParUserId: user.id,
          nomSignataire,
        },
      });
      if (count === 0) throw new DejaSigne();

      await enregistrerEvenement(tx, {
        dossierId: doc.dossierId,
        type: "DOCUMENT_SIGNE",
        acteurId: user.id,
        meta: { nom: doc.nom, nomSignataire },
      });

      await notifierBackOffice(tx, {
        organisationId: user.organisationId,
        acteurId: user.id,
        type: "DOCUMENT_SIGNE_RECU",
        dossierId: doc.dossierId,
        meta: {
          nomClient: doc.dossier.nomClient,
          adresse: doc.dossier.adresse,
          nomDocument: doc.nom,
          nomSignataire,
        },
      });
    });
  } catch (e) {
    // Perdu la course : on purge NOTRE objet signé orphelin, best-effort.
    try {
      await admin.storage.from(BUCKET_SINISTRES).remove([cheminSigne]);
    } catch {
      /* orphelin assumé */
    }
    if (e instanceof DejaSigne) {
      return NextResponse.json(
        { error: "Ce document est déjà signé." },
        { status: 409 },
      );
    }
    console.error(`Signature : échec de la transaction pour ${doc.id} :`, e);
    return NextResponse.json(
      { error: "Une erreur est survenue. Réessayez." },
      { status: 500 },
    );
  }

  revalidatePath(`/app/dossiers/${doc.dossierId}`);
  if (doc.dossier.chantier) {
    revalidatePath(`/app/mes-chantiers/${doc.dossier.chantier.id}`);
  }
  revalidatePath("/app/mes-chantiers");

  return NextResponse.json({ ok: true });
}

class DejaSigne extends Error {}

// La police standard Helvetica n'encode que WinAnsi (Latin-1 étendu) :
// drawText LEVAIT sur « Ayşe », « Łukasz », « Dvořák »… et la signature du
// client échouait à chaque essai. Chaque caractère non encodable est ramené
// à sa lettre de base (ş → s), à défaut remplacé par « ? ». Le nom complet,
// lui, reste intact en base (nomSignataire).
const SANS_DECOMPOSITION: Record<string, string> = {
  Ł: "L",
  ł: "l",
  ı: "i",
  Đ: "D",
  đ: "d",
  Ħ: "H",
  ħ: "h",
};
function versWinAnsi(police: PDFFont, texte: string): string {
  const encodable = (c: string) => {
    try {
      police.encodeText(c);
      return true;
    } catch {
      return false;
    }
  };
  return Array.from(texte.replace(/\s/g, " "))
    .map((c) => {
      if (encodable(c)) return c;
      const base =
        SANS_DECOMPOSITION[c] ?? c.normalize("NFD").replace(/\p{M}/gu, "");
      return base && encodable(base) ? base : "?";
    })
    .join("");
}
