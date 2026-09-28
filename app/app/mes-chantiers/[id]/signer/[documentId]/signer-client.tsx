"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  PenLine,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { RATIO_CADRE_SIGNATURE } from "@/lib/documents-a-signer";
import { cn } from "@/lib/ui";
import { PadSignature } from "./pad-signature";

// Visionneuse + placement du cadre de signature. pdfjs-dist en import()
// DYNAMIQUE (même discipline que Leaflet : jamais dans le bundle commun — la
// visionneuse ne pèse que sur cette page). Le tap pose le cadre, le glisser
// le déplace, le curseur règle sa largeur ; le pad plein écran recueille le
// tracé du client, puis tout part au Route Handler de tamponnage.

// Ratio hauteur/largeur du cadre : le serveur ajuste le tracé DANS ce cadre
// (aspect conservé) — ce qui est tamponné ne déborde jamais de l'aperçu.
const RATIO_CADRE = RATIO_CADRE_SIGNATURE;
const LARGEUR_DEFAUT = 0.4; // fraction de la largeur de page
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 3;

type Cadre = { x: number; y: number; largeur: number }; // normalisés 0..1

export function SignerDocument({
  documentId,
  chantierId,
  nomClient,
  urlPdf,
}: {
  documentId: string;
  chantierId: string;
  nomClient: string;
  urlPdf: string;
}) {
  const router = useRouter();
  const conteneurRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const renduEnCoursRef = useRef(false);
  const envoiEnCoursRef = useRef(false);
  const renduARefaireRef = useRef(false);
  const rendreRef = useRef<() => Promise<void>>(async () => {});

  const [chargement, setChargement] = useState(true);
  const [erreurPdf, setErreurPdf] = useState(false);
  const [nbPages, setNbPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null); // null = fit-width à calculer
  // Dimensions CSS du canvas rendu — repère de l'overlay de placement.
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [cadre, setCadre] = useState<Cadre | null>(null);
  const [padOuvert, setPadOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  // Glisser du cadre : deltas en cours, appliqués au pointerup.
  const glisserRef = useRef<{
    pointerId: number;
    depart: { x: number; y: number };
    cadreDepart: Cadre;
  } | null>(null);

  // Chargement du document (une fois) — pdfjs et son worker hors bundle commun.
  useEffect(() => {
    let annule = false;
    // La loadingTask porte destroy() (libère le worker) — le document proxy
    // ne l'expose plus dans pdfjs v6.
    let tache: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const loadingTask = pdfjs.getDocument({ url: urlPdf });
        tache = loadingTask;
        const doc = await loadingTask.promise;
        if (annule) return;
        pdfRef.current = doc;
        setNbPages(doc.numPages);
        setChargement(false);
      } catch (e) {
        console.error("Chargement du PDF impossible :", e);
        if (!annule) {
          setErreurPdf(true);
          setChargement(false);
        }
      }
    })();
    return () => {
      annule = true;
      pdfRef.current = null;
      void tache?.destroy().catch(() => {});
    };
  }, [urlPdf]);

  // Rendu de la page courante au zoom courant. Une demande arrivée PENDANT
  // un rendu (double tap sur « Page suivante », zoom) n'est plus perdue : elle
  // est rejouée à la fin avec la page/le zoom à jour. Sans ça, le compteur
  // affichait la page 3 pendant que le canvas montrait la 2 — et la signature
  // placée « sur la 2 » était tamponnée sur la 3.
  const rendre = useCallback(async () => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    const conteneur = conteneurRef.current;
    if (!pdf || !canvas || !conteneur) return;
    if (renduEnCoursRef.current) {
      renduARefaireRef.current = true;
      return;
    }
    renduEnCoursRef.current = true;
    try {
      const pdfPage = await pdf.getPage(page);
      const base = pdfPage.getViewport({ scale: 1 });
      // Premier rendu : zoom « pleine largeur » du conteneur.
      const facteur =
        zoom ?? Math.max(ZOOM_MIN, (conteneur.clientWidth - 2) / base.width);
      if (zoom === null) {
        setZoom(facteur);
      }
      const dpr = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({ scale: facteur * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const cssW = Math.floor(viewport.width / dpr);
      const cssH = Math.floor(viewport.height / dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await pdfPage.render({
        canvas,
        canvasContext: ctx,
        viewport,
      } as unknown as Parameters<typeof pdfPage.render>[0]).promise;
      setDims({ w: cssW, h: cssH });
    } catch (e) {
      console.error("Rendu du PDF impossible :", e);
      setErreurPdf(true);
    } finally {
      renduEnCoursRef.current = false;
      if (renduARefaireRef.current) {
        renduARefaireRef.current = false;
        void rendreRef.current();
      }
    }
  }, [page, zoom]);

  // Toujours la version à jour de rendre() (page/zoom courants) pour le rejeu.
  useEffect(() => {
    rendreRef.current = rendre;
  }, [rendre]);

  useEffect(() => {
    if (!chargement && !erreurPdf) void rendre();
  }, [chargement, erreurPdf, rendre]);

  // ── Placement du cadre ─────────────────────────────────────────────────

  function poserCadre(e: React.MouseEvent<HTMLDivElement>) {
    if (!dims || envoi) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / dims.w;
    const ny = (e.clientY - rect.top) / dims.h;
    const largeur = cadre?.largeur ?? LARGEUR_DEFAUT;
    const hauteur = largeur * RATIO_CADRE * (dims.w / dims.h);
    setCadre({
      largeur,
      x: clamp(nx - largeur / 2, 0, 1 - largeur),
      y: clamp(ny - hauteur / 2, 0, 1 - hauteur),
    });
  }

  function surGlisserDebut(e: React.PointerEvent<HTMLDivElement>) {
    if (!cadre) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    glisserRef.current = {
      pointerId: e.pointerId,
      depart: { x: e.clientX, y: e.clientY },
      cadreDepart: cadre,
    };
  }

  function surGlisser(e: React.PointerEvent<HTMLDivElement>) {
    const g = glisserRef.current;
    if (!g || !dims || g.pointerId !== e.pointerId) return;
    const hauteur = g.cadreDepart.largeur * RATIO_CADRE * (dims.w / dims.h);
    setCadre({
      largeur: g.cadreDepart.largeur,
      x: clamp(
        g.cadreDepart.x + (e.clientX - g.depart.x) / dims.w,
        0,
        1 - g.cadreDepart.largeur,
      ),
      y: clamp(g.cadreDepart.y + (e.clientY - g.depart.y) / dims.h, 0, 1 - hauteur),
    });
  }

  function surGlisserFin() {
    glisserRef.current = null;
  }

  function changerLargeur(valeur: number) {
    if (!cadre || !dims) return;
    const hauteur = valeur * RATIO_CADRE * (dims.w / dims.h);
    setCadre({
      largeur: valeur,
      x: clamp(cadre.x, 0, 1 - valeur),
      y: clamp(cadre.y, 0, 1 - hauteur),
    });
  }

  // ── Envoi ──────────────────────────────────────────────────────────────

  async function envoyer(signature: { blob: Blob; nomSignataire: string }) {
    // Verrou SYNCHRONE : un double tap sur « Valider » produit deux exports
    // PNG dont les rappels arrivent avant que l'état `envoi` ne soit rendu.
    if (!cadre || envoiEnCoursRef.current) return;
    envoiEnCoursRef.current = true;
    setEnvoi(true);
    try {
      const fd = new FormData();
      fd.set("signature", signature.blob, "signature.png");
      fd.set("nomSignataire", signature.nomSignataire);
      fd.set("luEtApprouve", "1");
      fd.set("page", String(page));
      fd.set("x", String(cadre.x));
      fd.set("y", String(cadre.y));
      fd.set("largeur", String(cadre.largeur));

      const res = await fetch(`/api/documents-a-signer/${documentId}/signer`, {
        method: "POST",
        body: fd,
      });
      const corps = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        toast.error(corps?.error ?? "Une erreur est survenue. Réessayez.");
        // Déjà signé ailleurs : l'écran n'a plus de raison d'être.
        if (res.status === 409) {
          setPadOuvert(false);
          router.replace(`/app/mes-chantiers/${chantierId}`);
          router.refresh();
        }
        // Autre refus : le pad reste ouvert, le tracé du client n'est pas
        // perdu — il suffit de réessayer.
        return;
      }
      setPadOuvert(false);
      toast.success("Document signé — le bureau a reçu la version signée.");
      router.replace(`/app/mes-chantiers/${chantierId}`);
      router.refresh();
    } catch {
      // Pad laissé ouvert : on réessaie avec le même tracé.
      toast.error("Réseau indisponible : la signature exige une connexion. Réessayez.");
    } finally {
      envoiEnCoursRef.current = false;
      setEnvoi(false);
    }
  }

  // ── Rendu ──────────────────────────────────────────────────────────────

  if (erreurPdf) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Impossible d&apos;afficher ce PDF. Vérifiez le réseau puis rouvrez cet
        écran — sinon, prévenez le bureau.
      </p>
    );
  }

  const hauteurCadrePx =
    cadre && dims ? cadre.largeur * RATIO_CADRE * dims.w : 0;

  return (
    <div className="space-y-3 pb-8">
      <p className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-900">
        {cadre
          ? "Ajustez le cadre (glisser / curseur), puis tendez le téléphone au client."
          : "Touchez le document à l'endroit où la signature doit apparaître."}
      </p>

      {/* Barre d'outils : zoom + pages. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variante="secondaire"
            taille="sm"
            className="min-h-11"
            aria-label="Zoom arrière"
            disabled={(zoom ?? 1) <= ZOOM_MIN}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, (z ?? 1) - 0.3))}
          >
            <ZoomOut className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variante="secondaire"
            taille="sm"
            className="min-h-11"
            aria-label="Zoom avant"
            disabled={(zoom ?? 1) >= ZOOM_MAX}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, (z ?? 1) + 0.3))}
          >
            <ZoomIn className="size-4" aria-hidden="true" />
          </Button>
        </div>
        {nbPages > 1 && (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variante="secondaire"
              taille="sm"
              className="min-h-11"
              aria-label="Page précédente"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <span className="text-sm text-neutral-600 tabular-nums">
              {page}/{nbPages}
            </span>
            <Button
              type="button"
              variante="secondaire"
              taille="sm"
              className="min-h-11"
              aria-label="Page suivante"
              disabled={page >= nbPages}
              onClick={() => setPage((p) => Math.min(nbPages, p + 1))}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      {/* Le document : scroll libre dans les deux sens, cadre en overlay. */}
      <div
        ref={conteneurRef}
        className="max-h-[65vh] overflow-auto rounded-lg border border-neutral-300 bg-neutral-100 p-1"
      >
        {chargement ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2
              className="size-6 animate-spin text-neutral-400"
              aria-hidden="true"
            />
          </div>
        ) : (
          <div
            className="relative mx-auto w-fit cursor-crosshair"
            onClick={poserCadre}
          >
            <canvas ref={canvasRef} className="block bg-white shadow-sm" />
            {cadre && dims && (
              <div
                role="button"
                aria-label="Cadre de signature (glisser pour déplacer)"
                onPointerDown={surGlisserDebut}
                onPointerMove={surGlisser}
                onPointerUp={surGlisserFin}
                onPointerCancel={surGlisserFin}
                onClick={(e) => e.stopPropagation()}
                className="absolute flex cursor-move touch-none items-center justify-center rounded-sm border-2 border-dashed border-primary-600 bg-primary-100/40"
                style={{
                  left: cadre.x * dims.w,
                  top: cadre.y * dims.h,
                  width: cadre.largeur * dims.w,
                  height: hauteurCadrePx,
                }}
              >
                <span className="flex items-center gap-1 rounded bg-primary-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  <PenLine className="size-3" aria-hidden="true" />
                  Signature ici
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Taille du cadre, uniquement une fois posé. */}
      {cadre && (
        <label className="flex items-center gap-3 text-sm text-neutral-700">
          <span className="shrink-0">Taille</span>
          <input
            type="range"
            min={0.2}
            max={0.7}
            step={0.05}
            value={cadre.largeur}
            onChange={(e) => changerLargeur(Number(e.target.value))}
            className="w-full accent-primary-600"
          />
        </label>
      )}

      <Button
        type="button"
        taille="pouce"
        className={cn("w-full", !cadre && "opacity-60")}
        disabled={!cadre || envoi || chargement}
        onClick={() => setPadOuvert(true)}
      >
        {envoi ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <PenLine className="size-5" aria-hidden="true" />
        )}
        {envoi ? "Envoi…" : `Faire signer ${nomClient}`}
      </Button>

      {padOuvert && (
        <PadSignature
          envoi={envoi}
          onFermer={() => setPadOuvert(false)}
          onValider={(signature) => void envoyer(signature)}
        />
      )}
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max));
}
